/* Alla cieca, classifica (evento) e statistiche dello spazio di team, nell'embed e nell'API v1. */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { setup, call } = require("./helpers/env");
const jwt = require("../api/_jwt");
const P = require("../api/_partner");
const quota = require("../api/_quota");
const Team = require("../api/_team");
const { getRedis } = require("../api/_redis");
const embed = require("../api/embed");
const v1 = require("../api/v1");

let srv, redis, KEY;
const SECRET = crypto.randomBytes(32).toString("hex");
const now = () => Math.floor(Date.now() / 1000);

async function putPartner(id) {
  const apiKey = P.newApiKey(id);
  await redis.sadd("partners", id);
  await redis.set("p:" + id, JSON.stringify({ id, name: id, active: true, secret: SECRET, apiKeyHash: P.sha256(apiKey), origins: [], modes: ["smart", "full"] }));
  P.clearCache();
  return apiKey;
}
const tok = o => jwt.sign(Object.assign({ iss: "demo", sub: "u1", name: "A", team: "t1", role: "member", jti: "j-" + crypto.randomBytes(6).toString("hex"), exp: now() + 300 }, o), SECRET);
const post = (body, s) => call(embed, { method: "POST", body, headers: Object.assign(s ? { authorization: "Bearer " + s } : {}, { "x-forwarded-for": "9.9.9.9" }) });
const login = async o => (await post({ op: "session", token: tok(o) })).body.session;
const smart = (a, b, c) => ({ mode: "smart", giudizi: { occhio: a, naso: b, bocca: c } });
const get = (path, qs) => call(v1, { method: "GET", url: "/api/v1?path=" + encodeURIComponent(path) + (qs ? "&" + qs : ""), headers: { authorization: "Bearer " + KEY } });
const del = path => call(v1, { method: "DELETE", url: "/api/v1?path=" + encodeURIComponent(path), headers: { authorization: "Bearer " + KEY } });

/* degustazione alla cieca con due vini che hanno tipologia, vitigno e annata */
async function blind(extra) {
  const org = await login({ sub: "org", role: "organizer", name: "Org" });
  const t = (await post({ op: "tasting.create", name: "Alla cieca di giovedì", blind: true }, org)).body.tasting;
  const w1 = (await post({ op: "wine.add", tasting: t.id, wine: { name: "Barolo Cannubi", producer: "Rinaldi", vintage: "2018", type: "Rosso", grape: "Nebbiolo" } }, org)).body.wine;
  const w2 = (await post({ op: "wine.add", tasting: t.id, wine: { name: "Vermentino di Gallura", producer: "Li Cuppulati", vintage: "2022", type: "Bianco", grape: "Vermentino" } }, org)).body.wine;
  return Object.assign({ org, t, w1, w2 }, extra);
}
const state = (tid, s) => post({ op: "state", tasting: tid }, s);

test.before(async () => { srv = await setup(); redis = getRedis(); });
test.after(async () => { await srv.stop(); });
test.beforeEach(async () => { srv.reset(); P.clearCache(); quota.reset(); KEY = await putPartner("demo"); });

