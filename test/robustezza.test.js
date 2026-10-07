/* Difetti trovati dalla verifica approfondita (corse tra richieste simultanee, tetti,
   input strani, tema illeggibile…): ognuno ha qui il test che lo riproduceva. */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { setup, call } = require("./helpers/env");
const jwt = require("../api/_jwt");
const P = require("../api/_partner");
const quota = require("../api/_quota");
const Team = require("../api/_team");
const { cleanText } = require("../api/_http");
const { getRedis } = require("../api/_redis");
const embed = require("../api/embed");
const v1 = require("../api/v1");

let srv, redis, KEY;
const SECRET = crypto.randomBytes(32).toString("hex");
const now = () => Math.floor(Date.now() / 1000);

async function putPartner(id, extra) {
  const apiKey = P.newApiKey(id);
  await redis.sadd("partners", id);
  await redis.set("p:" + id, JSON.stringify(Object.assign({ id, name: id, active: true, secret: SECRET, apiKeyHash: P.sha256(apiKey), origins: [], modes: ["smart", "full"] }, extra)));
  P.clearCache();
  return apiKey;
}
const tok = o => jwt.sign(Object.assign({ iss: "demo", sub: "u1", name: "A", team: "t1", role: "member", jti: "j-" + crypto.randomBytes(6).toString("hex"), exp: now() + 300 }, o), SECRET);
const post = (body, s) => call(embed, { method: "POST", body, headers: Object.assign({ "x-forwarded-for": "7.7.7.7" }, s ? { authorization: "Bearer " + s } : {}) });
const login = async o => { const r = await post({ op: "session", token: tok(o) }); assert.equal(r.statusCode, 200, JSON.stringify(r.body)); return r.body.session; };
const smart = (a, b, c) => ({ mode: "smart", giudizi: { occhio: a, naso: b, bocca: c } });
const get = path => call(v1, { method: "GET", url: "/api/v1?path=" + encodeURIComponent(path), headers: { authorization: "Bearer " + KEY } });

async function scenario(team) {
  const org = await login({ sub: "org-" + (team || "t1"), role: "organizer", team: team || "t1" });
  const t = (await post({ op: "tasting.create", name: "Serata" }, org)).body.tasting;
  const w1 = (await post({ op: "wine.add", tasting: t.id, wine: { name: "Barolo" } }, org)).body.wine;
  const w2 = (await post({ op: "wine.add", tasting: t.id, wine: { name: "Etna" } }, org)).body.wine;
  return { org, t, w1, w2 };
}
const vote = (s, t, w, g) => post(Object.assign({ op: "vote", tasting: t.id, wine: w.id }, smart(g, g, g)), s);
/* i totali memorizzati devono coincidere con i voti veri */
async function coerente(t, wines) {
  const veri = await Team.recount(redis, "demo", t.id);   // ricalcola dai voti veri e riscrive
  for (const w of wines) {
    const v = veri.find(x => x.wine === w.id);
    const ct = Number(await redis.hget("ct:demo:" + t.id, w.id)), sm = Number(await redis.hget("sm:demo:" + t.id, w.id));
    assert.equal(ct, v ? v.votes : 0, "conteggio");
    assert.equal(sm, v ? v.sum : 0, "somma");
  }
  return veri;
}
/* confronta SENZA riscrivere: lo stato memorizzato prima del ricalcolo */
async function memorizzato(t, w) {
  return { ct: Number(await redis.hget("ct:demo:" + t.id, w.id)) || 0, sm: Number(await redis.hget("sm:demo:" + t.id, w.id)) || 0 };
}
async function veroDa(t, w) {
  const uids = await redis.smembers("vs:demo:" + t.id + ":" + w.id);
  let sum = 0, votes = 0;
  for (const u of uids) { const v = await redis.get("vt:demo:" + t.id + ":" + w.id + ":" + u); if (v) { sum += JSON.parse(v).s; votes++; } }
  return { ct: votes, sm: sum };
}

test.before(async () => { srv = await setup(); redis = getRedis(); });
test.after(async () => { await srv.stop(); });
test.beforeEach(async () => { srv.reset(); P.clearCache(); quota.reset(); KEY = await putPartner("demo"); });

