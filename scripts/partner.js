#!/usr/bin/env node
/* Gestione dei siti partner dello spazio di team.

   Serve il database Redis del progetto: esporta le stesse variabili di Vercel
   (KV_REST_API_URL e KV_REST_API_TOKEN, oppure UPSTASH_REDIS_REST_URL e
   UPSTASH_REDIS_REST_TOKEN) prima di lanciarlo.

   Uso:
     node scripts/partner.js create <id> --name "Club Vini" --origin https://club.example [--origin ...]
                             [--modes smart,full] [--default-mode smart|full] [--lang it|en] [--allow-localhost]
     node scripts/partner.js list
     node scripts/partner.js show <id>
     node scripts/partner.js enable|disable <id>
     node scripts/partner.js origins <id> --origin https://club.example [--origin ...] [--allow-localhost]
     node scripts/partner.js theme <id> [--accent #aabbcc] [--bg #rrggbb] [--ink #rrggbb] [--font system|serif|rounded|mono]
                             [--title "Titolo"] [--logo https://...png] [--clear]
     node scripts/partner.js settings <id> [--name N] [--modes smart,full] [--default-mode smart|full] [--lang it|en]
     node scripts/partner.js rotate-secret <id>
     node scripts/partner.js rotate-key <id>
     node scripts/partner.js token <id> --sub <utente> --team <team> [--role member|organizer] [--name N] [--lang it|en]

   Il segreto di firma e la chiave API compaiono UNA volta sola, alla creazione
   o alla rotazione: la chiave API si salva solo come hash e non si può rileggere.
   Le modifiche arrivano alle funzioni in esecuzione entro 30 secondi (cache). */
const crypto = require("crypto");
const P = require("../api/_partner");
const jwt = require("../api/_jwt");

function parseArgs(argv) {
  const pos = [], opt = { origin: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      if (k === "allow-localhost" || k === "clear") { opt[k] = true; continue; }
      const v = argv[++i];
      if (v === undefined) throw new Error("manca il valore di --" + k);
      if (k === "origin") opt.origin.push(v); else opt[k] = v;
    } else pos.push(a);
  }
  return { pos, opt };
}

const secret = () => crypto.randomBytes(32).toString("hex");

function checkOrigins(list, allowLocalhost) {
  const out = [];
  list.forEach(o => {
    const n = P.normalizeOrigin(o, allowLocalhost);
    if (!n) throw new Error("origine non valida: " + o + " (serve https://dominio, senza percorso; http solo per localhost con --allow-localhost)");
    if (out.indexOf(n) < 0) out.push(n);
  });
  return out;
}
function checkModes(s) {
  const m = String(s).split(",").map(x => x.trim()).filter(Boolean);
  if (!m.length || m.some(x => x !== "smart" && x !== "full")) throw new Error("--modes: smart, full oppure smart,full");
  return m;
}
const publicView = c => Object.assign({}, c, { secret: undefined, apiKeyHash: undefined, hasApiKey: !!c.apiKeyHash });

async function load(redis, id) {
  if (!P.validId(id)) throw new Error("id non valido: minuscole, cifre e trattini, 2-31 caratteri, deve iniziare con lettera o cifra");
  const raw = await redis.get("p:" + id);
  if (!raw) throw new Error("partner inesistente: " + id);
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}
const save = (redis, cfg) => redis.set("p:" + cfg.id, JSON.stringify(cfg));

