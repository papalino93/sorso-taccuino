/* Widget per i siti: link di sola lettura con le statistiche di una cerchia. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, call } = require("./helpers/env");
const { getRedis } = require("../api/_redis");
const quota = require("../api/_quota");
const circles = require("../api/circles");
const embed = require("../api/embed");
const widget = require("../api/widget");

let srv, redis;
const users = {};
async function account(name, email) {
  const username = "google:" + name;
  await redis.set("user:" + username, JSON.stringify({ provider: "google", email, name: name[0].toUpperCase() + name.slice(1) + " Rossi" }));
  await redis.set("session:tok-" + name, username);
  users[name] = { token: "tok-" + name };
}
const C = (who, body) => call(circles, { method: "POST", headers: { authorization: "Bearer " + users[who].token, "x-forwarded-for": "1.1.1.1" }, body });
const E = (who, body) => call(embed, { method: "POST", headers: { authorization: "Bearer " + users[who].token, "x-forwarded-for": "1.1.1.1" }, body });
const ok = async (fn, who, body) => { const r = await fn(who, body); assert.equal(r.statusCode, 200, JSON.stringify([body, r.body])); return r.body; };
const W = (qs, ip) => call(widget, { method: "GET", url: "/widget?" + qs, headers: { "x-forwarded-for": ip || "5.5.5.5" } });
const smart = n => ({ mode: "smart", giudizi: { occhio: n, naso: n, bocca: n } });

async function scena(name) {
  for (const [n, e] of [["anna", "anna@example.com"], ["carla", "carla@example.com"], ["bea", "bea@example.com"]]) await account(n, e);
  const { circle } = await ok(C, "anna", { op: "create", name: name || "Corso" });
  const inv = (await ok(C, "anna", { op: "invite", circle: circle.id, emails: ["carla@example.com", "bea@example.com"] })).results;
  await ok(C, "carla", { op: "invite.accept", token: inv[0].token }); await ok(C, "bea", { op: "invite.accept", token: inv[1].token });
  return circle.id;
}

test.before(async () => { srv = await setup(); redis = getRedis(); });
test.after(async () => { await srv.stop(); });
test.beforeEach(() => { srv.reset(); quota.reset(); });

test("il link lo creano solo Proprietario e amministratori; sempre lo stesso finché non lo si rinnova", async () => {
  const cid = await scena();
  assert.equal((await C("carla", { op: "widget.create", circle: cid })).statusCode, 403);
  const a = (await ok(C, "anna", { op: "widget.create", circle: cid })).widget;
  assert.match(a.token, /^[0-9a-f]{48}$/);
  assert.equal((await ok(C, "anna", { op: "widget.create", circle: cid })).widget.token, a.token);
  assert.equal((await ok(C, "anna", { op: "get", circle: cid })).widget.token, a.token);
  assert.equal((await ok(C, "carla", { op: "get", circle: cid })).widget, undefined, "il Membro non vede il link");
  const b = (await ok(C, "anna", { op: "widget.create", circle: cid, rotate: true })).widget;
  assert.notEqual(b.token, a.token);
  assert.equal((await W("t=" + a.token)).statusCode, 404, "il vecchio link non vale più");
  assert.equal((await W("t=" + b.token)).statusCode, 200);
});

test("mostra solo aggregati delle serate chiuse: medie dal secondo voto, alla cieca nascosto, nessun nome", async () => {
  const cid = await scena("Corso <b>del</b> giovedì");
  const { widget: w } = await ok(C, "anna", { op: "widget.create", circle: cid });
  let r = await W("t=" + w.token);
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /La classifica compare quando si chiude la prima serata/);
  assert.match(r.body, /Corso &lt;b&gt;del&lt;\/b&gt; giovedì/, "il nome della cerchia è protetto");
  /* serata con due vini: il primo con due voti, il secondo con uno solo */
  const t = (await ok(E, "anna", { op: "tasting.create", circle: cid, name: "Serata Toscana" })).tasting;
  const w1 = (await ok(E, "anna", { op: "wine.add", circle: cid, tasting: t.id, wine: { name: "Brunello", producer: "Podere", vintage: "2018" } })).wine;
  const w2 = (await ok(E, "anna", { op: "wine.add", circle: cid, tasting: t.id, wine: { name: "Segreto", vintage: "2020" } })).wine;
  await ok(E, "carla", Object.assign({ op: "vote", circle: cid, tasting: t.id, wine: w1.id }, smart(90)));
  await ok(E, "bea", Object.assign({ op: "vote", circle: cid, tasting: t.id, wine: w1.id }, smart(80)));
  await ok(E, "carla", Object.assign({ op: "vote", circle: cid, tasting: t.id, wine: w2.id }, smart(70)));
  r = await W("t=" + w.token);
  assert.doesNotMatch(r.body, /Brunello/, "a serata aperta non si vede niente");
  await ok(E, "anna", { op: "tasting.status", circle: cid, tasting: t.id, status: "closed" });
  /* le statistiche stanno in memoria due minuti: per il test si buttano */
  await redis.del("st:cerchie:" + cid);
  r = await W("t=" + w.token);
  assert.match(r.body, /Brunello/); assert.match(r.body, /85,0/); assert.match(r.body, /2 voti/);
  assert.doesNotMatch(r.body, /Segreto/, "un vino con un voto solo non compare");
  assert.match(r.body, /<b>1<\/b><span>Serate<\/span>/); assert.match(r.body, /<b>2<\/b><span>Vini<\/span>/); assert.match(r.body, /<b>3<\/b><span>Voti<\/span>/);
  assert.doesNotMatch(r.body, /Anna|Carla|Bea|google:|example\.com/, "nessun nome né mail");
  /* alla cieca non svelata */
  const b = (await ok(E, "anna", { op: "tasting.create", circle: cid, name: "Cieca", blind: true })).tasting;
  const bw = (await ok(E, "anna", { op: "wine.add", circle: cid, tasting: b.id, wine: { name: "Nascosto" } })).wine;
  await ok(E, "carla", Object.assign({ op: "vote", circle: cid, tasting: b.id, wine: bw.id }, smart(95)));
  await ok(E, "bea", Object.assign({ op: "vote", circle: cid, tasting: b.id, wine: bw.id }, smart(95)));
  await ok(E, "anna", { op: "tasting.status", circle: cid, tasting: b.id, status: "closed" });
  await redis.del("st:cerchie:" + cid);
  r = await W("t=" + w.token + "&lang=en");
  assert.doesNotMatch(r.body, /Nascosto/); assert.match(r.body, /Wine 1 \(blind\)/); assert.match(r.body, /Best wines/); assert.match(r.body, /Taste · tasting notebook/); assert.doesNotMatch(r.body, /taccuino di degustazione/);
});

