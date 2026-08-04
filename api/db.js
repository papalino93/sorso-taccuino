const { getRedis } = require("./_redis");

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

module.exports = async (req, res) => {
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
    if (op === "get") {
      if (!key) { res.status(400).json({ error: "Manca la chiave." }); return; }
      const value = await redis.get(nsKey(username, key, shared));
      res.status(200).json(value === null ? null : { key, value, shared });
      return;
    }

    if (op === "set") {
      if (!key) { res.status(400).json({ error: "Manca la chiave." }); return; }
      const value = typeof body.value === "string" ? body.value : JSON.stringify(body.value);
      await redis.set(nsKey(username, key, shared), value);
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
      const prefix = body.prefix || "";
      const base = shared ? "shared:" : "u:" + username + ":";
      const pattern = base + prefix + "*";
      const full = await redis.keys(pattern);
      const keys = (full || []).map((k) => k.slice(base.length));
      res.status(200).json({ keys, prefix, shared });
      return;
    }

    res.status(400).json({ error: "Operazione non valida." });
  } catch (e) {
    res.status(500).json({ error: "Errore del server: " + (e && e.message ? e.message : "sconosciuto") });
  }
};