/* ---------------- voti simultanei ---------------- */
test("20 voti simultanei dello stesso utente: un solo voto, conteggio 1, somma = ultimo voto", async () => {
  const { t, w1 } = await scenario();
  const m = await login({ sub: "m" });
  const valori = Array.from({ length: 20 }, (_, i) => 50 + i * 2);
  await Promise.all(valori.map(g => vote(m, t, w1, g)));
  const mem = await memorizzato(t, w1), vero = await veroDa(t, w1);
  assert.deepEqual(mem, vero, "i totali memorizzati coincidono con i voti veri");
  assert.equal(mem.ct, 1);
  assert.ok(mem.sm >= 50 && mem.sm <= 100, "somma = un voto valido (" + mem.sm + ")");
  const ris = (await get("tastings/" + t.id + "/results")).body.wines.find(w => w.id === w1.id);
  assert.equal(ris.votes, 1);
  assert.equal(ris.average, null);
});
test("rivoti simultanei: la media non esce mai dalla scala 50-100", async () => {
  const { t, w1 } = await scenario();
  const a = await login({ sub: "a" }), b = await login({ sub: "b" });
  await vote(b, t, w1, 80);
  for (let giro = 0; giro < 5; giro++) {
    const r = await Promise.all([vote(a, t, w1, 60), vote(a, t, w1, 100), vote(a, t, w1, 75), vote(a, t, w1, 90)]);
    r.forEach(x => assert.equal(x.statusCode, 200));
    const st = (await post({ op: "state", tasting: t.id }, a)).body;
    const avg = st.wines.find(w => w.id === w1.id).team.avg;
    assert.ok(avg >= 50 && avg <= 100, "media " + avg);
  }
  const mem = await memorizzato(t, w1);
  assert.deepEqual(mem, await veroDa(t, w1));
  assert.equal(mem.ct, 2);
});
test("30 utenti votano insieme: nessun voto si perde", async () => {
  const { t, w1 } = await scenario();
  const utenti = await Promise.all(Array.from({ length: 30 }, (_, i) => login({ sub: "u" + i })));
  await Promise.all(utenti.map((s, i) => vote(s, t, w1, 60 + i)));
  const mem = await memorizzato(t, w1);
  assert.equal(mem.ct, 30);
  assert.equal(mem.sm, Array.from({ length: 30 }, (_, i) => 60 + i).reduce((a, b) => a + b, 0));
});
test("voti, rivoti e cancellazioni mescolati: i totali restano uguali ai voti veri", async () => {
  const { t, w1, w2 } = await scenario();
  const sessioni = {};
  for (const u of ["a", "b", "c", "d"]) sessioni[u] = await login({ sub: u });
  const ops = [];
  for (let i = 0; i < 40; i++) {
    const u = ["a", "b", "c", "d"][i % 4], w = i % 2 ? w1 : w2;
    ops.push(vote(sessioni[u], t, w, 55 + ((i * 7) % 45)));
    if (i % 5 === 0) ops.push(Team.deleteUser(redis, "demo", u));
  }
  await Promise.all(ops);
  for (const w of [w1, w2]) assert.deepEqual(await memorizzato(t, w), await veroDa(t, w), "vino " + w.name);
  for (const w of [w1, w2]) { const m = await memorizzato(t, w); assert.ok(m.ct >= 0 && m.sm >= 0); }
});