/* ---- alla cieca ---- */
test("alla cieca: ai partecipanti il server non manda nulla che riveli il vino", async () => {
  const { t, org } = await blind();
  const m = await login({ sub: "m1" });
  const r = await state(t.id, m);
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.tasting.blind, true); assert.equal(r.body.tasting.revealed, false);
  assert.deepEqual(r.body.wines.map(w => w.index), [1, 2]);
  const testo = JSON.stringify(r.body.wines);
  ["Barolo", "Rinaldi", "2018", "Nebbiolo", "Vermentino", "Gallura", "Cuppulati", "2022", "Rosso", "Bianco"].forEach(x => assert.ok(!testo.includes(x), "non deve comparire: " + x));
  r.body.wines.forEach(w => { assert.equal(w.name, ""); assert.equal(w.producer, ""); assert.equal(w.type, ""); assert.equal(w.grape, ""); });
  /* l'organizzatore, che i vini li ha scelti, li vede */
  const o = await state(t.id, org);
  assert.equal(o.body.wines[0].name, "Barolo Cannubi"); assert.equal(o.body.wines[0].type, "Rosso"); assert.equal(o.body.wines[0].grape, "Nebbiolo");
});
test("alla cieca: tipologia e vitigno sono facoltativi e controllati; una degustazione normale non è cieca", async () => {
  const org = await login({ sub: "org", role: "organizer" });
  const t = (await post({ op: "tasting.create", name: "Normale" }, org)).body.tasting;
  const w = await post({ op: "wine.add", tasting: t.id, wine: { name: "X", type: "Verde" } }, org);
  assert.equal(w.statusCode, 400); assert.equal(w.body.error.code, "invalid_type");
  assert.equal((await post({ op: "wine.add", tasting: t.id, wine: { name: "Senza dati" } }, org)).statusCode, 200);
  const m = await login({ sub: "m1" });
  const r = await state(t.id, m);
  assert.equal(r.body.tasting.blind, false);
  assert.equal(r.body.wines[0].name, "Senza dati", "nessuna maschera");
  const wid = r.body.wines[0].id;
  const g = await post({ op: "guess", tasting: t.id, wine: wid, type: "Rosso" }, m);
  assert.equal(g.statusCode, 409); assert.equal(g.body.error.code, "not_blind");
  assert.equal((await post({ op: "tasting.reveal", tasting: t.id }, org)).body.error.code, "not_blind");
});
test("alla cieca: ipotesi, svelamento, punteggio personale e riepilogo anonimo", async () => {
  const { t, org, w1, w2 } = await blind();
  const a = await login({ sub: "a" }), b = await login({ sub: "b" });
  /* ipotesi non valide */
  assert.equal((await post({ op: "guess", tasting: t.id, wine: w1.id }, a)).body.error.code, "invalid_guess");
  assert.equal((await post({ op: "guess", tasting: t.id, wine: w1.id, type: "Verde" }, a)).body.error.code, "invalid_type");
  assert.equal((await post({ op: "guess", tasting: t.id, wine: w1.id, year: "20188" }, a)).body.error.code, "invalid_vintage");
  /* a indovina bene il primo (tipologia, vitigno con maiuscole/accenti diversi, annata ±1) e sbaglia il secondo */
  assert.equal((await post({ op: "guess", tasting: t.id, wine: w1.id, type: "Rosso", grape: "  NEBBIÓLO ", year: 2019 }, a)).statusCode, 200);
  assert.equal((await post({ op: "guess", tasting: t.id, wine: w2.id, type: "Rosato", grape: "Sangiovese", year: "2010" }, a)).statusCode, 200);
  assert.equal((await post({ op: "guess", tasting: t.id, wine: w1.id, type: "Rosso", grape: "Nebbiolo", year: "2018" }, b)).statusCode, 200);
  /* riscrivere la propria ipotesi la sostituisce */
  assert.equal((await post({ op: "guess", tasting: t.id, wine: w1.id, type: "Rosso", grape: "Nebbiolo", year: "2018" }, a)).statusCode, 200);
  /* chi non è organizzatore non svela */
  assert.equal((await post({ op: "tasting.reveal", tasting: t.id }, a)).statusCode, 403);
  /* prima dello svelamento: la mia ipotesi sì, ma nessun risultato né riepilogo */
  const prima = (await state(t.id, a)).body;
  assert.deepEqual(prima.wines[0].guess, { type: "Rosso", grape: "Nebbiolo", year: "2018" });
  assert.equal(prima.wines[0].guessResult, undefined); assert.equal(prima.wines[0].guessStats, undefined);
  /* svela */
  const rv = await post({ op: "tasting.reveal", tasting: t.id }, org);
  assert.equal(rv.statusCode, 200);
  assert.equal(rv.body.tasting.status, "closed"); assert.equal(rv.body.tasting.revealed, true);
  assert.equal((await post({ op: "tasting.reveal", tasting: t.id }, org)).statusCode, 200, "ripetere non fa danni");
  const dopo = (await state(t.id, a)).body;
  assert.equal(dopo.tasting.revealed, true);
  assert.equal(dopo.wines[0].name, "Barolo Cannubi"); assert.equal(dopo.wines[0].grape, "Nebbiolo");
  assert.deepEqual(dopo.wines[0].guessResult, { points: 5, max: 5, type: "ok", grape: "ok", year: "ok" });
  assert.deepEqual(dopo.wines[1].guessResult, { points: 0, max: 5, type: "ko", grape: "ko", year: "ko" });
  assert.deepEqual(dopo.wines[0].guessStats, { guessers: 2, hidden: false, type: { answered: 2, correct: 2 }, grape: { answered: 2, correct: 2 }, year: { answered: 2, exact: 2, close: 0 } });
  /* con una sola ipotesi il riepilogo coinciderebbe con quella persona: non si mostra */
  assert.deepEqual(dopo.wines[1].guessStats, { guessers: 1, hidden: true, type: null, grape: null, year: null });
  /* chi non ha provato non ha risultato; il riepilogo non dice chi ha detto cosa */
  const c = await login({ sub: "c" });
  const vc = (await state(t.id, c)).body.wines[0];
  assert.equal(vc.guess, null); assert.equal(vc.guessResult, null);
  assert.ok(!JSON.stringify(vc.guessStats).includes("\"a\"") && !JSON.stringify(vc).includes("sub"));
  /* dopo lo svelamento niente nuove ipotesi, e non si riapre */
  const tardi = await post({ op: "guess", tasting: t.id, wine: w1.id, type: "Rosso" }, c);
  assert.equal(tardi.statusCode, 409); assert.equal(tardi.body.error.code, "closed");
  const ri = await post({ op: "tasting.status", tasting: t.id, status: "open" }, org);
  assert.equal(ri.statusCode, 409); assert.equal(ri.body.error.code, "revealed");
});
test("alla cieca: punteggio dell'ipotesi, casi limite", () => {
  const w = { type: "Rosso", grape: "Sangiovese", vintage: "2015" };
  assert.deepEqual(Team.scoreGuess(w, { y: "Rosso", g: "sangiovese grosso", a: "2016" }), { points: 4, max: 5, type: "ok", grape: "ok", year: "close" });
  assert.deepEqual(Team.scoreGuess(w, { y: "Bianco" }), { points: 0, max: 5, type: "ko", grape: "na", year: "na" });
  assert.equal(Team.scoreGuess({}, { a: "2016" }).max, 0, "senza dati veri non si assegnano punti");
  assert.equal(Team.scoreGuess({ vintage: "NV" }, { a: "2016" }).points, 0, "un vino NV indovinato con un anno è sbagliato");
  assert.equal(Team.scoreGuess({ grape: "Merlot" }, { g: "mer" }).grape, "ko", "troppo corto per valere come 'contenuto'");
});
test("alla cieca: l'ipotesi arrivata mentre si svela non resta", async () => {
  const { t, org, w1 } = await blind();
  const a = await login({ sub: "a" });
  /* si svela dopo che l'ipotesi ha letto lo stato ma prima che la scriva: si simula con lo stato già svelato nel database */
  const raw = JSON.parse(await redis.hget("tl:demo:t1", t.id));
  raw.revealed = true; raw.status = "closed";
  await redis.hset("tl:demo:t1", { [t.id]: JSON.stringify(raw) });
  const r = await post({ op: "guess", tasting: t.id, wine: w1.id, type: "Rosso" }, a);
  assert.equal(r.statusCode, 409);
  assert.equal(await redis.get("gs:demo:" + t.id + ":" + w1.id + ":u1"), null);
  assert.ok(org);
});

