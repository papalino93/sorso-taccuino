/* Gli esempi di codice della guida per il partner devono funzionare davvero:
   si eseguono qui contro il server locale. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile, spawnSync } = require("node:child_process");
const { promisify } = require("node:util");
/* asincrono: il server locale gira in questo stesso processo e non deve restare bloccato */
const run = async (cmd, args, opts) => (await promisify(execFile)(cmd, args, opts)).stdout;
const path = require("node:path");
const dev = require("./helpers/dev-server");
const P = require("../api/_partner");
const { getRedis } = require("../api/_redis");

const ESEMPI = path.join(__dirname, "../docs/esempi");
let d;

test.before(async () => { d = await dev.start({ secret: "e".repeat(64), origins: ["https://sito.example"] }); });
test.after(async () => { await d.stop(); });

const env = () => Object.assign({}, process.env, { SORSO_PARTNER_ID: "demo", SORSO_SECRET: d.secret, SORSO_BASE: d.url, SORSO_API_KEY: d.apiKey });
const has = cmd => spawnSync("which", [cmd]).status === 0;

async function verifica(token, atteso) {
  P.clearCache();
  const r = await P.verifyPartnerToken(getRedis(), token.trim());
  assert.deepEqual([r.ctx.uid, r.ctx.team, r.ctx.role, r.ctx.name], atteso);
  assert.ok(r.exp - Date.now() / 1000 <= 301 && r.exp - Date.now() / 1000 > 250, "scade fra circa 5 minuti");
}

test("esempio Node: il token è accettato", async () => {
  const t = await run("node", [path.join(ESEMPI, "firma-token.js"), "anna@club.it", "giovedi", "organizer", "Anna Rossi"], { env: env() });
  await verifica(t, ["anna@club.it", "giovedi", "organizer", "Anna Rossi"]);
});
test("esempio Python: il token è accettato", { skip: !has("python3") }, async () => {
  const t = await run("python3", [path.join(ESEMPI, "firma-token.py"), "marco", "giovedi", "member", "Marco Bianchi"], { env: env() });
  await verifica(t, ["marco", "giovedi", "member", "Marco Bianchi"]);
});
test("esempio PHP: il token è accettato", { skip: !has("php") }, async () => {
  const t = await run("php", [path.join(ESEMPI, "firma-token.php"), "sara", "giovedi", "member", "Sara Verdi"], { env: env() });
  await verifica(t, ["sara", "giovedi", "member", "Sara Verdi"]);
});
test("i token degli esempi si possono usare per aprire una sessione, una volta sola", async () => {
  const t = (await run("node", [path.join(ESEMPI, "firma-token.js"), "u-sessione", "giovedi"], { env: env() })).trim();
  const call = () => fetch(d.url + "/api/embed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "session", token: t }) });
  assert.equal((await call()).status, 200);
  assert.equal((await call()).status, 401);
});
test("esempi curl: girano e rispondono come descritto", { skip: !has("curl") }, async () => {
  const out = await run("sh", [path.join(ESEMPI, "api.sh")], { env: env(), cwd: require("node:os").tmpdir() });
  assert.match(out, /^\{"tastings":\[\]\}/);                       // l'elenco, vuoto
  assert.match(out, /"code":"not_found"/);                         // degustazione di esempio inesistente
  assert.match(out, /"votesRemoved":0/);                       // cancellazione utente senza voti
});

/* Le guide PDF dichiarano limiti e durate: devono coincidere con il codice. */
test("la guida dice gli stessi numeri del codice", () => {
  const fs = require("node:fs");
  const guida = ["integrazione.js", "attivazione.js", "gestore.js"].map(f => fs.readFileSync(path.join(__dirname, "../docs/guide", f), "utf8")).join("\n");
  const Team = require("../api/_team");
  const Partner = require("../api/_partner");
  const Quota = require("../api/_quota");
  assert.ok(guida.includes(Team.MAX_TASTINGS_PER_TEAM + " degustazioni per team"), "tetto delle degustazioni");
  assert.ok(guida.includes(Team.MAX_WINES + " vini per degustazione"), "tetto dei vini");
  assert.ok(guida.includes("<code>minVotes</code>") && guida.includes("= " + Team.MIN_VOTES_API + ")"), "soglia della media nell'API");
  assert.equal(Partner.SESSION_TTL_SECONDS, 4 * 3600);
  assert.ok(guida.includes("sessione di 4 ore"), "durata della sessione");
  assert.match(fs.readFileSync(path.join(__dirname, "../api/_partner.js"), "utf8"), /REGISTRY_TTL_MS = 60 \* 1000/);
  assert.ok(guida.includes("entro 60 secondi"), "tempo di rotazione delle chiavi");
  assert.ok(guida.includes("al massimo 15 minuti"), "scadenza massima del token");
  assert.ok(guida.includes("All'" + Quota.WARN_AT * 100 + "%") && guida.includes("oltre il " + Quota.READONLY_AT * 100 + "%"), "soglie della quota");
  const embedSrc = fs.readFileSync(path.join(__dirname, "../api/embed.js"), "utf8");
  const perIp = /SESSIONS_PER_IP = (\d+)/.exec(embedSrc)[1], perUtente = /OPS_PER_USER = (\d+)/.exec(embedSrc)[1];
  assert.ok(guida.includes(perIp + " al minuto per indirizzo IP") && guida.includes(perUtente + " al minuto per utente") && guida.includes("120 richieste al minuto per chiave"), "limiti di richieste");
  for (const nome of ["firma-token.js", "firma-token.py", "firma-token.php", "api.sh", "pagina-ospite.html", "risposte.json"]) {
    assert.ok(guida.includes(nome), nome + " usato nella guida");
  }
  for (const claim of ["iss", "sub", "team", "jti", "exp", "role", "name", "lang", "mode"]) assert.ok(guida.includes("<code>" + claim + "</code>"), "claim " + claim);
});
test("le guide PDF esistono e portano la versione corrente", () => {
  const fs = require("node:fs"), { execFileSync } = require("node:child_process");
  const V = require("../public/js/version.js");
  for (const f of ["guida-integrazione-sorso.pdf", "guida-gestione-degustazioni.pdf", "guida-attivazione-api.pdf", "guida-uso-sorso.pdf", "guida-cerchie.pdf"]) {
    const file = path.join(__dirname, "../docs", f);
    assert.ok(fs.existsSync(file), f);
    let testo = "";
    try { testo = execFileSync("pdftotext", [file, "-"], { encoding: "utf8" }); } catch (e) { return; }   // senza pdftotext non si controlla il testo
    assert.ok(testo.includes("v" + V.version) || testo.includes("Versione " + V.version) || testo.includes(V.version), f + " porta la versione " + V.version);
  }
});