/* ---------------- cancellazione ---------------- */
test("cancellazioni simultanee dello stesso utente: si toglie una volta sola, mai conteggi negativi", async () => {
  const { t, w1 } = await scenario();
  const a = await login({ sub: "a" }), b = await login({ sub: "b" });
  await vote(a, t, w1, 60); await vote(b, t, w1, 90);
  const r = await Promise.all(Array.from({ length: 6 }, () => Team.deleteUser(redis, "demo", "a")));
  assert.equal(r.reduce((s, x) => s + x.votesRemoved, 0), 1, "il voto è stato tolto una volta");
  const mem = await memorizzato(t, w1);
  assert.deepEqual(mem, { ct: 1, sm: 90 });
  const ris = (await get("tastings/" + t.id + "/results")).body.wines.find(w => w.id === w1.id);
  assert.equal(ris.votes, 1);
});
test("con un solo votante, cancellare due volte non porta il conteggio sotto zero", async () => {
  const { t, w1 } = await scenario();
  const a = await login({ sub: "a" });
  await vote(a, t, w1, 80);
  await Promise.all([Team.deleteUser(redis, "demo", "a"), Team.deleteUser(redis, "demo", "a")]);
  assert.deepEqual(await memorizzato(t, w1), { ct: 0, sm: 0 });
  assert.equal((await get("tastings/" + t.id + "/results")).body.wines.find(w => w.id === w1.id).votes, 0);
});
test("un voto che arriva durante la cancellazione dell'utente non diventa irraggiungibile", async () => {
  const { t, w1 } = await scenario();
  const a = await login({ sub: "a" });
  await vote(a, t, w1, 70);
  for (let i = 0; i < 10; i++) await Promise.all([Team.deleteUser(redis, "demo", "a"), vote(a, t, w1, 80)]);
  assert.deepEqual(await memorizzato(t, w1), await veroDa(t, w1));
  // qualunque cosa sia rimasta, una cancellazione finale la porta via
  await Team.deleteUser(redis, "demo", "a");
  assert.deepEqual(await memorizzato(t, w1), { ct: 0, sm: 0 });
  assert.equal(await redis.get("vt:demo:" + t.id + ":" + w1.id + ":a"), null);
});
test("la cancellazione di un utente non lascia il suo identificativo nei dati di degustazioni e vini", async () => {
  const { t } = await scenario();
  const raw = JSON.stringify(await redis.hgetall("tl:demo:t1")) + JSON.stringify(await redis.hgetall("wn:demo:" + t.id));
  assert.ok(!raw.includes("org-t1"), "createdBy non si salva più");
});
test("recount: ripara somma e conteggio andati fuori linea", async () => {
  const { t, w1 } = await scenario();
  const a = await login({ sub: "a" }), b = await login({ sub: "b" });
  await vote(a, t, w1, 60); await vote(b, t, w1, 90);
  await redis.hset("sm:demo:" + t.id, { [w1.id]: "9999" });
  await redis.hset("ct:demo:" + t.id, { [w1.id]: "-4" });
  await Team.recount(redis, "demo", t.id);
  assert.deepEqual(await memorizzato(t, w1), { ct: 2, sm: 150 });
});