test("revoca ed eliminazione della cerchia spengono il widget; link falso 404", async () => {
  const cid = await scena();
  const { widget: w } = await ok(C, "anna", { op: "widget.create", circle: cid });
  assert.equal((await W("t=" + w.token)).statusCode, 200);
  assert.equal((await C("carla", { op: "widget.revoke", circle: cid })).statusCode, 403);
  await ok(C, "anna", { op: "widget.revoke", circle: cid });
  const r = await W("t=" + w.token);
  assert.equal(r.statusCode, 404); assert.match(r.body, /revocato/);
  const { widget: w2 } = await ok(C, "anna", { op: "widget.create", circle: cid });
  await ok(C, "anna", { op: "delete", circle: cid, confirm: true });
  assert.equal((await W("t=" + w2.token)).statusCode, 404);
  assert.equal(await redis.get("wt:" + w2.token), null);
  assert.equal((await W("t=nonvalido")).statusCode, 404);
  assert.equal((await W("t=" + "0".repeat(48))).statusCode, 404);
});

test("intestazioni: incorporabile ovunque, in cache, niente script esterni; colori e opzioni ripuliti", async () => {
  const cid = await scena();
  const { widget: w } = await ok(C, "anna", { op: "widget.create", circle: cid });
  const r = await W("t=" + w.token + "&theme=dark&accent=0f7a4d&bg=none&rows=3");
  const csp = r.headers["content-security-policy"];
  assert.match(csp, /frame-ancestors \*/); assert.match(csp, /default-src 'none'/); assert.doesNotMatch(csp, /unsafe/);
  assert.match(r.headers["cache-control"], /s-maxage=120/);
  assert.match(r.body, /--bg:transparent/); assert.match(r.body, /color-scheme:dark/);
  assert.doesNotMatch(r.body, /prefers-color-scheme/, "tema scuro scelto: niente tema automatico");
  const o = widget.options(new URLSearchParams("accent=\"><script>&bg=zz&rows=99&show=nulla&lang=xx&theme=rosa"));
  assert.equal(o.accent, null); assert.equal(o.bg, null); assert.equal(o.rows, 10); assert.equal(o.lang, "it"); assert.equal(o.theme, "auto");
  assert.deepEqual([...o.show].sort(), ["events", "top", "totals"]);
  assert.equal((await call(widget, { method: "POST", url: "/widget?t=" + w.token, headers: {} })).statusCode, 405);
});