async function main(argv, redis, log) {
  const { pos, opt } = parseArgs(argv);
  const cmd = pos[0], id = pos[1];
  P.clearCache();
  const KNOWN = ["create", "list", "show", "enable", "disable", "origins", "theme", "settings", "rotate-secret", "rotate-key", "token"];
  if (KNOWN.indexOf(cmd) < 0) throw new Error("comando sconosciuto: " + (cmd || "(nessuno)") + ". Vedi l'intestazione di scripts/partner.js.");

  if (cmd === "create") {
    if (!P.validId(id)) throw new Error("id non valido: minuscole, cifre e trattini, 2-31 caratteri");
    if (!opt.name) throw new Error("serve --name");
    if (await redis.get("p:" + id)) throw new Error("il partner esiste già: " + id);
    const sig = secret(), apiKey = P.newApiKey(id);
    const cfg = {
      id, name: String(opt.name).slice(0, 60), active: true, secret: sig, apiKeyHash: P.sha256(apiKey),
      origins: checkOrigins(opt.origin, opt["allow-localhost"]), modes: checkModes(opt.modes || "smart,full"),
      defaultMode: opt["default-mode"] === "full" ? "full" : "smart", lang: opt.lang === "en" ? "en" : "it",
      theme: {}, createdAt: new Date().toISOString()
    };
    await save(redis, cfg);
    await redis.sadd("partners", id);
    log("Partner creato: " + id);
    if (!cfg.origins.length) log("Attenzione: nessuna origine registrata, quindi nessun sito può incorporare lo spazio. Aggiungila con: origins " + id + " --origin https://...");
    log("");
    log("  ID partner (iss):   " + id);
    log("  Segreto di firma:   " + sig);
    log("  Chiave API (sola lettura): " + apiKey);
    log("");
    log("Conservali ora: il segreto e la chiave non si possono rileggere (la chiave è salvata solo come hash).");
    return;
  }
  if (cmd === "list") {
    const ids = ((await redis.smembers("partners")) || []).sort();
    if (!ids.length) log("Nessun partner.");
    for (const x of ids) {
      const c = await load(redis, x).catch(() => null);
      log((c ? (c.active === false ? "[disattivato] " : "") : "[mancante] ") + x + (c ? "  " + c.name + "  origini: " + (c.origins.join(", ") || "-") : ""));
    }
    return;
  }
  const cfg = await load(redis, id);
  if (cmd === "show") { log(JSON.stringify(publicView(cfg), null, 2)); return; }
  if (cmd === "enable" || cmd === "disable") { cfg.active = cmd === "enable"; await save(redis, cfg); log((cfg.active ? "Attivato: " : "Disattivato: ") + id); return; }
  if (cmd === "origins") {
    cfg.origins = checkOrigins(opt.origin, opt["allow-localhost"]);
    await save(redis, cfg); log("Origini: " + (cfg.origins.join(", ") || "(nessuna)")); return;
  }
  if (cmd === "theme") {
    const t = opt.clear ? {} : Object.assign({}, cfg.theme);
    ["accent", "bg", "ink", "font", "title", "logo"].forEach(k => { if (opt[k] !== undefined) t[k] = opt[k]; });
    const clean = P.sanitizeTheme(t);
    const scartati = Object.keys(t).filter(k => clean[k] === undefined);
    if (scartati.length) throw new Error("valori non validi per: " + scartati.join(", ") + " (colori #rrggbb, font " + Object.keys(P.FONTS).join("/") + ", logo https)");
    cfg.theme = clean; await save(redis, cfg); log("Tema: " + JSON.stringify(clean)); return;
  }
  if (cmd === "settings") {
    if (opt.name) cfg.name = String(opt.name).slice(0, 60);
    if (opt.modes) cfg.modes = checkModes(opt.modes);
    if (opt["default-mode"]) cfg.defaultMode = opt["default-mode"] === "full" ? "full" : "smart";
    if (opt.lang) cfg.lang = opt.lang === "en" ? "en" : "it";
    await save(redis, cfg); log(JSON.stringify(publicView(cfg), null, 2)); return;
  }
  if (cmd === "rotate-secret") {
    cfg.secret = secret(); await save(redis, cfg);
    log("Nuovo segreto di firma: " + cfg.secret);
    log("Le sessioni aperte e i token firmati col vecchio segreto smettono di valere entro 30 secondi.");
    return;
  }
  if (cmd === "rotate-key") {
    const k = P.newApiKey(id); cfg.apiKeyHash = P.sha256(k); await save(redis, cfg);
    log("Nuova chiave API: " + k); log("La vecchia chiave smette di valere entro 30 secondi."); return;
  }
  if (cmd === "token") {
    if (!opt.sub || !opt.team) throw new Error("servono --sub e --team");
    const claims = { iss: id, sub: opt.sub, team: opt.team, role: opt.role || "member", name: opt.name || "", jti: "t-" + crypto.randomBytes(8).toString("hex"), exp: Math.floor(Date.now() / 1000) + 600 };
    if (opt.lang) claims.lang = opt.lang;
    const tk = jwt.sign(claims, cfg.secret);
    P.validId(id); // già controllato da load()
    await P.verifyPartnerToken(redis, tk);
    log(tk); log("(valido 10 minuti, monouso)"); return;
  }
}

module.exports = { main, parseArgs };

if (require.main === module) {
  const { getRedis } = require("../api/_redis");
  let redis;
  try { redis = getRedis(); } catch (e) { console.error(e.message); process.exit(2); }
  main(process.argv.slice(2), redis, console.log).catch(e => { console.error("Errore: " + e.message); process.exit(1); });
}
