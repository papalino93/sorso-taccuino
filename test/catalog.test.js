/* Catalogo Sorso e codici a barre (Open Food Facts), e il confronto a somiglianza che li usa. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, call } = require("./helpers/env");
const { getRedis } = require("../api/_redis");
const quota = require("../api/_quota");
const catalog = require("../api/catalog");
const Cat = require("../api/_catalog");
const WineMatch = require("../public/js/wine-match.js");

let srv, redis;
const ip = { n: 0 };
async function account(name) { await redis.set("session:tok-" + name, "google:" + name); }
const R = (who, body) => call(catalog, { method: "POST", headers: Object.assign({ "x-forwarded-for": "7.7.7." + (ip.n++ % 250) }, who ? { authorization: "Bearer tok-" + who } : {}), body });
const ok = async (who, body) => { const r = await R(who, body); assert.equal(r.statusCode, 200, JSON.stringify([body, r.body])); return r.body; };
const giovesone = { nome: "Giovesone", produttore: "Fattoria del Colle", denominazione: "Orcia", tipologia: "Rosso", vitigni: ["Sangiovese"], annata: "2020" };
const lettura = { text: "GIOVES0NE\nORCIA\nDENOMINAZIONE DI ORIGINE CONTROLLATA\nFATTORIA DEL C0LLE\n2021", denominazione: "Orcia", annata: "2021" };

test.before(async () => { srv = await setup(); redis = getRedis(); });
test.after(async () => { await srv.stop(); Cat.setFetch(null); });
test.beforeEach(async () => { srv.reset(); quota.reset(); Cat.resetCache(); for (const n of ["anna", "carla", "bea", "dario"]) await account(n); });

test("confronto: riconosce il vino dal testo letto male, mette insieme le annate, non confonde vini diversi", () => {
  const list = [{ nome: "Rosso di Marte", produttore: "Ruffino", annata: "2021" }, { nome: "Rosso di Marte", produttore: "Ruffino", annata: "2022" },
    { nome: "Chianti Classico", produttore: "Fontodi" }, { nome: "Chianti Classico", produttore: "Castello di Ama" }];
  const r = WineMatch.rank(list, { text: "R0SSO DI MARTE\nMORELLINO DI SCANSANO\nRUFFlNO", annata: "2022" });
  assert.ok(r.strong); assert.equal(r.strong.wine.annata, "2022", "a parità si preferisce l'annata letta");
  assert.equal(r.list.length, 1, "lo stesso vino in due annate compare una volta");
  const c = WineMatch.rank(list, { nome: "Chianti Classico", denominazione: "Chianti Classico", text: "Rocca delle Macie chianti classico" });
  assert.equal(c.strong, null, "con il solo nome della denominazione non si indovina il produttore");
  assert.ok(WineMatch.sameWine({ nome: "Flaccianello", produttore: "Fontodi" }, { nome: "Flaccianello della Pieve", produttore: "Fontodi" }));
  assert.ok(!WineMatch.sameWine({ nome: "Chianti Classico", produttore: "Fontodi" }, { nome: "Chianti Classico", produttore: "Castello di Ama" }));
  assert.ok(WineMatch.rank([{ nome: "Riserva", produttore: "Cantina Sociale" }], { text: "riserva doc 2019" }).strong === null, "un nome di parole comuni non basta");
});

test("un vino confermato da una persona serve solo a lei; con la seconda diventa di tutti", async () => {
  const a = await ok("anna", { op: "confirm", wine: giovesone });
  assert.equal(a.created, true); assert.equal(a.public, false);
  let s = await ok("anna", { op: "search", q: lettura });
  assert.equal(s.results[0].nome, "Giovesone"); assert.equal(s.results[0].mine, true); assert.equal(s.results[0].pending, true);
  assert.equal((await ok("carla", { op: "search", q: lettura })).results.length, 0, "gli altri non lo vedono ancora");
  assert.equal((await ok(null, { op: "search", q: lettura })).results.length, 0, "nemmeno chi non ha fatto l'accesso");
  /* Carla lo conferma scritto un po' diverso: si unisce alla stessa voce */
  const c = await ok("carla", { op: "confirm", wine: { nome: "Giovesone", produttore: "Fattoria Del Colle", annata: "2021" } });
  assert.equal(c.id, a.id); assert.equal(c.created, false); assert.equal(c.public, true); assert.equal(c.confirmations, 2);
  /* la stessa persona che conferma due volte non conta doppio */
  assert.equal((await ok("carla", { op: "confirm", wine: giovesone })).confirmations, 2);
  s = await ok(null, { op: "search", q: lettura });
  assert.equal(s.strong, true); assert.equal(s.results[0].nome, "Giovesone");
  assert.deepEqual(s.results[0].annate, ["2021", "2020"]); assert.equal(s.results[0].denominazione, "Orcia");
  /* nel catalogo non c'è nessuno: solo impronte */
  const raw = JSON.stringify(await redis.get("cat:w:" + a.id));
  assert.doesNotMatch(raw, /\banna\b|carla|google:/);
});

