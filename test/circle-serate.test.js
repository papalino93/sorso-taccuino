/* Serate nelle cerchie: lo stesso motore dello spazio di team, con l'accesso deciso dalla cerchia. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, call } = require("./helpers/env");
const { getRedis } = require("../api/_redis");
const quota = require("../api/_quota");
const circles = require("../api/circles");
const embed = require("../api/embed");
const embedPage = require("../api/embed-page");

let srv, redis;
const users = {};
async function account(name, email) {
  const username = "google:" + name;
  await redis.set("user:" + username, JSON.stringify({ provider: "google", email, name: name[0].toUpperCase() + name.slice(1) + " Rossi" }));
  await redis.set("session:tok-" + name, username);
  users[name] = { token: "tok-" + name, username };
}
const C = (who, body) => call(circles, { method: "POST", headers: { authorization: "Bearer " + users[who].token, "x-forwarded-for": "1.1.1.1" }, body });
const E = (who, body) => call(embed, { method: "POST", headers: { authorization: "Bearer " + (users[who] ? users[who].token : who), "x-forwarded-for": "1.1.1.1" }, body });
const ok = async (fn, who, body) => { const r = await fn(who, body); assert.equal(r.statusCode, 200, JSON.stringify([body, r.body])); return r.body; };
const smart = (a, b, c) => ({ mode: "smart", giudizi: { occhio: a, naso: b, bocca: c } });

/* anna Proprietario, bruno Amministratore, carla Membro; dario fuori */
async function scena() {
  for (const [n, e] of [["anna", "anna@example.com"], ["bruno", "bruno@example.com"], ["carla", "carla@example.com"], ["dario", "dario@example.com"]]) await account(n, e);
  const { circle } = await ok(C, "anna", { op: "create", name: "Corso" });
  const inv = (await ok(C, "anna", { op: "invite", circle: circle.id, emails: ["bruno@example.com", "carla@example.com"] })).results;
  await ok(C, "bruno", { op: "invite.accept", token: inv[0].token }); await ok(C, "carla", { op: "invite.accept", token: inv[1].token });
  const g = await ok(C, "anna", { op: "get", circle: circle.id });
  await ok(C, "anna", { op: "member.role", circle: circle.id, member: g.members.find(m => /^Bruno/.test(m.name)).mid, role: "admin" });
  return circle.id;
}

test.before(async () => { srv = await setup(); redis = getRedis(); });
test.after(async () => { await srv.stop(); });
test.beforeEach(() => { srv.reset(); quota.reset(); });

test("entrare: ruolo dalla cerchia; chi è fuori non vede niente; senza sessione 401", async () => {
  const cid = await scena();
  const a = await ok(E, "anna", { op: "session", circle: cid, mode: "full", lang: "en" });
  assert.equal(a.user.role, "organizer"); assert.equal(a.user.circleRole, "owner"); assert.equal(a.user.name, "Anna Rossi");
  assert.equal(a.config.defaultMode, "full"); assert.equal(a.config.lang, "en"); assert.equal(a.config.title, "Corso"); assert.equal(a.config.circle, true);
  assert.equal((await ok(E, "bruno", { op: "session", circle: cid })).user.role, "organizer");
  assert.equal((await ok(E, "carla", { op: "session", circle: cid })).user.role, "member");
  assert.equal((await E("dario", { op: "session", circle: cid })).statusCode, 404);
  assert.equal((await E("dario", { op: "state", circle: cid })).statusCode, 404);
  assert.equal((await E("nessuno", { op: "state", circle: cid })).statusCode, 401);
  assert.equal((await E("anna", { op: "state", circle: "zzzz" })).statusCode, 404);
});

