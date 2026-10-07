const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { setup, call, finestraSicura } = require("./helpers/env");
const jwt = require("../api/_jwt");
const P = require("../api/_partner");
const quota = require("../api/_quota");
const Team = require("../api/_team");
const { getRedis } = require("../api/_redis");
const embed = require("../api/embed");

let srv, redis;
const SECRET = crypto.randomBytes(32).toString("hex");
const now = () => Math.floor(Date.now() / 1000);

async function putPartner(id, extra) {
  const cfg = Object.assign({ id, name: id, active: true, secret: SECRET, apiKeyHash: "x", origins: [], modes: ["smart", "full"] }, extra);
  await redis.sadd("partners", id);
  await redis.set("p:" + id, JSON.stringify(cfg));
  P.clearCache();
  return cfg;
}
function token(o) {
  return jwt.sign(Object.assign({ iss: "demo", sub: "u1", name: "Anna", team: "t1", role: "member",
    jti: "j-" + crypto.randomBytes(6).toString("hex"), exp: now() + 300 }, o), SECRET);
}
const post = (body, session, extra) => call(embed, { method: "POST", body, headers: Object.assign(session ? { authorization: "Bearer " + session } : {}, { "x-forwarded-for": "9.9.9.9" }, extra) });
async function login(o) {
  const r = await post({ op: "session", token: token(o) });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  return r.body.session;
}
const smart = (a, b, c) => ({ mode: "smart", giudizi: { occhio: a, naso: b, bocca: c } });
const full = n => ({ mode: "full", voti: { v: { qualita: n }, o: { intensita: n, complessita: n, qualita: n }, g: { equilibrio: n, intensita: n, persistenza: n, qualita: n }, f: { armonia: n } } });

/* organizzatore con una degustazione aperta e due vini */
async function scenario() {
  const org = await login({ sub: "org", name: "Org", role: "organizer" });
  const t = (await post({ op: "tasting.create", name: "Serata" }, org)).body.tasting;
  const w1 = (await post({ op: "wine.add", tasting: t.id, wine: { name: "Barolo", producer: "Rinaldi", vintage: "2018" } }, org)).body.wine;
  const w2 = (await post({ op: "wine.add", tasting: t.id, wine: { name: "Etna Rosso", vintage: "NV" } }, org)).body.wine;
  return { org, t, w1, w2 };
}

test.before(async () => { srv = await setup(); redis = getRedis(); });
test.after(async () => { await srv.stop(); });
test.beforeEach(async () => { srv.reset(); P.clearCache(); quota.reset(); await putPartner("demo"); });

/* ---- sessione ---- */
test("sessione: scambio del token e configurazione", async () => {
  await putPartner("demo", { theme: { title: "Club Vini", accent: "#aa0011" }, defaultMode: "full", lang: "en" });
  const r = await post({ op: "session", token: token({ role: "organizer", name: "Anna" }) });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.user, { name: "Anna", role: "organizer", team: "t1" });
  assert.equal(r.body.config.defaultMode, "full");
  assert.equal(r.body.config.lang, "en");
  assert.equal(r.body.config.title, "Club Vini");
  assert.ok(r.body.session.startsWith("s1."));
  assert.equal(r.headers["cache-control"], "no-store");
});
test("sessione: il token si usa una volta sola", async () => {
  const tk = token();
  assert.equal((await post({ op: "session", token: tk })).statusCode, 200);
  const r = await post({ op: "session", token: tk });
  assert.equal(r.statusCode, 401);
  assert.equal(r.body.error.code, "token_used");
});
test("sessione: token non valido, di partner sconosciuto, firmato male, scaduto", async () => {
  for (const tk of ["", "abc", token({ iss: "ignoto" }), jwt.sign({ iss: "demo", sub: "u", team: "t", jti: "jjjjjjjj", exp: now() + 100 }, "altro"), token({ exp: now() - 600 })]) {
    const r = await post({ op: "session", token: tk });
    assert.equal(r.statusCode, 401, tk.slice(0, 20));
    assert.ok(r.body.error.code);
  }
});
test("sessione: partner disattivato", async () => {
  await putPartner("demo", { active: false });
  assert.equal((await post({ op: "session", token: token() })).statusCode, 401);
});
test("sessione: tentativi limitati per indirizzo", async () => {
  await finestraSicura();
  let last;
  for (let i = 0; i < 201; i++) last = await post({ op: "session", token: "x" });
  assert.equal(last.statusCode, 429);
  assert.ok(last.headers["retry-after"]);
});
test("solo POST, e senza sessione le altre operazioni sono rifiutate", async () => {
  assert.equal((await call(embed, { method: "GET" })).statusCode, 405);
  assert.equal((await post({ op: "state" })).statusCode, 401);
  assert.equal((await post({ op: "state" }, "s1.aaa.bbb")).statusCode, 401);
});

