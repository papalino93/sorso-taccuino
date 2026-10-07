const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { setup, call } = require("./helpers/env");
const jwt = require("../api/_jwt");
const P = require("../api/_partner");
const quota = require("../api/_quota");
const { getRedis } = require("../api/_redis");
const embed = require("../api/embed");
const v1 = require("../api/v1");

let srv, redis, KEY;
const SECRET = crypto.randomBytes(32).toString("hex");
const now = () => Math.floor(Date.now() / 1000);

async function putPartner(id, extra) {
  const apiKey = P.newApiKey(id);
  await redis.set("p:" + id, JSON.stringify(Object.assign({ id, name: id, active: true, secret: SECRET, apiKeyHash: P.sha256(apiKey), origins: [], modes: ["smart", "full"] }, extra)));
  P.clearCache();
  return apiKey;
}
const tok = o => jwt.sign(Object.assign({ iss: "demo", sub: "u1", name: "A", team: "t1", role: "member", jti: "j-" + crypto.randomBytes(6).toString("hex"), exp: now() + 300 }, o), SECRET);
const post = (body, s) => call(embed, { method: "POST", body, headers: s ? { authorization: "Bearer " + s } : {} });
const login = async o => (await post({ op: "session", token: tok(o) })).body.session;
const smart = (a, b, c) => ({ mode: "smart", giudizi: { occhio: a, naso: b, bocca: c } });
const get = (path, o) => call(v1, Object.assign({ method: "GET", url: "/api/v1?path=" + encodeURIComponent(path) + ((o && o.qs) ? "&" + o.qs : ""), headers: { authorization: "Bearer " + KEY } }, o && o.req));

async function scenario() {
  const org = await login({ sub: "org", role: "organizer" });
  const t = (await post({ op: "tasting.create", name: "Serata" }, org)).body.tasting;
  const w1 = (await post({ op: "wine.add", tasting: t.id, wine: { name: "Barolo", producer: "Rinaldi", vintage: "2018" } }, org)).body.wine;
  const w2 = (await post({ op: "wine.add", tasting: t.id, wine: { name: '=HYPERLINK("http://x")', producer: 'Con "virgolette", e virgola' } }, org)).body.wine;
  return { org, t, w1, w2 };
}

test.before(async () => { srv = await setup(); redis = getRedis(); });
test.after(async () => { await srv.stop(); });
test.beforeEach(async () => { srv.reset(); P.clearCache(); quota.reset(); KEY = await putPartner("demo"); });