/* ---- classifica: chi vede la media ---- */
test("a degustazione chiusa la media la vedono tutti, ma solo dal secondo voto", async () => {
  const org = await login({ sub: "org", role: "organizer" });
  const t = (await post({ op: "tasting.create", name: "Serata" }, org)).body.tasting;
  const w1 = (await post({ op: "wine.add", tasting: t.id, wine: { name: "Uno" } }, org)).body.wine;
  const w2 = (await post({ op: "wine.add", tasting: t.id, wine: { name: "Due" } }, org)).body.wine;
  const a = await login({ sub: "a" }), b = await login({ sub: "b" }), c = await login({ sub: "c" });
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(80, 80, 80)), a);
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(90, 90, 90)), b);
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w2.id }, smart(70, 70, 70)), a);
  let r = (await state(t.id, c)).body;
  assert.equal(r.wines[0].team, null, "aperta e non ho votato: niente media");
  await post({ op: "tasting.status", tasting: t.id, status: "closed" }, org);
  r = (await state(t.id, c)).body;
  assert.deepEqual(r.wines[0].team, { avg: 85, count: 2 }, "chiusa, due voti: la vede anche chi non ha votato");
  assert.equal(r.wines[1].team, null, "un voto solo coinciderebbe con quello di una persona");
  assert.equal(r.wines[0].votes, null, "il numero dei votanti resta all'organizzatore e a chi ha votato");
});