test("2.12: viste nuove: palato (regione, vitigno, fascia solo da 5 voti), striscia, sfida e campo senza nomi", async () => {
  const cid = await scena("Team");
  const { widget: w } = await ok(C, "anna", { op: "widget.create", circle: cid });
  const t = (await ok(E, "anna", { op: "tasting.create", circle: cid, name: "Campioni" })).tasting;
  const v1 = (await ok(E, "anna", { op: "wine.add", circle: cid, tasting: t.id, wine: { name: "Etna", producer: "Benanti", type: "Rosso", grape: "Nerello", region: "Sicilia" } })).wine;
  assert.equal(v1.region, "Sicilia");
  for (const [who, n] of [["anna", 70], ["carla", 90], ["bea", 80]]) await ok(E, who, { op: "vote", circle: cid, tasting: t.id, wine: v1.id, ...smart(n) });
  await ok(E, "anna", { op: "tasting.status", circle: cid, tasting: t.id, status: "closed" });
  let r = await W("t=" + w.token + "&view=palato");
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /Il palato del team/); assert.match(r.body, /Rossi/); assert.match(r.body, /Sicilia/); assert.match(r.body, /Nerello/); assert.match(r.body, /I più votati/);
  assert.doesNotMatch(r.body, /Il più divisivo<\/span>/, "con tre voti niente fascia: direbbe chi ha dato quale voto");
  assert.match(r.body, /dai vini con almeno 5 voti/);
  r = await W("t=" + w.token + "&view=striscia");
  assert.match(r.body, /class="strip"/); assert.match(r.body, /Etna/);
  r = await W("t=" + w.token + "&view=sfida");
  assert.match(r.body, /Il gioco non è attivo in questa cerchia/);
  r = await W("t=" + w.token + "&view=campo");
  assert.match(r.body, /Il gioco non è attivo/);
  for (const name of ["Anna Rossi", "Carla Rossi", "Bea Rossi"]) assert.doesNotMatch((await W("t=" + w.token + "&view=palato")).body, new RegExp(name));
});

test("2.12: il podio con i nomi solo se il gioco è acceso E un amministratore lo permette; mai da un parametro", async () => {
  const cid = await scena("Team");
  const { widget: w } = await ok(C, "anna", { op: "widget.create", circle: cid });
  assert.equal((await C("carla", { op: "widget.names", circle: cid, on: true })).statusCode, 403, "il Membro non può");
  let r = await W("t=" + w.token + "&view=podio&names=1");
  assert.match(r.body, /Il podio con i nomi non è attivo/);
  await ok(C, "anna", { op: "widget.names", circle: cid, on: true });
  r = await W("t=" + w.token + "&view=podio", "5.5.5.6");
  assert.match(r.body, /non è attivo/, "senza gioco i nomi restano spenti");
  await ok(C, "anna", { op: "game.set", circle: cid, on: true });
  const t = (await ok(E, "anna", { op: "tasting.create", circle: cid, name: "Gioco" })).tasting;
  const v = (await ok(E, "anna", { op: "wine.add", circle: cid, tasting: t.id, wine: { name: "Etna" } })).wine;
  for (const [who, x, n] of [["anna", 2, 70], ["carla", 8, 90], ["bea", 5, 80]]) {
    await ok(E, who, { op: "game.play", circle: cid, tasting: t.id, wine: v.id, x, y: x, p: 80 });
    await ok(E, who, { op: "vote", circle: cid, tasting: t.id, wine: v.id, ...smart(n) });
  }
  r = await W("t=" + w.token + "&view=podio", "5.5.5.7");
  assert.match(r.body, /Carla Rossi/); assert.match(r.body, /Anna Rossi/);
  r = await W("t=" + w.token + "&view=campo", "5.5.5.8");
  assert.match(r.body.slice(r.body.indexOf("<main")), /class="d l/); assert.match(r.body, />CR</, "con il permesso: le iniziali sul campo");
  r = await W("t=" + w.token + "&view=sfida", "5.5.5.9");
  assert.match(r.body, /Mosse/); assert.doesNotMatch(r.body, /Carla Rossi/, "la sfida resta senza nomi");
  await ok(C, "anna", { op: "widget.names", circle: cid, on: false });
  await redis.del("gq:" + cid);
  r = await W("t=" + w.token + "&view=campo", "5.5.5.10");
  assert.doesNotMatch(r.body, />CR</, "spenti i nomi: punti anonimi");
  assert.match((await W("t=" + w.token + "&view=podio", "5.5.5.11")).body, /non è attivo/);
});