/* ---- ruoli ---- */
test("il membro non può creare, chiudere o aggiungere vini", async () => {
  const { t } = await scenario();
  const m = await login({ sub: "m1" });
  assert.equal((await post({ op: "tasting.create", name: "X" }, m)).statusCode, 403);
  assert.equal((await post({ op: "tasting.status", tasting: t.id, status: "closed" }, m)).statusCode, 403);
  assert.equal((await post({ op: "wine.add", tasting: t.id, wine: { name: "Y" } }, m)).statusCode, 403);
});
test("validazione di degustazioni e vini", async () => {
  const { org, t } = await scenario();
  assert.equal((await post({ op: "tasting.create", name: "   " }, org)).statusCode, 400);
  assert.equal((await post({ op: "wine.add", tasting: t.id, wine: { name: "" } }, org)).statusCode, 400);
  assert.equal((await post({ op: "wine.add", tasting: t.id, wine: { name: "A", vintage: "20x8" } }, org)).statusCode, 400);
  assert.equal((await post({ op: "wine.add", tasting: "nonesiste", wine: { name: "A" } }, org)).statusCode, 404);
  assert.equal((await post({ op: "tasting.status", tasting: t.id, status: "boh" }, org)).statusCode, 400);
  assert.equal((await post({ op: "boh" }, org)).statusCode, 400);
});
test("testi puliti: spazi, caratteri di controllo, lunghezza", async () => {
  const org = await login({ role: "organizer" });
  const r = await post({ op: "tasting.create", name: "  Serata\u0000\n  lunga " + "x".repeat(200) }, org);
  assert.ok(r.body.tasting.name.startsWith("Serata lunga x"));
  assert.ok(r.body.tasting.name.length <= 80);
});

/* ---- voto e visibilità ---- */
test("voto smart: il server calcola il punteggio; la media si vede solo dopo aver votato", async () => {
  const { org, t, w1 } = await scenario();
  const m = await login({ sub: "m1", name: "Marco" });
  let st = (await post({ op: "state", tasting: t.id }, m)).body;
  assert.equal(st.wines.length, 2);
  assert.equal(st.wines[0].mine, null);
  assert.equal(st.wines[0].team, null);
  assert.equal(st.wines[0].votes, null, "il membro non vede il numero di voti prima di votare");
  const r = await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id, score: 100 }, smart(80, 90, 70)), m);
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.score, 77, "il punteggio inviato dal client (100) è ignorato");
  assert.deepEqual(r.body.team, { avg: 77, count: 1 });
  st = (await post({ op: "state", tasting: t.id }, m)).body;
  const w = st.wines.find(x => x.id === w1.id);
  assert.equal(w.mine.score, 77);
  assert.equal(w.mine.mode, "smart");
  assert.deepEqual(w.team, { avg: 77, count: 1 });
  assert.equal(st.wines.find(x => x.id !== w1.id).team, null, "sull'altro vino la media resta nascosta");
  // l'organizzatore vede quanti hanno votato anche senza aver votato
  const so = (await post({ op: "state", tasting: t.id }, org)).body;
  const wo = so.wines.find(x => x.id === w1.id);
  assert.equal(wo.votes, 1);
  assert.equal(wo.team, null, "ma la media no, finché non vota");
});
test("media di più voti, smart e completa insieme, con un decimale", async () => {
  const { t, w1 } = await scenario();
  const a = await login({ sub: "a" }), b = await login({ sub: "b" }), c = await login({ sub: "c" });
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(80, 90, 70)), a);   // 77
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, full(8)), b);             // 82
  const r = await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(100, 100, 99)), c); // 99
  assert.deepEqual(r.body.team, { avg: round1((77 + 82 + 99) / 3), count: 3 });
  function round1(x) { return Math.round(x * 10) / 10; }
});
test("voto completo: punteggio calcolato dal server con la stessa scala dell'app", async () => {
  const { t, w1 } = await scenario();
  const m = await login({ sub: "m" });
  const r = await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, full(8)), m);
  assert.equal(r.body.score, 82);
  assert.equal((await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, full(10)), m)).body.score, 100);
});
test("rivotare sostituisce il voto: somma e conteggio restano esatti", async () => {
  const { t, w1 } = await scenario();
  const a = await login({ sub: "a" }), b = await login({ sub: "b" });
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(60, 60, 60)), a);
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(90, 90, 90)), b);
  const r = await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(80, 80, 80)), a);
  assert.equal(r.body.replaced, true);
  assert.deepEqual(r.body.team, { avg: 85, count: 2 });
});
test("voti non validi", async () => {
  const { t, w1 } = await scenario();
  const m = await login({ sub: "m" });
  const v = extra => post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, extra), m);
  const casi = [
    {}, { mode: "boh" }, { mode: "smart" }, smart(49, 80, 80), smart(80, 101, 80), smart(80.5, 80, 80), smart("80", 80, 80), smart(null, 80, 80),
    { mode: "smart", giudizi: { occhio: 80, naso: 80 } },
    { mode: "full" }, { mode: "full", voti: { v: { qualita: 11 } } }, Object.assign(full(5), { voti: { v: { qualita: 5 } } }),
    (() => { const x = full(5); x.voti.g.persistenza = -1; return x; })(),
    (() => { const x = full(5); x.voti.o.complessita = 5.5; return x; })()
  ];
  for (const c of casi) {
    const r = await v(c);
    assert.equal(r.statusCode, 400, JSON.stringify(c));
    assert.equal(r.body.error.code, "invalid_vote");
  }
  assert.equal((await post({ op: "vote", tasting: t.id, wine: "nonesiste", mode: "smart", giudizi: { occhio: 60, naso: 60, bocca: 60 } }, m)).statusCode, 404);
});
test("modalità consentite dal partner", async () => {
  await putPartner("demo", { modes: ["smart"] });
  const { t, w1 } = await scenario();
  const m = await login({ sub: "m" });
  const r = await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, full(7)), m);
  assert.equal(r.statusCode, 403);
  assert.equal(r.body.error.code, "mode_not_allowed");
  assert.equal((await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(70, 70, 70)), m)).statusCode, 200);
});
test("degustazione chiusa: niente voti né vini; si può riaprire", async () => {
  const { org, t, w1 } = await scenario();
  const m = await login({ sub: "m" });
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(70, 70, 70)), m);
  await post({ op: "tasting.status", tasting: t.id, status: "closed" }, org);
  let r = await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(90, 90, 90)), m);
  assert.equal(r.statusCode, 409); assert.equal(r.body.error.code, "closed");
  assert.equal((await post({ op: "wine.add", tasting: t.id, wine: { name: "Nuovo" } }, org)).statusCode, 409);
  const st = (await post({ op: "state", tasting: t.id }, m)).body;
  assert.equal(st.tasting.status, "closed");
  assert.equal(st.wines[0].mine.score, 70, "il voto dato resta");
  await post({ op: "tasting.status", tasting: t.id, status: "open" }, org);
  assert.equal((await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(90, 90, 90)), m)).statusCode, 200);
});