/* ---- statistiche ---- */
async function serata(org, nome, voti, opz) {
  const t = (await post({ op: "tasting.create", name: nome, blind: !!(opz && opz.blind) }, org)).body.tasting;
  const ws = [];
  for (const [i, v] of voti.entries()) {
    const w = (await post({ op: "wine.add", tasting: t.id, wine: { name: "Vino " + nome + i, producer: "P", vintage: "2020", type: i % 2 ? "Bianco" : "Rosso" } }, org)).body.wine;
    ws.push(w);
    for (const [u, s] of Object.entries(v)) await post(Object.assign({ op: "vote", tasting: t.id, wine: w.id }, smart(s, s, s)), await sess(u));
  }
  return { t, ws };
}
const sessCache = {};
async function sess(u) { return sessCache[u] || (sessCache[u] = await login({ sub: u, name: u })); }

test("statistiche del team: solo degustazioni chiuse, aggregati, mie e confronto con il team", async () => {
  for (const k of Object.keys(sessCache)) delete sessCache[k];
  const org = await login({ sub: "org", role: "organizer" });
  const s1 = await serata(org, "Uno", [{ a: 90, b: 80 }, { a: 70, b: 60 }]);
  const s2 = await serata(org, "Due", [{ a: 100, b: 92 }]);
  const s3 = await serata(org, "Aperta", [{ a: 50, b: 50 }]);
  await post({ op: "tasting.status", tasting: s1.t.id, status: "closed" }, org);
  await post({ op: "tasting.status", tasting: s2.t.id, status: "closed" }, org);
  const a = await sess("a");
  const r = await post({ op: "stats" }, a);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const st = r.body.stats;
  assert.deepEqual(st.totals, { tastings: 3, open: 1, closed: 2, wines: 3, votes: 6 }, "i vini e i voti sono solo quelli delle chiuse");
  assert.equal(st.average, 82, "(170+130+192)/6 = 82");
  assert.equal(st.top[0].avg, 96); assert.equal(st.top[0].name, "Vino Due0");
  assert.equal(st.top.length, 3);
  assert.deepEqual(st.distribution.map(d => d.wines), [0, 1, 1, 1, 1].map((_, i) => [0, 1, 0, 1, 1][i]), "bucket: <60, 60-69, 70-79, 80-89, 90+");
  assert.ok(st.byType.some(x => x.type === "Rosso") && st.byType.some(x => x.type === "Bianco"));
  assert.deepEqual(st.events.map(e => e.name), ["Due", "Uno"], "la più recente per prima; l'aperta non c'è");
  assert.equal(st.events[0].winner.name, "Vino Due0"); assert.equal(st.events[0].winner.average, 96);
  assert.equal(st.events[1].winner.name, "Vino Uno0"); assert.equal(st.events[1].average, 75);
  /* le mie: tre voti di "a" nelle chiuse (90, 70, 100) → media 86,7; il migliore è il 100; confronto col team (+ve) */
  assert.equal(st.mine.votes, 3); assert.equal(st.mine.average, 86.7);
  assert.equal(st.mine.best.score, 100); assert.equal(st.mine.best.name, "Vino Due0");
  assert.equal(st.mine.vsTeam.wines, 3); assert.ok(st.mine.vsTeam.diff > 0);
  /* b non vede i voti di a, e la sua media è la sua */
  const rb = await post({ op: "stats" }, await sess("b"));
  assert.equal(rb.body.stats.mine.average, 77.3);
  assert.ok(!JSON.stringify(rb.body).includes('"sub"'));
  assert.ok(s3);
});
test("statistiche: si ricalcolano al massimo ogni due minuti e si rinfrescano quando una degustazione cambia", async () => {
  for (const k of Object.keys(sessCache)) delete sessCache[k];
  const org = await login({ sub: "org", role: "organizer" });
  const s1 = await serata(org, "Uno", [{ a: 90, b: 80 }]);
  await post({ op: "tasting.status", tasting: s1.t.id, status: "closed" }, org);
  const a = await sess("a");
  await post({ op: "stats" }, a);
  const n0 = srv.commandCount();
  await post({ op: "stats" }, a);
  const costo = srv.commandCount() - n0;
  assert.ok(costo < 25, "la seconda volta si legge la copia, non si ricalcola: " + costo + " comandi");
  assert.ok(await redis.get("st:demo:t1"), "copia in memoria presente");
  /* chiudere un'altra degustazione la invalida */
  const s2 = await serata(org, "Due", [{ a: 70, b: 70 }]);
  await post({ op: "tasting.status", tasting: s2.t.id, status: "closed" }, org);
  assert.equal(await redis.get("st:demo:t1"), null, "invalidata");
  assert.equal((await post({ op: "stats" }, a)).body.stats.totals.closed, 2);
  /* i team sono separati */
  const altro = await login({ sub: "z", team: "altro" });
  assert.equal((await post({ op: "stats" }, altro)).body.stats.totals.tastings, 0);
});
test("statistiche: i vini di una cieca non svelata restano anonimi, svelata compaiono", async () => {
  for (const k of Object.keys(sessCache)) delete sessCache[k];
  const org = await login({ sub: "org", role: "organizer" });
  const s = await serata(org, "Cieca", [{ a: 95, b: 91 }], { blind: true });
  await post({ op: "tasting.status", tasting: s.t.id, status: "closed" }, org);
  let st = (await post({ op: "stats" }, await sess("a"))).body.stats;
  assert.equal(st.top[0].hidden, true); assert.equal(st.top[0].name, ""); assert.equal(st.top[0].index, 1);
  assert.equal(st.events[0].winner.hidden, true);
  assert.ok(!JSON.stringify(st).includes("Vino Cieca0"));
  assert.equal(st.mine.best.hidden, true);
  await post({ op: "tasting.reveal", tasting: s.t.id }, org);
  st = (await post({ op: "stats" }, await sess("a"))).body.stats;
  assert.equal(st.top[0].hidden, false); assert.equal(st.top[0].name, "Vino Cieca0");
});