test("una serata: gli organizzatori creano e aggiungono vini, i membri votano, le medie tornano", async () => {
  const cid = await scena();
  assert.equal((await E("carla", { op: "tasting.create", circle: cid, name: "No" })).statusCode, 403);
  const t = (await ok(E, "bruno", { op: "tasting.create", circle: cid, name: "Giovedì" })).tasting;
  const w = (await ok(E, "anna", { op: "wine.add", circle: cid, tasting: t.id, wine: { name: "Chianti", vintage: "2020" } })).wine;
  await ok(E, "carla", Object.assign({ op: "vote", circle: cid, tasting: t.id, wine: w.id }, smart(80, 80, 80)));
  await ok(E, "anna", Object.assign({ op: "vote", circle: cid, tasting: t.id, wine: w.id }, smart(90, 90, 90)));
  const st = await ok(E, "carla", { op: "state", circle: cid, tasting: t.id });
  assert.equal(st.wines[0].team.count, 2);
  assert.equal(st.wines[0].team.avg, 85);
  /* nessun nome di chi ha votato nella risposta */
  assert.ok(!/Anna|Carla|google:/.test(JSON.stringify(st)));
  /* le serate di una cerchia non si vedono da un'altra */
  const { circle: altra } = await ok(C, "anna", { op: "create", name: "Altra" });
  assert.equal((await ok(E, "anna", { op: "state", circle: altra.id })).tastings.length, 0);
  assert.equal((await E("anna", { op: "state", circle: altra.id, tasting: t.id })).statusCode, 404);
});

test("un solo vino: la degustazione nasce con il vino; se il vino non è valido non resta niente", async () => {
  const cid = await scena();
  const r = await ok(E, "anna", { op: "tasting.create", circle: cid, name: "Barolo 2016", wine: { name: "Barolo", producer: "Cascina", vintage: "2016", type: "Rosso" } });
  assert.equal(r.tasting.single, true); assert.equal(r.wine.name, "Barolo");
  const st = await ok(E, "carla", { op: "state", circle: cid, tasting: r.tasting.id });
  assert.equal(st.tasting.single, true); assert.equal(st.wines.length, 1);
  const before = (await ok(E, "anna", { op: "state", circle: cid })).tastings.length;
  assert.equal((await E("anna", { op: "tasting.create", circle: cid, name: "X", wine: { name: "Y", vintage: "20188" } })).statusCode, 400);
  assert.equal((await ok(E, "anna", { op: "state", circle: cid })).tastings.length, before, "nessuna degustazione orfana");
  /* «un solo vino» non è mai alla cieca */
  assert.equal((await ok(E, "anna", { op: "tasting.create", circle: cid, name: "Z", blind: true, wine: { name: "Z" } })).tasting.blind, undefined);
});

test("chi viene tolto perde subito l'accesso; il nuovo ruolo vale subito", async () => {
  const cid = await scena();
  await ok(E, "carla", { op: "state", circle: cid });
  const g = await ok(C, "anna", { op: "get", circle: cid });
  await ok(C, "anna", { op: "member.role", circle: cid, member: g.members.find(m => /^Carla/.test(m.name)).mid, role: "admin" });
  assert.equal((await ok(E, "carla", { op: "tasting.create", circle: cid, name: "Ora sì" })).tasting.name, "Ora sì");
  await ok(C, "anna", { op: "member.remove", circle: cid, member: g.members.find(m => /^Carla/.test(m.name)).mid });
  assert.equal((await E("carla", { op: "state", circle: cid })).statusCode, 404);
});