test("segnalazioni: con due persone la voce sparisce; chi l'ha inserita da solo la toglie subito; chi riconferma ne crea una nuova", async () => {
  const a = await ok("anna", { op: "confirm", wine: giovesone });
  await ok("carla", { op: "confirm", wine: giovesone });
  assert.equal((await R("dario", { op: "report", id: "zzzz" })).statusCode, 404);
  assert.equal((await R(null, { op: "report", id: a.id })).statusCode, 401, "segnalare vuole l'accesso");
  assert.equal((await ok("bea", { op: "report", id: a.id })).hidden, false);
  assert.equal((await ok("bea", { op: "report", id: a.id })).hidden, false, "la stessa persona non conta due volte");
  assert.equal((await ok("dario", { op: "report", id: a.id })).hidden, true);
  assert.equal((await ok(null, { op: "search", q: lettura })).results.length, 0);
  const n = await ok("bea", { op: "confirm", wine: giovesone });
  assert.notEqual(n.id, a.id, "una voce nascosta non raccoglie conferme");
  const mio = await ok("dario", { op: "confirm", wine: { nome: "Vino Sbagliatissimo", produttore: "Cantina Errata" } });
  assert.equal((await ok("dario", { op: "report", id: mio.id })).hidden, true);
});

test("dati ripuliti e limiti: nome e produttore obbligatori, campi tagliati, annata e tipologia controllate", async () => {
  assert.equal((await R("anna", { op: "confirm", wine: { nome: "Solo nome" } })).statusCode, 400);
  assert.equal((await R(null, { op: "confirm", wine: giovesone })).statusCode, 401);
  assert.equal((await R("anna", { op: "boh" })).statusCode, 400);
  const w = Cat.cleanWine({ nome: "x".repeat(200), produttore: "<b>P</b>", annata: "1850", tipologia: "Blu", vitigni: "Sangiovese, Merlot, " + "a,".repeat(20) });
  assert.equal(w.nome.length, 90); assert.equal(w.annata, ""); assert.equal(w.tipologia, ""); assert.equal(w.vitigni.length, 8);
  assert.equal(Cat.cleanEan("8001234567896").length, 0, "cifra di controllo sbagliata");
  assert.equal(Cat.cleanEan("8 000000 000002"), "8000000000002");
  assert.equal((await R("anna", { op: "search", ean: "123" })).statusCode, 400);
});

test("codice a barre: prima il catalogo, poi Open Food Facts (una volta sola, poi in memoria)", async () => {
  const calls = [];
  Cat.setFetch(async (url, opts) => {
    calls.push(url);
    assert.match(opts.headers["User-Agent"], /^Sorso\//);
    if (url.includes("8000000000002")) return { ok: true, status: 200, json: async () => ({ status: 1, product: { product_name: "Ruffino Rosso di Marte Morellino di Scansano 2022", brands: "Ruffino,Gruppo X", categories_tags: ["en:beverages", "en:wines", "en:red-wines"] } }) };
    if (url.includes("4006381333931")) return { ok: true, status: 200, json: async () => ({ status: 1, product: { product_name: "Birra chiara", brands: "Bionda", categories_tags: ["en:beers"] } }) };
    if (url.includes("5000000000005")) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: false, status: 404, json: async () => ({ status: 0 }) };
  });
  let s = await ok(null, { op: "search", ean: "8000000000002" });
  assert.equal(s.off.found, true); assert.equal(s.off.nome, "Rosso di Marte"); assert.equal(s.off.produttore, "Ruffino");
  assert.equal(s.off.tipologia, "Rosso"); assert.match(s.off.denominazione, /^Morellino di Scansano/); assert.equal(s.off.annata, "2022"); assert.equal(s.off.ean, "8000000000002");
  await ok(null, { op: "search", ean: "8000000000002" });
  assert.equal(calls.length, 1, "la seconda volta risponde la memoria");
  assert.equal((await ok(null, { op: "search", ean: "4006381333931" })).off.reason, "not_wine", "un codice che non è di un vino");
  assert.equal((await ok(null, { op: "search", ean: "5000000000005" })).off.reason, "unavailable");
  await ok(null, { op: "search", ean: "5000000000005" });
  assert.equal(calls.filter(u => u.includes("5000000000005")).length, 2, "se Open Food Facts non risponde non si ricorda il fallimento");
  /* quando un vino col codice è nel catalogo (di tutti) risponde quello, senza chiedere fuori */
  await ok("anna", { op: "confirm", wine: giovesone, ean: "0000000000017" });
  await ok("carla", { op: "confirm", wine: giovesone });
  const before = calls.length;
  s = await ok("bea", { op: "search", ean: "0000000000017" });
  assert.equal(s.strong, true); assert.equal(s.results[0].nome, "Giovesone"); assert.equal(calls.length, before);
  /* non trovato e senza testo: risposta vuota, non un errore */
  s = await ok(null, { op: "search", ean: "0000000000024" });
  assert.equal(s.off.found, false); assert.equal(s.results.length, 0);
});

test("limite per indirizzo sulla ricerca", async () => {
  const H = { "x-forwarded-for": "9.8.7.6" };
  let last;
  for (let i = 0; i < 31; i++) last = await call(catalog, { method: "POST", headers: H, body: { op: "search", q: { text: "x" } } });
  assert.equal(last.statusCode, 429);
  assert.equal((await call(catalog, { method: "GET", headers: H })).statusCode, 405);
});