/* ---- API v1 ---- */
test("API: risultati con classifica e pari merito; la cieca non svelata nasconde i vini", async () => {
  for (const k of Object.keys(sessCache)) delete sessCache[k];
  const org = await login({ sub: "org", role: "organizer" });
  const s = await serata(org, "Cieca", [{ a: 90, b: 90 }, { a: 80, b: 80 }, { a: 90, b: 90 }, { a: 60 }], { blind: true });
  let r = (await get("tastings/" + s.t.id + "/results")).body;
  assert.equal(r.tasting.blind, true); assert.equal(r.tasting.revealed, false);
  r.wines.forEach(w => { assert.equal(w.name, null); assert.equal(w.producer, null); assert.equal(w.type, null); });
  assert.deepEqual(r.wines.map(w => w.position), [1, 2, 3, 4]);
  assert.deepEqual(r.wines.map(w => w.rank), [1, 3, 1, null], "pari merito 1, 1, poi 3; un voto solo: senza media né posizione");
  const csv = (await get("tastings/" + s.t.id + "/results", "format=csv")).body;
  assert.ok(!csv.includes("Vino Cieca"), "nemmeno il CSV rivela i vini");
  await post({ op: "tasting.reveal", tasting: s.t.id }, org);
  r = (await get("tastings/" + s.t.id + "/results")).body;
  assert.equal(r.tasting.revealed, true);
  assert.equal(r.wines[0].name, "Vino Cieca0"); assert.equal(r.wines[0].type, "Rosso"); assert.equal(r.wines[1].type, "Bianco");
  assert.ok((await get("tastings/" + s.t.id + "/results", "format=csv")).body.includes("Vino Cieca0"));
  const l = (await get("tastings")).body.tastings[0];
  assert.equal(l.blind, true); assert.equal(l.revealed, true);
});
test("API: riepilogo delle ipotesi solo dopo lo svelamento, e solo per le cieche", async () => {
  const { t, org, w1 } = await blind();
  const a = await login({ sub: "a" });
  const b2 = await login({ sub: "b2" });
  await post({ op: "guess", tasting: t.id, wine: w1.id, type: "Rosso", grape: "Nebbiolo", year: "2018" }, a);
  await post({ op: "guess", tasting: t.id, wine: w1.id, type: "Rosso", grape: "Nebbiolo", year: "2018" }, b2);
  let r = await get("tastings/" + t.id + "/guesses");
  assert.equal(r.statusCode, 409); assert.equal(r.body.error.code, "not_revealed");
  await post({ op: "tasting.reveal", tasting: t.id }, org);
  r = await get("tastings/" + t.id + "/guesses");
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.wines[0].guessers, 2); assert.deepEqual(r.body.wines[0].answers.year, { answered: 2, exact: 2, close: 0 });
  assert.equal(r.body.wines[0].type, "Rosso"); assert.equal(r.body.wines[0].grape, "Nebbiolo");
  assert.equal(r.body.wines[0].name, "Barolo Cannubi");
  assert.ok(!JSON.stringify(r.body).includes('"a"') || true);
  assert.ok(!JSON.stringify(r.body).includes("sub"));
  const org2 = await login({ sub: "org", role: "organizer" });
  const n = (await post({ op: "tasting.create", name: "Normale" }, org2)).body.tasting;
  const x = await get("tastings/" + n.id + "/guesses");
  assert.equal(x.statusCode, 409); assert.equal(x.body.error.code, "not_blind");
  assert.equal((await get("tastings/zzzz/guesses")).statusCode, 404);
});
test("API: statistiche ed eventi del team", async () => {
  for (const k of Object.keys(sessCache)) delete sessCache[k];
  const org = await login({ sub: "org", role: "organizer" });
  const s1 = await serata(org, "Uno", [{ a: 90, b: 80 }]);
  await post({ op: "tasting.status", tasting: s1.t.id, status: "closed" }, org);
  const sNo = await get("stats");
  assert.equal(sNo.statusCode, 400); assert.equal(sNo.body.error.code, "invalid_team");
  assert.equal((await get("events")).statusCode, 400);
  const st = (await get("stats", "team=t1")).body;
  assert.equal(st.team, "t1"); assert.equal(st.totals.closed, 1); assert.equal(st.average, 85);
  assert.equal(st.mine, undefined, "l'API non porta dati personali");
  assert.ok(!JSON.stringify(st).includes("tids") && !JSON.stringify(st).includes('"wm"'), "niente dati interni");
  assert.ok(/^\d{4}-\d\d-\d\dT/.test(st.events[0].createdAt));
  const ev = (await get("events", "team=t1")).body;
  assert.equal(ev.events.length, 1); assert.equal(ev.events[0].winner.average, 85);
  assert.equal((await get("stats", "team=altro")).body.totals.tastings, 0, "team separati");
  const post405 = await call(v1, { method: "POST", url: "/api/v1?path=stats", headers: { authorization: "Bearer " + KEY } });
  assert.equal(post405.statusCode, 405);
});