/* ---- isolamento ---- */
test("isolamento fra team dello stesso partner", async () => {
  const { t, w1 } = await scenario();
  const altro = await login({ sub: "x", team: "t2" });
  assert.equal((await post({ op: "state", tasting: t.id }, altro)).statusCode, 404);
  assert.equal((await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(70, 70, 70)), altro)).statusCode, 404);
  assert.deepEqual((await post({ op: "state" }, altro)).body.tastings, []);
  const orgAltro = await login({ sub: "o2", team: "t2", role: "organizer" });
  assert.equal((await post({ op: "wine.add", tasting: t.id, wine: { name: "Z" } }, orgAltro)).statusCode, 404);
  assert.equal((await post({ op: "tasting.status", tasting: t.id, status: "closed" }, orgAltro)).statusCode, 404);
});
test("isolamento fra partner", async () => {
  const { t, w1 } = await scenario();
  await putPartner("altro");
  const tk = jwt.sign({ iss: "altro", sub: "u1", team: "t1", jti: "j-" + crypto.randomBytes(6).toString("hex"), exp: now() + 300 }, SECRET);
  const s = (await post({ op: "session", token: tk })).body.session;
  assert.equal((await post({ op: "state", tasting: t.id }, s)).statusCode, 404);
  assert.deepEqual((await post({ op: "state" }, s)).body.tastings, []);
});
test("lo stesso utente in team diversi ha dati separati", async () => {
  const { t, w1 } = await scenario();
  const a = await login({ sub: "stesso" });
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(70, 70, 70)), a);
  const b = await login({ sub: "stesso", team: "t2" });
  assert.deepEqual((await post({ op: "state" }, b)).body.tastings, []);
});
test("una sessione manomessa o di un altro partner non vale", async () => {
  const s = await login();
  const [a, b, c] = s.split(".");
  const evil = Buffer.from(JSON.stringify(Object.assign(JSON.parse(Buffer.from(b, "base64url")), { r: "organizer" }))).toString("base64url");
  assert.equal((await post({ op: "state" }, a + "." + evil + "." + c)).statusCode, 401);
});

/* ---- id come __proto__ ---- */
test("un identificativo utente come __proto__ non rompe nulla", async () => {
  const { t, w1 } = await scenario();
  const m = await login({ sub: "__proto__" });
  assert.equal((await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(70, 70, 70)), m)).statusCode, 200);
  const st = (await post({ op: "state", tasting: t.id }, m)).body;
  assert.equal(st.wines[0].mine.score, 70);
  assert.equal({}.polluted, undefined);
});

