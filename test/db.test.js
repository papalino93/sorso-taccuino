/* Il proxy chiave-valore dell'app personale (api/db.js): lo spazio privato è di ognuno,
   lo spazio condiviso — solo per gli eventi — non lascia a nessuno di rovinare i dati degli altri. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, call } = require("./helpers/env");
const { getRedis } = require("../api/_redis");
const db = require("../api/db");

let srv, redis;
const sess = async (name) => { const t = "tok-" + name; await redis.set("session:" + t, name); return t; };
const op = (token, body) => call(db, { method: "POST", headers: { authorization: "Bearer " + token }, body });
const VOTE = (slug, id) => "evento:" + slug + ":1760000000000-" + (id || "ab12");

test.before(async () => { srv = await setup(); redis = getRedis(); });
test.after(async () => { await srv.stop(); });
test.beforeEach(() => { srv.reset(); });

test("privato: ognuno vede solo le proprie chiavi; list con caratteri speciali resta nel proprio spazio", async () => {
  const a = await sess("anna"), b = await sess("bruno");
  await op(a, { op: "set", key: "scheda:1", value: "{\"n\":1}" });
  await op(b, { op: "set", key: "scheda:2", value: "{\"n\":2}" });
  assert.deepEqual((await op(a, { op: "list", prefix: "scheda:" })).body.keys, ["scheda:1"]);
  assert.deepEqual((await op(b, { op: "list", prefix: "*" })).body.keys, []);   // l'asterisco non è un jolly
  assert.equal((await op(b, { op: "get", key: "scheda:1" })).body, null);
});

test("condiviso: si possono toccare solo l'indice e i voti degli eventi", async () => {
  const a = await sess("anna");
  for (const key of ["profilo-taccuino", "u:bruno:scheda:1", "evento:x", "../x"]) {
    assert.equal((await op(a, { op: "set", key, value: "{}", shared: true })).statusCode, 403, key);
    assert.equal((await op(a, { op: "get", key, shared: true })).statusCode, 403, key);
  }
  assert.equal((await op(a, { op: "list", prefix: "", shared: true })).statusCode, 403);
  assert.equal((await op(a, { op: "list", prefix: "u:", shared: true })).statusCode, 403);
});

test("condiviso: un voto si scrive una volta sola e nessuno lo cancella", async () => {
  const a = await sess("anna"), b = await sess("bruno");
  const k = VOTE("serata");
  const v = JSON.stringify({ wineLabel: "Barolo", score: 88, scale: 2, ts: 1 });
  assert.equal((await op(a, { op: "set", key: k, value: v, shared: true })).statusCode, 200);
  const falso = JSON.stringify({ wineLabel: "Barolo", score: 50, scale: 2, ts: 2 });
  assert.equal((await op(b, { op: "set", key: k, value: falso, shared: true })).statusCode, 409);
  assert.equal(JSON.parse((await op(b, { op: "get", key: k, shared: true })).body.value).score, 88);
  assert.equal((await op(b, { op: "delete", key: k, shared: true })).statusCode, 403);
  assert.equal((await op(a, { op: "delete", key: k, shared: true })).statusCode, 403);
  assert.deepEqual((await op(b, { op: "list", prefix: "evento:serata:", shared: true })).body.keys, [k]);
});

test("condiviso: voti non validi rifiutati", async () => {
  const a = await sess("anna");
  const k = VOTE("serata", "zz99");
  for (const value of ["non json", "[1]", JSON.stringify({ wineLabel: "x", score: 500 }), JSON.stringify({ wineLabel: 5, score: 80 }), JSON.stringify({ wineLabel: "x".repeat(2000), score: 80 })]) {
    assert.equal((await op(a, { op: "set", key: k, value, shared: true })).statusCode, 400, value.slice(0, 20));
  }
});

test("condiviso: l'indice degli eventi si può solo allungare e il proprietario lo mette il server", async () => {
  const a = await sess("anna"), b = await sess("bruno");
  await op(a, { op: "set", key: "eventi-indice", value: JSON.stringify([{ name: "Serata Nebbiolo", slug: "serata-nebbiolo", owner: "anna" }]), shared: true });
  /* Bruno prova a togliere la voce di Anna, a rinominarla e a intestarsene un'altra a nome di Anna */
  await op(b, { op: "set", key: "eventi-indice", value: JSON.stringify([
    { name: "Rubata", slug: "serata-nebbiolo", owner: "bruno" },
    { name: "Corso", slug: "corso", owner: "anna" },
    { name: "", slug: "vuoto", owner: null },
    { name: "Cattivo", slug: "../x", owner: null }
  ]), shared: true });
  const idx = JSON.parse((await op(a, { op: "get", key: "eventi-indice", shared: true })).body.value);
  assert.deepEqual(idx.map(e => e.slug), ["serata-nebbiolo", "corso"]);
  assert.equal(idx[0].name, "Serata Nebbiolo"); assert.equal(idx[0].owner, "anna");
  assert.equal(idx[1].owner, "bruno");
  assert.equal((await op(b, { op: "set", key: "eventi-indice", value: "[]", shared: true })).statusCode, 200);
  assert.equal(JSON.parse((await op(a, { op: "get", key: "eventi-indice", shared: true })).body.value).length, 2, "un elenco vuoto non cancella niente");
  assert.equal((await op(b, { op: "set", key: "eventi-indice", value: "{}", shared: true })).statusCode, 400);
});

test("condiviso: limite orario di scritture", async () => {
  const a = await sess("anna");
  let ultimo = 200;
  for (let i = 0; i < 125 && ultimo === 200; i++) {
    const r = await op(a, { op: "set", key: VOTE("serata", "k" + String(i).padStart(3, "0")), value: JSON.stringify({ wineLabel: "x", score: 70 }), shared: true });
    ultimo = r.statusCode;
  }
  assert.equal(ultimo, 429);
});

test("senza accesso: 401", async () => {
  assert.equal((await op("falso", { op: "get", key: "x" })).statusCode, 401);
});