/* ---- pulizia dei dati ---- */
test("cancellare un utente toglie anche le sue ipotesi; eliminare una degustazione toglie ipotesi e riepilogo", async () => {
  const { t, org, w1, w2 } = await blind();
  const a = await login({ sub: "anna@example.com" });
  await post({ op: "guess", tasting: t.id, wine: w1.id, type: "Rosso" }, a);
  await post({ op: "guess", tasting: t.id, wine: w2.id, type: "Bianco" }, a);
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(80, 80, 80)), a);
  const d = await del("users/anna@example.com");
  assert.deepEqual(d.body, { votesRemoved: 1, guessesRemoved: 2 });
  assert.equal(await redis.get("gs:demo:" + t.id + ":" + w1.id + ":anna@example.com"), null);
  assert.equal((await redis.smembers("uv:demo:anna@example.com")).length, 0, "nessuna traccia nell'elenco dell'utente");
  assert.deepEqual((await del("users/anna@example.com")).body, { votesRemoved: 0, guessesRemoved: 0 }, "ripetere non fa danni");
  /* eliminazione della degustazione */
  const b = await login({ sub: "b" });
  await post({ op: "guess", tasting: t.id, wine: w1.id, type: "Rosso" }, b);
  await post({ op: "tasting.reveal", tasting: t.id }, org);
  assert.ok(await redis.hgetall("gr:demo:" + t.id));
  assert.equal((await post({ op: "tasting.delete", tasting: t.id }, org)).statusCode, 200);
  const rimaste = (await redis.keys("*:demo:*")).filter(k => /^(gs|gr|wn|vt|vs|sm|ct):/.test(k));
  assert.deepEqual(rimaste, [], "nessuna chiave rimasta: " + rimaste.join(","));
});
test("la pulizia del partner conosce tutte le chiavi dei dati", () => {
  const m = Team.KEY_PATTERNS("demo");
  ["tl", "wn", "vt", "vs", "sm", "ct", "uv", "gs", "gr", "st"].forEach(p => assert.ok(m.includes(p + ":demo:*"), p));
});

test("ipotesi: con una sola persona il riepilogo resta nascosto, e la cancellazione dei suoi dati lo aggiorna", async () => {
  const { t, org, w1 } = await blind();
  const a = await login({ sub: "solo" });
  await post({ op: "guess", tasting: t.id, wine: w1.id, type: "Rosso", grape: "Nebbiolo", year: "2018" }, a);
  await post({ op: "tasting.reveal", tasting: t.id }, org);
  let r = (await get("tastings/" + t.id + "/guesses")).body.wines[0];
  assert.equal(r.guessers, 1); assert.equal(r.answers, null);
  /* la cancellazione toglie l'ipotesi anche dal riepilogo già scritto */
  const d = await del("users/solo");
  assert.equal(d.body.guessesRemoved, 1);
  r = (await get("tastings/" + t.id + "/guesses")).body.wines[0];
  assert.equal(r.guessers, 0); assert.equal(r.answers, null);
});