/* ---------------- tetti ---------------- */
test("60 creazioni simultanee con 190 degustazioni già nel team: ne passano esattamente 10", async () => {
  const { org } = await scenario();
  await redis.hset("cn:demo", { "t:t1": "189" });      // 189 + quella dello scenario = 190
  const r = await Promise.all(Array.from({ length: 60 }, (_, i) => post({ op: "tasting.create", name: "n" + i }, org)));
  assert.equal(r.filter(x => x.statusCode === 200).length, Team.MAX_TASTINGS_PER_TEAM - 189 - 0, "passano solo quelle entro il tetto");
  assert.equal(r.filter(x => x.statusCode === 409).length, 60 - (Team.MAX_TASTINGS_PER_TEAM - 189));
  assert.equal(Number(await redis.hget("cn:demo", "t:t1")), Team.MAX_TASTINGS_PER_TEAM, "il contatore non supera il tetto");
});
test("30 aggiunte di vini simultanee con 95 già presenti: passano 5 su 30 (con 2 già dello scenario: 3)", async () => {
  const { org, t } = await scenario();
  await redis.hset("cn:demo", { ["w:" + t.id]: "95" });
  const r = await Promise.all(Array.from({ length: 30 }, (_, i) => post({ op: "wine.add", tasting: t.id, wine: { name: "v" + i } }, org)));
  assert.equal(r.filter(x => x.statusCode === 200).length, Team.MAX_WINES - 95);
  assert.equal(Number(await redis.hget("cn:demo", "w:" + t.id)), Team.MAX_WINES);
});
test("il tetto vale per team: un team pieno non blocca gli altri", async () => {
  const { org } = await scenario("piena");
  await redis.hset("cn:demo", { "t:piena": String(Team.MAX_TASTINGS_PER_TEAM) });
  assert.equal((await post({ op: "tasting.create", name: "una in più" }, org)).statusCode, 409);
  const altra = await login({ sub: "o2", role: "organizer", team: "libera" });
  assert.equal((await post({ op: "tasting.create", name: "ok" }, altra)).statusCode, 200);
});
test("eliminare una degustazione libera il posto e toglie vini, voti e medie", async () => {
  const { org, t, w1 } = await scenario();
  const a = await login({ sub: "a" });
  await vote(a, t, w1, 80);
  const cnPrima = Number(await redis.hget("cn:demo", "t:t1"));
  const m = await login({ sub: "m" });
  assert.equal((await post({ op: "tasting.delete", tasting: t.id }, m)).statusCode, 403, "solo l'organizzatore");
  const r = await post({ op: "tasting.delete", tasting: t.id }, org);
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.votesRemoved, 1);
  assert.equal(Number(await redis.hget("cn:demo", "t:t1")), cnPrima - 1);
  const chiavi = (await redis.keys("*")).filter(k => k.includes(t.id) && !k.startsWith("uv:"));
  assert.deepEqual(chiavi, [], "nessuna chiave della degustazione resta");
  assert.equal((await post({ op: "state", tasting: t.id }, org)).statusCode, 404);
  assert.equal((await get("tastings/" + t.id + "/results")).statusCode, 404);
  assert.deepEqual((await post({ op: "state" }, org)).body.tastings, []);
  assert.equal((await Team.deleteUser(redis, "demo", "a")).votesRemoved, 0, "la cancellazione utente non si inceppa su voti già spariti");
  assert.equal((await post({ op: "tasting.delete", tasting: t.id }, org)).statusCode, 404, "ripetere non fa danni");
});
test("un altro team non può eliminare la degustazione", async () => {
  const { t } = await scenario();
  const x = await login({ sub: "x", role: "organizer", team: "altro" });
  assert.equal((await post({ op: "tasting.delete", tasting: t.id }, x)).statusCode, 404);
});
test("le degustazioni dei team non finiscono nello stato di un altro team (struttura per team)", async () => {
  await scenario("uno"); await scenario("due");
  const u = await login({ sub: "z", team: "uno" });
  assert.equal((await post({ op: "state" }, u)).body.tastings.length, 1);
  const lista = (await call(v1, { method: "GET", url: "/api/v1?path=tastings", headers: { authorization: "Bearer " + KEY } })).body.tastings;
  assert.equal(lista.length, 2, "l'API vede tutti i team");
});