test("«Cancella i miei voti» vale solo per quella cerchia e ricalcola le medie", async () => {
  const cid = await scena();
  const { circle: altra } = await ok(C, "carla", { op: "create", name: "Di Carla" });
  const t1 = (await ok(E, "anna", { op: "tasting.create", circle: cid, name: "A", wine: { name: "V1" } }));
  const t2 = (await ok(E, "carla", { op: "tasting.create", circle: altra.id, name: "B", wine: { name: "V2" } }));
  await ok(E, "carla", Object.assign({ op: "vote", circle: cid, tasting: t1.tasting.id, wine: t1.wine.id }, smart(80, 80, 80)));
  await ok(E, "anna", Object.assign({ op: "vote", circle: cid, tasting: t1.tasting.id, wine: t1.wine.id }, smart(90, 90, 90)));
  await ok(E, "carla", Object.assign({ op: "vote", circle: altra.id, tasting: t2.tasting.id, wine: t2.wine.id }, smart(70, 70, 70)));
  assert.equal((await C("carla", { op: "votes.delete", circle: cid })).statusCode, 400, "serve la conferma");
  const r = await ok(C, "carla", { op: "votes.delete", circle: cid, confirm: true });
  assert.equal(r.votesRemoved, 1);
  const s1 = await ok(E, "anna", { op: "state", circle: cid, tasting: t1.tasting.id });
  assert.equal(s1.wines[0].team.count, 1); assert.equal(s1.wines[0].team.avg, 90);
  const s2 = await ok(E, "carla", { op: "state", circle: altra.id, tasting: t2.tasting.id });
  assert.equal(s2.wines[0].team.count, 1, "il voto nell'altra cerchia resta");
  assert.equal((await C("dario", { op: "votes.delete", circle: cid, confirm: true })).statusCode, 404);
});

test("esportazione: solo Proprietario e Amministratori; medie anonime, sotto i 2 voti niente media", async () => {
  const cid = await scena();
  const t = await ok(E, "anna", { op: "tasting.create", circle: cid, name: "Serata, con virgola", wine: { name: "=Vino pericoloso", vintage: "2019" } });
  await ok(E, "carla", Object.assign({ op: "vote", circle: cid, tasting: t.tasting.id, wine: t.wine.id }, smart(80, 80, 80)));
  assert.equal((await C("carla", { op: "export", circle: cid })).statusCode, 403);
  let x = await ok(C, "bruno", { op: "export", circle: cid });
  assert.match(x.csv, /^tasting_id,tasting,date,status,wine_id,producer,name,vintage,votes,average,rank\r\n/);
  assert.match(x.csv, /"Serata, con virgola"/); assert.match(x.csv, /'=Vino pericoloso/);
  assert.equal(x.json.tastings[0].wines[0].average, null, "un voto solo: niente media");
  await ok(E, "anna", Object.assign({ op: "vote", circle: cid, tasting: t.tasting.id, wine: t.wine.id }, smart(90, 90, 90)));
  x = await ok(C, "anna", { op: "export", circle: cid });
  assert.equal(x.json.tastings[0].wines[0].average, 85); assert.equal(x.json.circle.name, "Corso");
  assert.ok(!/Anna|Carla|google:|example\.com/.test(JSON.stringify(x)), "nessun nome né mail");
});

test("eliminando la cerchia spariscono serate, vini e voti", async () => {
  const cid = await scena();
  const t = await ok(E, "anna", { op: "tasting.create", circle: cid, name: "A", wine: { name: "V" } });
  await ok(E, "carla", Object.assign({ op: "vote", circle: cid, tasting: t.tasting.id, wine: t.wine.id }, smart(80, 80, 80)));
  await ok(C, "anna", { op: "delete", circle: cid, confirm: true });
  const left = (await redis.keys("*")).filter(k => !k.startsWith("rl:")).filter(k => k.indexOf(cid) >= 0 || k.indexOf(t.tasting.id) >= 0);
  assert.deepEqual(left, [], "chiavi rimaste: " + left.join(", "));
  assert.ok(!((await redis.smembers("tm:cerchie")) || []).includes(cid));
});

test("una sessione di partner non apre le cerchie; la pagina della cerchia si incorpora solo dall'app", async () => {
  const cid = await scena();
  assert.equal((await E("s1.abc.def", { op: "state", circle: cid })).statusCode, 401);
  const r = await call(embedPage, { method: "GET", url: "/embed?c=" + cid });
  assert.equal(r.statusCode, 200);
  assert.match(r.headers["content-security-policy"], /frame-ancestors 'self'/);
  assert.match(String(r.body), /embed\.js/);
});