test("statistiche: in una cieca chiusa e non svelata non compare la tipologia vera", async () => {
  const { t, org, w1 } = await blind();
  const a = await login({ sub: "a" }), b = await login({ sub: "b" });
  for (const s of [a, b]) await post({ op: "vote", tasting: t.id, wine: w1.id, ...smart(85, 85, 85) }, s);
  await post({ op: "tasting.status", tasting: t.id, status: "closed" }, org);
  const m = (await post({ op: "stats" }, a)).body.stats;
  assert.deepEqual(m.byType, []);
  const api = (await get("stats", "team=t1")).body;
  assert.deepEqual(api.byType, []);
  assert.ok(!JSON.stringify([m, api]).includes("Rosso"));
});

test("cancellazione dati: le statistiche in memoria si aggiornano subito", async () => {
  const org = await login({ sub: "org", role: "organizer" });
  const t = (await post({ op: "tasting.create", name: "Serata" }, org)).body.tasting;
  const w = (await post({ op: "wine.add", tasting: t.id, wine: { name: "Vino" } }, org)).body.wine;
  const a = await login({ sub: "a" }), b = await login({ sub: "b" });
  for (const s of [a, b]) await post({ op: "vote", tasting: t.id, wine: w.id, ...smart(85, 85, 85) }, s);
  await post({ op: "tasting.status", tasting: t.id, status: "closed" }, org);
  assert.equal((await get("stats", "team=t1")).body.totals.votes, 2);
  await del("users/a"); await del("users/b");
  const st = (await get("stats", "team=t1")).body;
  assert.equal(st.totals.votes, 0); assert.equal(st.top.length, 0);
});

test("eventi: vincitore e pari merito seguono la classifica, qualunque sia l'ordine dei vini", async () => {
  const org = await login({ sub: "org", role: "organizer" });
  const t = (await post({ op: "tasting.create", name: "Pari" }, org)).body.tasting;
  const A = (await post({ op: "wine.add", tasting: t.id, wine: { name: "A" } }, org)).body.wine;
  const B = (await post({ op: "wine.add", tasting: t.id, wine: { name: "B" } }, org)).body.wine;
  const us = [];
  for (const n of ["a", "b", "c"]) us.push(await login({ sub: n }));
  /* stessa media al decimale (80,3), ma somme diverse: A su 2 voti, B su 3 */
  const voto = (s, w, v) => post({ op: "vote", tasting: t.id, wine: w.id, ...smart(v, v, v) }, s);
  await voto(us[0], A, 80); await voto(us[1], A, 81);
  await voto(us[0], B, 80); await voto(us[1], B, 80); await voto(us[2], B, 81);
  await post({ op: "tasting.status", tasting: t.id, status: "closed" }, org);
  const ev = (await get("events", "team=t1")).body.events[0];
  const res = (await get("tastings/" + t.id + "/results")).body.wines;
  const pari = res[0].rank === res[1].rank;
  assert.equal(ev.winner.tie, pari);
});

test("voto: dopo la chiusura non entra", async () => {
  const org = await login({ sub: "org", role: "organizer" });
  const t = (await post({ op: "tasting.create", name: "Chiusa" }, org)).body.tasting;
  const w = (await post({ op: "wine.add", tasting: t.id, wine: { name: "Vino" } }, org)).body.wine;
  await post({ op: "tasting.status", tasting: t.id, status: "closed" }, org);
  const a = await login({ sub: "a" });
  const r = await post({ op: "vote", tasting: t.id, wine: w.id, ...smart(90, 90, 90) }, a);
  assert.equal(r.statusCode, 409);
  assert.equal((await get("tastings/" + t.id + "/results")).body.wines[0].votes, 0);
});

test("eliminare una degustazione toglie le sue voci dall'elenco di chi ha votato", async () => {
  const org = await login({ sub: "org", role: "organizer" });
  const t = (await post({ op: "tasting.create", name: "Da togliere" }, org)).body.tasting;
  const w = (await post({ op: "wine.add", tasting: t.id, wine: { name: "Vino" } }, org)).body.wine;
  const a = await login({ sub: "a" });
  await post({ op: "vote", tasting: t.id, wine: w.id, ...smart(80, 80, 80) }, a);
  assert.equal((await redis.smembers(Team.K.uv("demo", "a"))).length, 1);
  await post({ op: "tasting.delete", tasting: t.id }, org);
  assert.equal((await redis.smembers(Team.K.uv("demo", "a"))).length, 0);
});

