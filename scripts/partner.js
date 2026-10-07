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
     node scripts/partner.js origins <id> --origin https://club.example [--origin ...] [--allow-localhost]   IMPOSTA l'elenco (sostituisce le origini attuali)
     node scripts/partner.js origins <id> --add --origin https://altro.example                            aggiunge alle origini attuali
     node scripts/partner.js origins <id> --clear                                                        le toglie tutte
     node scripts/partner.js theme <id> [--accent #aabbcc] [--bg #rrggbb] [--ink #rrggbb] [--font system|serif|rounded|mono]
                             [--title "Titolo"] [--logo https://...png] [--clear]
     node scripts/partner.js settings <id> [--name N] [--modes smart,full] [--default-mode smart|full] [--lang it|en]
     node scripts/partner.js rotate-secret <id>
     node scripts/partner.js rotate-key <id>
     node scripts/partner.js recount <id> <degustazione>      ricalcola somma e conteggio dai voti veri (riparazione)
     node scripts/partner.js purge <id> --yes                 cancella TUTTI i dati di team del partner (non la sua configurazione)
     node scripts/partner.js token <id> --sub <utente> --team <team> [--role member|organizer] [--name N] [--lang it|en]

   Il segreto di firma e la chiave API compaiono UNA volta sola, alla creazione
   o alla rotazione: la chiave API si salva solo come hash e non si può rileggere.
   Le modifiche arrivano alle funzioni in esecuzione entro un minuto (elenco dei partner in memoria). */
const crypto = require("crypto");
const P = require("../api/_partner");
const jwt = require("../api/_jwt");
const Team = require("../api/_team");

function parseArgs(argv) {
  const pos = [], opt = { origin: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      if (k === "allow-localhost" || k === "clear" || k === "yes" || k === "add") { opt[k] = true; continue; }
      const v = argv[++i];
      /* "--name --origin x": il valore mancante non deve scambiarsi con l'opzione che segue */
      if (v === undefined || v.startsWith("--")) throw new Error("manca il valore di --" + k);
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
function checkLang(v) {
  if (v !== "it" && v !== "en") throw new Error("--lang: it oppure en");
  return v;
}
function checkDefaultMode(v) {
  if (v !== "smart" && v !== "full") throw new Error("--default-mode: smart oppure full");
  return v;
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
  const KNOWN = ["create", "list", "show", "enable", "disable", "origins", "theme", "settings", "rotate-secret", "rotate-key", "token", "recount", "purge"];
  if (KNOWN.indexOf(cmd) < 0) throw new Error("comando sconosciuto: " + (cmd || "(nessuno)") + ". Vedi l'intestazione di scripts/partner.js.");
  /* un'opzione che il comando non conosce (un refuso, o una che non fa nulla) è un errore, non un'azione a vuoto */
  const AMMESSE = {
    create: ["name", "origin", "modes", "default-mode", "lang", "allow-localhost"], origins: ["origin", "allow-localhost", "clear", "add"],
    theme: ["accent", "bg", "ink", "font", "title", "logo", "clear"], settings: ["name", "modes", "default-mode", "lang"],
    token: ["sub", "team", "role", "name", "lang"], purge: ["yes"]
  };
  const ok = AMMESSE[cmd] || [];
  Object.keys(opt).filter(k => k !== "origin" || opt.origin.length).forEach(k => {
    if (ok.indexOf(k) < 0) throw new Error("l'opzione --" + k + " non esiste per \"" + cmd + "\"" + (ok.length ? " (valide: " + ok.map(x => "--" + x).join(" ") + ")" : ""));
  });

  if (cmd === "create") {
    if (!P.validId(id)) throw new Error("id non valido: minuscole, cifre e trattini in mezzo, 2-31 caratteri (niente trattino all'inizio, alla fine o doppio)");
    if (!opt.name) throw new Error("serve --name");
    const sig = secret(), apiKey = P.newApiKey(id);
    const cfg = {
      id, name: String(opt.name).slice(0, 60), active: true, secret: sig, apiKeyHash: P.sha256(apiKey),
      origins: checkOrigins(opt.origin, opt["allow-localhost"]), modes: checkModes(opt.modes || "smart,full"),
      defaultMode: opt["default-mode"] ? checkDefaultMode(opt["default-mode"]) : "smart", lang: opt.lang ? checkLang(opt.lang) : "it",
      theme: {}, createdAt: new Date().toISOString()
    };
    if (opt["allow-localhost"]) cfg.allowLocalhost = true;
    /* SET NX: se due persone creano lo stesso partner insieme, ne vince una sola e all'altra viene
       detto che esiste già (prima l'una sovrascriveva l'altra e restava con credenziali già morte) */
    const scritto = await redis.set("p:" + id, JSON.stringify(cfg), { nx: true });
    if (scritto !== "OK") throw new Error("il partner esiste già: " + id);
    await redis.sadd("partners", id);
    log("Partner creato: " + id);
    if (!cfg.origins.length) log("Attenzione: nessuna origine registrata, quindi nessun sito può incorporare lo spazio. Aggiungila con: origins " + id + " --add --origin https://...");
    log("");
    log("  ID partner (iss):   " + id);
    log("  Segreto di firma:   " + sig);
    log("  Chiave API (sola lettura): " + apiKey);
    log("");
    log("Conservali ora: il segreto e la chiave non si possono rileggere (la chiave è salvata solo come hash).");
    log("Il nuovo partner compare nelle funzioni entro 10 secondi.");
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
    if (!opt.origin.length && !opt.clear) throw new Error("serve almeno un --origin (oppure --clear per toglierle tutte: nessun sito potrebbe più incorporare lo spazio)");
    if (opt.clear && (opt.origin.length || opt.add)) throw new Error("--clear non si combina con --origin né con --add");
    if (opt["allow-localhost"]) cfg.allowLocalhost = true;
    const prima = cfg.origins || [];
    const nuove = checkOrigins(opt.origin, cfg.allowLocalhost === true);
    cfg.origins = opt.add ? prima.concat(nuove.filter(o => prima.indexOf(o) < 0)) : nuove;
    await save(redis, cfg);
    log("Origini prima: " + (prima.join(", ") || "(nessuna)"));
    log("Origini ora:   " + (cfg.origins.join(", ") || "(nessuna)") + (opt.add ? "" : "   (elenco sostituito; per aggiungere usa --add)")); return;
  }
  if (cmd === "theme") {
    const t = opt.clear ? {} : Object.assign({}, cfg.theme);
    ["accent", "bg", "ink", "font", "title", "logo"].forEach(k => { if (opt[k] !== undefined) t[k] = opt[k]; });
    const clean = P.sanitizeTheme(t);
    const scartati = Object.keys(t).filter(k => clean[k] === undefined);
    if (scartati.length) throw new Error("valori non validi per: " + scartati.join(", ") + " (colori #rrggbb, font " + Object.keys(P.FONTS).join("/") + ", logo https)");
    cfg.theme = clean; await save(redis, cfg); log("Tema: " + JSON.stringify(clean));
    const r = P.resolveTheme(clean);
    if (r) {
      const diversi = ["accent", "bg", "ink"].filter(k => clean[k] && clean[k] !== r[k === "accent" ? "--accent" : k === "bg" ? "--bg" : "--ink"]);
      log("Tavolozza calcolata (testo ≥ 4,5:1, accento ≥ 3:1): " + ["--bg", "--ink", "--accent", "--on-accent", "--surface", "--muted"].map(k => k + " " + r[k]).join("  "));
      if (diversi.length) log("Attenzione: per essere leggibili sono stati corretti: " + diversi.join(", ") + ". Con un colore scelto il tema non segue più il chiaro/scuro del dispositivo.");
      else log("Con un colore scelto il tema non segue più il chiaro/scuro del dispositivo.");
    }
    return;
  }
  if (cmd === "settings") {
    if (opt.name) cfg.name = String(opt.name).slice(0, 60);
    if (opt.modes) cfg.modes = checkModes(opt.modes);
    if (opt["default-mode"]) cfg.defaultMode = checkDefaultMode(opt["default-mode"]);
    if (opt.lang) cfg.lang = checkLang(opt.lang);
    await save(redis, cfg); log(JSON.stringify(publicView(cfg), null, 2)); return;
  }
  if (cmd === "rotate-secret") {
    cfg.secret = secret(); await save(redis, cfg);
    log("Nuovo segreto di firma: " + cfg.secret);
    log("Le sessioni aperte e i token firmati col vecchio segreto smettono di valere entro un minuto.");
    return;
  }
  if (cmd === "rotate-key") {
    const k = P.newApiKey(id); cfg.apiKeyHash = P.sha256(k); await save(redis, cfg);
    log("Nuova chiave API: " + k); log("La vecchia chiave smette di valere entro un minuto."); return;
  }
  if (cmd === "recount") {
    const out = await Team.recount(redis, id, pos[2]);
    out.forEach(r => log("vino " + r.wine + ": " + r.votes + " voti, somma " + r.sum));
    log(out.length ? "Somma e conteggio ricalcolati dai voti veri." : "Nessun vino in quella degustazione.");
    return;
  }
  if (cmd === "purge") {
    if (!opt.yes) throw new Error("operazione irreversibile: cancella tutte le degustazioni, i vini e i voti di " + id + ". Ripeti con --yes per confermare");
    const modelli = ["tl:" + id + ":*", "wn:" + id + ":*", "vt:" + id + ":*", "vs:" + id + ":*", "sm:" + id + ":*", "ct:" + id + ":*", "uv:" + id + ":*"];      // i jti non si toccano: scadono da soli, e cancellarli farebbe riusare i token già usati
    const fissi = ["ti:" + id, "tm:" + id, "cn:" + id];
    let chiavi = fissi.slice();
    for (const m of modelli) chiavi = chiavi.concat((await redis.keys(m)) || []);
    for (let i = 0; i < chiavi.length; i += 100) await redis.del(...chiavi.slice(i, i + 100));
    log("Cancellate " + chiavi.length + " chiavi di dati di " + id + ". La configurazione del partner resta.");
    return;
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