/* ---- elenco, limiti, quota, costi ---- */
test("elenco delle degustazioni del team, dalla più recente", async () => {
  const org = await login({ role: "organizer" });
  await post({ op: "tasting.create", name: "Prima" }, org);
  await new Promise(r => setTimeout(r, 5));
  await post({ op: "tasting.create", name: "Seconda" }, org);
  const l = (await post({ op: "state" }, org)).body.tastings;
  assert.deepEqual(l.map(x => x.name), ["Seconda", "Prima"]);
});
test("tetto di vini per degustazione", async () => {
  const { org, t } = await scenario();
  await redis.hset("cn:demo", { ["w:" + t.id]: String(Team.MAX_WINES - 2) });   // restano due posti
  assert.equal((await post({ op: "wine.add", tasting: t.id, wine: { name: "Penultimo" } }, org)).statusCode, 200);
  assert.equal((await post({ op: "wine.add", tasting: t.id, wine: { name: "Ultimo" } }, org)).statusCode, 200);
  const r = await post({ op: "wine.add", tasting: t.id, wine: { name: "Uno di troppo" } }, org);
  assert.equal(r.statusCode, 409); assert.equal(r.body.error.code, "limit");
  assert.equal(Number((await redis.hget("cn:demo", "w:" + t.id))), Team.MAX_WINES, "il rifiuto non sposta il contatore");
});
test("limite di richieste per utente", async () => {
  await finestraSicura();
  const s = await login();
  let last;
  for (let i = 0; i < 92; i++) last = await post({ op: "state" }, s);
  assert.equal(last.statusCode, 429);
});
test("quota quasi esaurita: le scritture si fermano, le letture no", async () => {
  const { org, t, w1 } = await scenario();
  const m = await login({ sub: "m" });
  await redis.set(quota.monthKey(), String(Math.round(quota.LIMIT * 0.97)));
  quota.reset();
  let r = await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(70, 70, 70)), m);
  assert.equal(r.statusCode, 503); assert.equal(r.body.error.code, "read_only");
  assert.equal(r.headers["x-sorso-quota"], "readonly");
  assert.equal((await post({ op: "tasting.create", name: "X" }, org)).statusCode, 503);
  r = await post({ op: "state", tasting: t.id }, m);
  assert.equal(r.statusCode, 200);
});
test("avviso agli organizzatori oltre l'80% dei comandi", async () => {
  const org = await login({ role: "organizer" });
  const m = await login({ sub: "m" });
  await redis.set(quota.monthKey(), String(Math.round(quota.LIMIT * 0.85)));
  quota.reset();
  assert.equal((await post({ op: "state" }, org)).body.quota, "warn");
  assert.equal((await post({ op: "state" }, m)).body.quota, "ok", "i membri non vedono l'avviso");
});
test("costo in comandi Redis: stato e voto restano economici", async () => {
  await finestraSicura();
  const { t, w1 } = await scenario();
  const m = await login({ sub: "m" });
  await post({ op: "state", tasting: t.id }, m);          // a caldo: elenco dei partner già in memoria
  srv.log.length = 0;
  await post({ op: "state", tasting: t.id }, m);
  const stato = srv.log.length;
  srv.log.length = 0;
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(70, 70, 70)), m);
  const voto = srv.log.length;
  console.log("   comandi: stato =", stato, ", voto =", voto);
  assert.ok(stato <= 8, "stato: " + stato);
  assert.ok(voto <= 10, "voto: " + voto);
});

/* ---- cancellazione dei dati di un utente ---- */
test("cancellazione utente: voti rimossi, medie corrette", async () => {
  const { t, w1, w2 } = await scenario();
  const a = await login({ sub: "a" }), b = await login({ sub: "b" });
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(60, 60, 60)), a);
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w2.id }, smart(70, 70, 70)), a);
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(90, 90, 90)), b);
  const r = await Team.deleteUser(redis, "demo", "a");
  assert.equal(r.votesRemoved, 2);
  const res = await Team.getResults(redis, "demo", t.id);
  const x1 = res.wines.find(w => w.id === w1.id), x2 = res.wines.find(w => w.id === w2.id);
  assert.equal(x1.votes, 1); assert.equal(x2.votes, 0);
  assert.equal((await Team.deleteUser(redis, "demo", "a")).votesRemoved, 0, "idempotente");
  const st = (await post({ op: "state", tasting: t.id }, await login({ sub: "a" }))).body;
  assert.equal(st.wines[0].mine, null);
  assert.equal(await redis.get("vt:demo:" + t.id + ":" + w1.id + ":a"), null);
  assert.equal(await redis.get("vt:demo:" + t.id + ":" + w1.id + ":b") !== null, true);
});
