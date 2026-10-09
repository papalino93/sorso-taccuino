const Quota = require("./_quota");
const { getRedis } = require("./_redis");
const limit = require("./_limit");
const { cleanText } = require("./_http");

/* Proxy generico chiave-valore usato dal modulo DB del frontend.
   Ogni richiesta è autenticata da un token di sessione; le chiavi
   private vengono namespaced sotto l'utente, quelle condivise sotto
   un prefisso comune a tutti gli utenti autenticati. */

async function usernameFromToken(redis, token) {
  if (!token) return null;
  const uname = await redis.get("session:" + token);
  return uname || null;
}

function nsKey(username, key, shared) {
  return shared ? "shared:" + key : "u:" + username + ":" + key;
}

/* Lo spazio "condiviso" serve solo agli eventi dell'app personale e ha regole strette:
   - si possono toccare solo due tipi di chiavi: l'indice degli eventi e i voti di un evento;
   - un voto si scrive una volta sola e non si cancella né si sovrascrive;
   - l'indice si può soltanto allungare: le voci già presenti non si modificano né si tolgono;
   - chi scrive ha un limite orario, e nessuno può mettere nel nome di un altro. */
const SHARED_INDEX = "eventi-indice";
const SHARED_VOTE = /^evento:[a-z0-9-]{1,60}:[0-9]{10,14}-[a-z0-9]{1,8}$/;
const SHARED_PREFIX = /^evento:[a-z0-9-]{1,60}:$/;
const SLUG = /^[a-z0-9-]{1,60}$/;
const MAX_EVENTS = 1000, MAX_SHARED_WRITES_PER_HOUR = 120, MAX_LIST = 2000;

function sharedKeyAllowed(key) { return typeof key === "string" && (key === SHARED_INDEX || SHARED_VOTE.test(key)); }

/* SCAN al posto di KEYS: KEYS legge tutte le chiavi del database (anche quelle degli altri servizi)
   e blocca tutti gli altri; SCAN lo fa a pezzi, con un tetto. */
function globEscape(s) { return String(s).replace(/[\\*?\[\]]/g, "\\$&"); }
async function scanKeys(redis, pattern) {
  const out = [];
  let cursor = "0";
  for (let i = 0; i < 50; i++) {
    const r = await redis.scan(cursor, { match: pattern, count: 500 });
    cursor = String(r[0]);
    (r[1] || []).forEach(k => { if (out.length < MAX_LIST) out.push(k); });
    if (cursor === "0" || out.length >= MAX_LIST) break;
  }
  return out;
}

/* l'indice degli eventi: si accetta l'elenco inviato, ma conta solo ciò che è nuovo */
function mergeIndex(existingRaw, submittedRaw, username) {
  let existing = [];
  try { const e = JSON.parse(existingRaw); if (Array.isArray(e)) existing = e; } catch (e) { existing = []; }
  let sub;
  try { sub = JSON.parse(submittedRaw); } catch (e) { return null; }
  if (!Array.isArray(sub) || sub.length > MAX_EVENTS) return null;
  const known = new Set(existing.map(x => x && x.slug));
  const out = existing.slice();
  for (const x of sub) {
    if (!x || typeof x !== "object" || typeof x.slug !== "string" || !SLUG.test(x.slug) || known.has(x.slug)) continue;
    if (out.length >= MAX_EVENTS) break;
    const name = cleanText(x.name, 48);
    if (!name) continue;
    known.add(x.slug);
    out.push({ name, slug: x.slug, owner: x.owner ? username : null });
  }
  return out;
}