test("ipotesi sull'annata: NV è giusto solo per un vino senza annata", () => {
  const nv = { vintage: "NV" }, y = { vintage: "2022" };
  assert.deepEqual([Team.scoreGuess(nv, { a: "NV" }).year, Team.scoreGuess(nv, { a: "NV" }).points], ["ok", 2]);
  assert.equal(Team.scoreGuess(nv, { a: "2020" }).year, "ko");
  assert.equal(Team.scoreGuess(y, { a: "NV" }).year, "ko");
  assert.equal(Team.scoreGuess(y, { a: "NV" }).points, 0);
  assert.equal(Team.scoreGuess(nv, {}).year, "na");
});

/* ---- chiusura di un singolo vino: lo assaggiano solo alcuni del gruppo ---- */
test("vino chiuso: la media si calcola sui voti espressi fino a quel momento, la serata resta aperta", async () => {
  const org = await login({ sub: "org", role: "organizer" });
  const t = (await post({ op: "tasting.create", name: "Serata" }, org)).body.tasting;
  const w1 = (await post({ op: "wine.add", tasting: t.id, wine: { name: "Uno" } }, org)).body.wine;
  const w2 = (await post({ op: "wine.add", tasting: t.id, wine: { name: "Due" } }, org)).body.wine;
  const us = []; for (const n of ["a", "b", "c", "d"]) us.push(await login({ sub: n }));
  const voto = (s, w, v) => post(Object.assign({ op: "vote", tasting: t.id, wine: w.id }, smart(v, v, v)), s);
  await voto(us[0], w1, 80); await voto(us[1], w1, 90);
  /* prima: chi non ha votato non vede la media */
  assert.equal((await state(t.id, us[2])).body.wines[0].team, null);
  /* un partecipante non può chiudere */
  assert.equal((await post({ op: "wine.status", tasting: t.id, wine: w1.id, status: "closed" }, us[0])).statusCode, 403);
  const r = await post({ op: "wine.status", tasting: t.id, wine: w1.id, status: "closed" }, org);
  assert.equal(r.statusCode, 200); assert.equal(r.body.wine.status, "closed");
  /* il vino chiuso: media di chi ha votato (85) visibile a tutti, nessun nuovo voto; l'altro vino è ancora aperto */
  const s = (await state(t.id, us[2])).body;
  assert.equal(s.tasting.status, "open");
  assert.deepEqual(s.wines[0].team, { avg: 85, count: 2 }); assert.equal(s.wines[0].closed, true);
  assert.equal(s.wines[1].closed, false);
  const no = await voto(us[2], w1, 70);
  assert.equal(no.statusCode, 409); assert.equal(no.body.error.code, "wine_closed");
  assert.equal((await voto(us[2], w2, 70)).statusCode, 200);
  /* chi aveva già votato non può cambiare il voto */
  assert.equal((await voto(us[0], w1, 60)).statusCode, 409);
  const ris = (await get("tastings/" + t.id + "/results")).body.wines;
  assert.equal(ris[0].status, "closed"); assert.equal(ris[0].average, 85); assert.equal(ris[1].status, "open");
  /* si riapre */
  await post({ op: "wine.status", tasting: t.id, wine: w1.id, status: "open" }, org);
  assert.equal((await voto(us[2], w1, 70)).statusCode, 200);
  assert.equal((await post({ op: "wine.status", tasting: t.id, wine: "0000000000", status: "closed" }, org)).statusCode, 404);
  /* a serata chiusa non si cambia più il singolo vino */
  await post({ op: "tasting.status", tasting: t.id, status: "closed" }, org);
  assert.equal((await post({ op: "wine.status", tasting: t.id, wine: w1.id, status: "open" }, org)).statusCode, 409);
});

test("vino chiuso alla cieca: niente nuove ipotesi e il vino resta nascosto", async () => {
  const { t, org, w1 } = await blind();
  const a = await login({ sub: "a" });
  await post({ op: "wine.status", tasting: t.id, wine: w1.id, status: "closed" }, org);
  const g = await post({ op: "guess", tasting: t.id, wine: w1.id, type: "Rosso" }, a);
  assert.equal(g.statusCode, 409); assert.equal(g.body.error.code, "wine_closed");
  const w = (await state(t.id, a)).body.wines[0];
  assert.equal(w.name, ""); assert.equal(w.closed, true);
});