/* ---------------- input strani: sempre un errore chiaro, mai un 500 ---------------- */
test("nomi, annate, note e id che non sono testo: 400 o 404, mai 500", async () => {
  const { org, t, w1 } = await scenario();
  const m = await login({ sub: "m" });
  const strani = [{ a: 1 }, [1, 2], 5, true, null, { toString: 1 }, { toString: () => "x" }, Array.from({ length: 20000 }).reduce(a => [a], [])];
  for (const v of strani) {
    const nome = Array.isArray(v) && v.length === 1 ? "lista annidata" : JSON.stringify(v);     // serializzare 20.000 livelli farebbe esplodere il test, non il codice
    for (const r of [await post({ op: "tasting.create", name: v }, org), await post({ op: "wine.add", tasting: t.id, wine: { name: v } }, org)]) {
      assert.ok(r.statusCode === 400, String(nome).slice(0, 40) + " → " + r.statusCode);
    }
    const rp = await post({ op: "wine.add", tasting: t.id, wine: { name: "ok", producer: v } }, org);   // il produttore è facoltativo: un valore non valido si ignora
    assert.equal(rp.statusCode, 200); assert.equal(rp.body.wine.producer, "");
    const rv = await post({ op: "vote", tasting: t.id, wine: w1.id, mode: "smart", giudizi: { occhio: 70, naso: 70, bocca: 70 }, note: v }, m);
    assert.equal(rv.statusCode, 200, "una nota non valida si ignora, non rompe il voto");
    assert.equal((await post({ op: "state", tasting: v }, m)).statusCode, 200, "un id che non è testo equivale a nessuna degustazione scelta");
    for (const r of [await post({ op: v }, m), await post({ op: "vote", tasting: v, wine: w1.id, mode: "smart", giudizi: { occhio: 70, naso: 70, bocca: 70 } }, m),
      await post({ op: "vote", tasting: t.id, wine: v, mode: "smart", giudizi: { occhio: 70, naso: 70, bocca: 70 } }, m)]) {
      assert.ok([400, 404].includes(r.statusCode), String(nome).slice(0, 40) + " → " + r.statusCode);
    }
  }
});
test("corpo della richiesta che non è un oggetto", async () => {
  for (const body of [null, "testo", 5, [1, 2], "[1]", '{"op":']) {
    const r = await call(embed, { method: "POST", body, headers: {} });
    assert.ok(r.statusCode >= 400 && r.statusCode < 500, JSON.stringify(body) + " → " + r.statusCode);
  }
});
test("testi: caratteri invisibili e di controllo, coppie surrogate, lunghezza", () => {
  assert.equal(cleanText("​‍‮﻿", 50), "", "solo invisibili = vuoto");
  assert.equal(cleanText("ab‮cd", 50), "abcd", "niente inversione di direzione");
  assert.equal(cleanText("a\u0000b\tc\nd", 50), "a b c d");
  assert.equal(cleanText("  tanti    spazi  ", 50), "tanti spazi");
  const emoji = "😀".repeat(200);
  const tagliata = cleanText(emoji, 100);
  assert.equal(Array.from(tagliata).length, 100);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(tagliata), "nessuna metà di emoji");
  assert.equal(cleanText("è un nome", 50), "è un nome");
  assert.equal(cleanText("مرحبا بالعالم", 50), "مرحبا بالعالم", "il testo da destra a sinistra resta com'è");
  for (const v of [5, {}, [], null, undefined, true]) assert.equal(cleanText(v, 10), "");
});
test("un nome fatto solo di caratteri invisibili viene rifiutato", async () => {
  const { org, t } = await scenario();
  assert.equal((await post({ op: "tasting.create", name: "​​​" }, org)).statusCode, 400);
  assert.equal((await post({ op: "wine.add", tasting: t.id, wine: { name: "‮‮" } }, org)).statusCode, 400);
});
test("annata: quattro cifre plausibili oppure NV", async () => {
  const { org, t } = await scenario();
  const add = v => post({ op: "wine.add", tasting: t.id, wine: { name: "x", vintage: v } }, org);
  for (const v of ["2018", "1999", "nv", "NV", 2020, ""]) assert.equal((await add(v)).statusCode, 200, String(v));
  for (const v of ["0000", "1200", "9999", "20x8", "201", "20188", "N V"]) assert.equal((await add(v)).statusCode, 400, String(v));
  const w = (await add("nv")).body.wine; assert.equal(w.vintage, "NV");
});
test("v1: percorsi con % isolati, id strani: 404, non 500", async () => {
  for (const path of ["%", "tastings/%/results", "users/%E0%A4%A", "tastings/%ZZ", "tastings/..%2f..%2fx/results", "tastings/" + "a".repeat(5000) + "/results"]) {
    const r = await call(v1, { method: "GET", url: "/api/v1?path=" + path, headers: { authorization: "Bearer " + KEY } });
    assert.ok([400, 404].includes(r.statusCode), path.slice(0, 30) + " → " + r.statusCode);
  }
});
test("un partner con configurazione rotta non fa dare errori interni", async () => {
  await redis.sadd("partners", "rotto2");
  await redis.set("p:rotto2", JSON.stringify({ id: "rotto2", active: true }));      // senza segreto
  P.clearCache();
  const t = jwt.sign({ iss: "rotto2", sub: "u", team: "t", jti: "jjjjjjjj", exp: now() + 100 }, "qualcosa");
  const r = await post({ op: "session", token: t });
  assert.equal(r.statusCode, 401);
  const k = "sk_rotto2_" + "a".repeat(48);
  assert.equal((await call(v1, { method: "GET", url: "/api/v1?path=tastings", headers: { authorization: "Bearer " + k } })).statusCode, 401);
  const pagina = await call(require("../api/embed-page"), { method: "GET", url: "/embed?p=rotto2" });
  assert.equal(pagina.statusCode, 404);
});