module.exports = Quota.wrap(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Metodo non consentito" });
    return;
  }

  let redis;
  try {
    redis = getRedis();
  } catch (e) {
    res.status(503).json({ error: e.message });
    return;
  }

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  let username;
  try {
    username = await usernameFromToken(redis, token);
  } catch (e) {
    res.status(500).json({ error: "Errore di sessione." });
    return;
  }
  if (!username) {
    res.status(401).json({ error: "Sessione scaduta, accedi di nuovo." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const op = body.op;
  const shared = !!body.shared;
  const key = body.key;

  try {
    if (shared && (op === "get" || op === "set" || op === "delete") && !sharedKeyAllowed(key)) {
      res.status(403).json({ error: "Chiave condivisa non consentita." }); return;
    }
    if (shared && op === "delete") { res.status(403).json({ error: "Nello spazio condiviso non si cancella." }); return; }
    if (shared && op === "set") {
      const rl = await limit.hit(redis, "dbs:" + username, MAX_SHARED_WRITES_PER_HOUR, 3600);
      if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); res.status(429).json({ error: "Troppe scritture: riprova più tardi." }); return; }
    }

    if (op === "get") {
      if (!key) { res.status(400).json({ error: "Manca la chiave." }); return; }
      const value = await redis.get(nsKey(username, key, shared));
      res.status(200).json(value === null ? null : { key, value, shared });
      return;
    }

    if (op === "set") {
      if (!key) { res.status(400).json({ error: "Manca la chiave." }); return; }
      let value = typeof body.value === "string" ? body.value : JSON.stringify(body.value);
      if (shared) {
        if (key === SHARED_INDEX) {
          const cur = await redis.get(nsKey(username, key, true));
          const merged = mergeIndex(cur, value, username);
          if (!merged) { res.status(400).json({ error: "Indice non valido." }); return; }
          value = JSON.stringify(merged);
          await redis.set(nsKey(username, key, true), value);
        } else {
          /* un voto di evento: un oggetto piccolo, scritto una volta sola */
          let v; try { v = JSON.parse(value); } catch (e) { v = null; }
          if (!v || typeof v !== "object" || Array.isArray(v) || value.length > 1000 || typeof v.wineLabel !== "string" || !(Number(v.score) >= 0 && Number(v.score) <= 100)) {
            res.status(400).json({ error: "Voto non valido." }); return;
          }
          /* si salvano solo i campi previsti: nessuno può aggiungere un'identità finta */
          value = JSON.stringify({ wineLabel: cleanText(v.wineLabel, 200), score: Number(v.score), scale: Number(v.scale) || 2, ts: Number(v.ts) || Date.now() });
          const ok = await redis.set(nsKey(username, key, true), value, { nx: true });
          if (!ok) { res.status(409).json({ error: "Voto già presente." }); return; }
          /* l'elenco dei voti di un evento si tiene in un insieme: così leggerli costa un comando, non una scansione */
          await redis.sadd("shared-idx:" + key.split(":")[1], key);
        }
      } else {
        await redis.set(nsKey(username, key, false), value);
      }
      res.status(200).json({ key, value, shared });
      return;
    }

    if (op === "delete") {
      if (!key) { res.status(400).json({ error: "Manca la chiave." }); return; }
      await redis.del(nsKey(username, key, shared));
      res.status(200).json({ key, deleted: true, shared });
      return;
    }

    if (op === "list") {
      const prefix = typeof body.prefix === "string" ? body.prefix : "";
      if (shared && !SHARED_PREFIX.test(prefix)) { res.status(403).json({ error: "Prefisso condiviso non consentito." }); return; }
      const base = shared ? "shared:" : "u:" + username + ":";
      const pattern = globEscape(base + prefix) + "*";
      let full;
      if (shared) {
        const rl = await limit.hit(redis, "dbl:" + username, 120, 3600);
        if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); res.status(429).json({ error: "Troppe richieste: riprova più tardi." }); return; }
        const slug = prefix.split(":")[1];
        const idx = ((await redis.smembers("shared-idx:" + slug)) || []).map(String);
        if (idx.length) full = idx.map(k => "shared:" + k);
        else {
          /* eventi più vecchi: si scandisce una volta e si costruisce l'insieme */
          full = await scanKeys(redis, pattern);
          if (full.length) await redis.sadd("shared-idx:" + slug, ...full.map(k => k.slice("shared:".length)));
        }
      } else full = await scanKeys(redis, pattern);
      const keys = (full || []).map((k) => k.slice(base.length));
      res.status(200).json({ keys, prefix, shared });
      return;
    }

    res.status(400).json({ error: "Operazione non valida." });
  } catch (e) {
    res.status(500).json({ error: "Errore del server: " + (e && e.message ? e.message : "sconosciuto") });
  }
});