test("autenticazione: senza chiave, chiave sbagliata, di un altro partner, partner disattivato", async () => {
  const k2 = await putPartner("altro");
  P.clearCache();
  for (const h of [{}, { authorization: "Bearer sk_demo_" + "0".repeat(48) }, { authorization: "Bearer nonuna" }, { authorization: "Basic abc" }]) {
    const r = await call(v1, { method: "GET", url: "/api/v1?path=tastings", headers: h });
    assert.equal(r.statusCode, 401);
    assert.equal(r.body.error.code, "unauthorized");
  }
  // la chiave di "altro" non apre "demo": stesso formato, partner diverso
  const r = await call(v1, { method: "GET", url: "/api/v1?path=tastings", headers: { authorization: "Bearer " + k2 } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.tastings, [], "vede solo i propri dati");
  await putPartner("demo", { active: false });
  assert.equal((await call(v1, { method: "GET", url: "/api/v1?path=tastings", headers: { authorization: "Bearer " + KEY } })).statusCode, 401);
});
test("intestazioni: versione, nessuna cache", async () => {
  const r = await get("tastings");
  assert.equal(r.headers["x-sorso-api-version"], "1");
  assert.equal(r.headers["cache-control"], "no-store");
});
test("elenco degustazioni con filtri per team e stato", async () => {
  const { org, t } = await scenario();
  const o2 = await login({ sub: "o2", role: "organizer", team: "t2" });
  await post({ op: "tasting.create", name: "Altro team" }, o2);
  await post({ op: "tasting.status", tasting: t.id, status: "closed" }, org);
  let r = await get("tastings");
  assert.equal(r.body.tastings.length, 2);
  r = await get("tastings", { qs: "team=t1" });
  assert.deepEqual(r.body.tastings.map(x => x.name), ["Serata"]);
  r = await get("tastings", { qs: "status=open" });
  assert.deepEqual(r.body.tastings.map(x => x.name), ["Altro team"]);
  r = await get("tastings", { qs: "status=boh" });
  assert.equal(r.statusCode, 400);
  assert.match(r.body.tastings ? "" : r.body.error.code, /invalid_status/);
});
test("risultati: la media compare dal secondo voto; mai chi ha votato", async () => {
  const { t, w1, w2 } = await scenario();
  const a = await login({ sub: "a@example.com" }), b = await login({ sub: "b" });
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(80, 90, 70)), a);   // 77
  let r = await get("tastings/" + t.id + "/results");
  assert.equal(r.statusCode, 200);
  let x = r.body.wines.find(w => w.id === w1.id);
  assert.deepEqual([x.votes, x.average, x.hidden], [1, null, true], "con un solo voto niente media");
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(90, 90, 90)), b);   // 90
  r = await get("tastings/" + t.id + "/results");
  x = r.body.wines.find(w => w.id === w1.id);
  assert.deepEqual([x.votes, x.average, x.hidden], [2, 83.5, false]);
  assert.deepEqual(r.body.wines.find(w => w.id === w2.id).votes, 0);
  assert.equal(r.body.minVotes, 2);
  const testo = JSON.stringify(r.body);
  assert.ok(!testo.includes("a@example.com") && !testo.includes('"b"'), "nessun identificativo utente nella risposta");
  assert.ok(!/giudizi|voti"|note/.test(testo.replace(/"votes"/g, "")), "nessun dettaglio dei voti");
});
test("risultati: degustazione di un altro partner o inesistente = 404", async () => {
  const { t } = await scenario();
  const k2 = await putPartner("altro");
  P.clearCache();
  let r = await call(v1, { method: "GET", url: "/api/v1?path=" + encodeURIComponent("tastings/" + t.id + "/results"), headers: { authorization: "Bearer " + k2 } });
  assert.equal(r.statusCode, 404);
  r = await get("tastings/nonesiste/results");
  assert.equal(r.statusCode, 404);
  r = await get("tastings/../x/results");
  assert.equal(r.statusCode, 404);
});
test("export CSV: intestazione, virgolette e protezione dalle formule", async () => {
  const { t, w1, w2 } = await scenario();
  const a = await login({ sub: "a" }), b = await login({ sub: "b" });
  for (const wid of [w1.id, w2.id]) {
    await post(Object.assign({ op: "vote", tasting: t.id, wine: wid }, smart(80, 80, 80)), a);
    await post(Object.assign({ op: "vote", tasting: t.id, wine: wid }, smart(90, 90, 90)), b);
  }
  const r = await get("tastings/" + t.id + "/results", { qs: "format=csv" });
  assert.equal(r.statusCode, 200);
  assert.match(r.headers["content-type"], /text\/csv/);
  assert.match(r.headers["content-disposition"], /attachment; filename="sorso-/);
  const righe = r.body.trim().split("\r\n");
  assert.equal(righe[0], "tasting_id,tasting,wine_id,producer,name,vintage,votes,average");
  assert.equal(righe.length, 3);
  assert.ok(righe[1].endsWith(",2,85"), righe[1]);
  assert.ok(righe[2].includes("\"'=HYPERLINK(\"\"http://x\"\")\""), "formula neutralizzata e virgolette raddoppiate: " + righe[2]);
  assert.ok(righe[2].includes('"Con ""virgolette"", e virgola"'));
});
test("cancellazione utente via API, con id che contiene la chiocciola", async () => {
  const { t, w1 } = await scenario();
  const a = await login({ sub: "anna@example.com" }), b = await login({ sub: "b" });
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(60, 60, 60)), a);
  await post(Object.assign({ op: "vote", tasting: t.id, wine: w1.id }, smart(90, 90, 90)), b);
  let r = await call(v1, { method: "DELETE", url: "/api/v1?path=" + encodeURIComponent("users/anna@example.com"), headers: { authorization: "Bearer " + KEY } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { votesRemoved: 1 });
  const x = (await get("tastings/" + t.id + "/results")).body.wines.find(w => w.id === w1.id);
  assert.equal(x.votes, 1);
  r = await call(v1, { method: "DELETE", url: "/api/v1?path=" + encodeURIComponent("users/a b"), headers: { authorization: "Bearer " + KEY } });
  assert.equal(r.statusCode, 400);
});
test("percorsi e metodi: 404 e 405", async () => {
  assert.equal((await get("boh")).statusCode, 404);
  assert.equal((await get("")).statusCode, 404);
  assert.equal((await call(v1, { method: "POST", url: "/api/v1?path=tastings", headers: { authorization: "Bearer " + KEY } })).statusCode, 405);
  assert.equal((await call(v1, { method: "GET", url: "/api/v1?path=users%2Fx", headers: { authorization: "Bearer " + KEY } })).statusCode, 405);
});
test("limite di richieste per chiave", async () => {
  let last;
  for (let i = 0; i < 122; i++) last = await get("tastings");
  assert.equal(last.statusCode, 429);
  assert.ok(last.headers["retry-after"]);
});
test("quota in sola lettura: lettura sì, cancellazione no", async () => {
  await redis.set(quota.monthKey(), String(Math.round(quota.LIMIT * 0.97)));
  quota.reset();
  assert.equal((await get("tastings")).statusCode, 200);
  const r = await call(v1, { method: "DELETE", url: "/api/v1?path=users%2Fx", headers: { authorization: "Bearer " + KEY } });
  assert.equal(r.statusCode, 503);
});