/* ---------------- token ---------------- */
test("token: la scadenza massima è esattamente 15 minuti, non 16", async () => {
  assert.equal((await post({ op: "session", token: tok({ exp: now() + 890 }) })).statusCode, 200);
  const r = await post({ op: "session", token: tok({ exp: now() + 960 }) });
  assert.equal(r.statusCode, 401);
  assert.equal(r.body.error.code, "exp_too_far");
  assert.equal((await post({ op: "session", token: tok({ exp: now() + 961 }) })).statusCode, 401);
});

/* ---------------- tema: sempre leggibile ---------------- */
test("tema: qualunque combinazione di colori produce una tavolozza leggibile (3000 casi)", () => {
  let seed = 99;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const hex = () => "#" + [0, 0, 0].map(() => rnd(256).toString(16).padStart(2, "0")).join("");
  const rgb = h => P.hex2rgb(h);
  for (let i = 0; i < 3000; i++) {
    const t = {}; if (rnd(3)) t.accent = hex(); if (rnd(3)) t.bg = hex(); if (rnd(3)) t.ink = hex();
    const r = P.resolveTheme(t);
    if (!t.accent && !t.bg && !t.ink) { assert.equal(r, null); continue; }
    const c = k => rgb(r[k]);
    const ctx = JSON.stringify(t) + " → " + JSON.stringify(r);
    assert.ok(P.contrast(c("--ink"), c("--bg")) >= 4.5, "testo/sfondo " + ctx);
    assert.ok(P.contrast(c("--ink"), c("--surface")) >= 4.4, "testo/riquadri " + ctx);
    assert.ok(P.contrast(c("--muted"), c("--surface")) >= 4.5, "testo secondario " + ctx);
    assert.ok(P.contrast(c("--on-accent"), c("--accent")) >= 4.5, "testo sull'accento " + ctx);
    assert.ok(P.contrast(c("--accent"), c("--bg")) >= 3, "accento/sfondo " + ctx);
    for (const k of ["--ok", "--warn", "--danger"]) assert.ok(P.contrast(c(k), c("--surface")) >= 4.5, k + " " + ctx);
  }
});
test("tema: i casi segnalati — solo sfondo, solo accento, accento giallo su bianco, testo uguale allo sfondo", () => {
  const casi = [{ bg: "#ffffff" }, { bg: "#0b0b0b" }, { accent: "#3a0a14" }, { accent: "#ffff00", bg: "#ffffff" }, { ink: "#ffffff" }, { ink: "#336699", bg: "#336699" }, { accent: "#ffff00" }];
  for (const t of casi) {
    const r = P.resolveTheme(t);
    assert.ok(P.contrast(P.hex2rgb(r["--ink"]), P.hex2rgb(r["--bg"])) >= 4.5, JSON.stringify(t));
    assert.ok(P.contrast(P.hex2rgb(r["--on-accent"]), P.hex2rgb(r["--accent"])) >= 4.5, JSON.stringify(t));
    assert.ok(P.contrast(P.hex2rgb(r["--accent"]), P.hex2rgb(r["--bg"])) >= 3, JSON.stringify(t));
  }
  assert.equal(P.resolveTheme({ bg: "#ffffff" })["color-scheme"], "light");
  assert.equal(P.resolveTheme({ bg: "#0b0b0b" })["color-scheme"], "dark");
  assert.equal(P.resolveTheme({ ink: "#ffffff" })["color-scheme"], "dark", "solo testo chiaro: sfondo scuro");
  assert.equal(P.themeCss({}), "");
  assert.equal(P.themeCss({ font: "mono" }).includes("color-scheme"), false, "solo il carattere: il resto segue il dispositivo");
});
