const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { setup } = require("./helpers/env");
const jwt = require("../api/_jwt");
const P = require("../api/_partner");
const limit = require("../api/_limit");
const quota = require("../api/_quota");
const { getRedis } = require("../api/_redis");

let srv, redis;
const SECRET = crypto.randomBytes(32).toString("hex");
const now = () => Math.floor(Date.now() / 1000);
const claims = (o) => Object.assign({ iss: "demo", sub: "u1", name: "Anna", team: "t1", role: "member", jti: "jti-" + crypto.randomBytes(6).toString("hex"), exp: now() + 300 }, o);

async function putPartner(extra) {
  const apiKey = P.newApiKey("demo");
  const cfg = Object.assign({ id: "demo", name: "Demo", active: true, secret: SECRET, apiKeyHash: P.sha256(apiKey),
    origins: ["https://sito.example"], modes: ["smart", "full"] }, extra);
  await redis.set("p:demo", JSON.stringify(cfg));
  P.clearCache();
  return { cfg, apiKey };
}

test.before(async () => { srv = await setup(); redis = getRedis(); });
test.after(async () => { await srv.stop(); });
test.beforeEach(() => { srv.reset(); P.clearCache(); quota.reset(); });

/* ---- JWT ---- */
test("jwt: firma e verifica", () => {
  const t = jwt.sign({ a: 1, exp: now() + 60 }, "s");
  assert.equal(jwt.verify(t, "s").a, 1);
});
test("jwt: firma sbagliata", () => {
  const t = jwt.sign({ exp: now() + 60 }, "s");
  assert.throws(() => jwt.verify(t, "altro"), e => e.code === "signature");
});
test("jwt: alg none rifiutato", () => {
  const b = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const t = b({ alg: "none", typ: "JWT" }) + "." + b({ exp: now() + 60 }) + ".";
  assert.throws(() => jwt.verify(t, "s"), e => e.code === "alg" || e.code === "malformed");
});
test("jwt: alg diverso da HS256 rifiutato", () => {
  const b = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = b({ alg: "HS512", typ: "JWT" }), p = b({ exp: now() + 60 });
  const sig = crypto.createHmac("sha512", "s").update(h + "." + p).digest("base64url");
  assert.throws(() => jwt.verify(h + "." + p + "." + sig, "s"), e => e.code === "alg");
});
test("jwt: scaduto, scadenza troppo lontana, exp mancante, nbf futuro", () => {
  assert.throws(() => jwt.verify(jwt.sign({ exp: now() - 600 }, "s"), "s"), e => e.code === "expired");
  assert.throws(() => jwt.verify(jwt.sign({ exp: now() + 7200 }, "s"), "s"), e => e.code === "exp_too_far");
  assert.throws(() => jwt.verify(jwt.sign({ sub: "x" }, "s"), "s"), e => e.code === "exp_missing");
  assert.throws(() => jwt.verify(jwt.sign({ exp: now() + 100, nbf: now() + 600 }, "s"), "s"), e => e.code === "not_yet");
});
test("jwt: tolleranza di 60 secondi sull'orologio", () => {
  assert.doesNotThrow(() => jwt.verify(jwt.sign({ exp: now() - 30 }, "s"), "s"));
});
test("jwt: token malformati", () => {
  ["", "a.b", "a.b.c.d", "!!.!!.!!", null, undefined].forEach(t => assert.throws(() => jwt.verify(t, "s"), e => e instanceof jwt.AuthError));
});

/* ---- tema, origini, chiave ---- */
test("tema: accetta solo valori sicuri", () => {
  const t = P.sanitizeTheme({ accent: "#AA0011", bg: "red", ink: "#12345", font: "serif", title: 'Club <b>"x"</b>', logo: "https://a.example/l.png" });
  assert.equal(t.accent, "#aa0011");
  assert.equal(t.bg, undefined);
  assert.equal(t.ink, undefined);
  assert.equal(t.font, "serif");
  assert.equal(t.title, "Club bx/b");
  assert.equal(t.logo, "https://a.example/l.png");
});
test("tema: logo non https o con caratteri pericolosi scartato; font fuori elenco scartato", () => {
  assert.equal(P.sanitizeTheme({ logo: "http://a.example/l.png" }).logo, undefined);
  assert.equal(P.sanitizeTheme({ logo: "javascript:alert(1)" }).logo, undefined);
  assert.equal(P.sanitizeTheme({ logo: 'https://a.example/l.png"onerror=' }).logo, undefined);
  assert.equal(P.sanitizeTheme({ font: "Comic Sans" }).font, undefined);
});
test("themeCss: nessun testo libero dentro il CSS", () => {
  const css = P.themeCss({ accent: "#aa0011;} body{display:none", font: "mono" });
  assert.ok(!/display:none/.test(css));
  assert.ok(/--font:/.test(css));
});
test("origini: solo https (http solo localhost se consentito), niente percorsi", () => {
  assert.equal(P.normalizeOrigin("https://sito.example"), "https://sito.example");
  assert.equal(P.normalizeOrigin("https://sito.example/"), "https://sito.example");
  assert.equal(P.normalizeOrigin("http://sito.example"), null);
  assert.equal(P.normalizeOrigin("https://sito.example/pagina"), null);
  assert.equal(P.normalizeOrigin("http://localhost:3000"), null);
  assert.equal(P.normalizeOrigin("http://localhost:3000", true), "http://localhost:3000");
  assert.equal(P.normalizeOrigin("non un url"), null);
});
test("frame-ancestors: 'self' più le origini valide", () => {
  assert.equal(P.frameAncestors({ origins: ["https://a.example", "http://nope.example"] }), "'self' https://a.example");
  assert.equal(P.frameAncestors({ origins: [] }), "'self'");
});
test("chiave API: formato e riconoscimento del partner", () => {
  const k = P.newApiKey("demo");
  assert.match(k, /^sk_demo_[0-9a-f]{48}$/);
  assert.equal(P.partnerIdOfKey(k), "demo");
  assert.equal(P.partnerIdOfKey("sk_demo_zz"), null);
  assert.equal(P.partnerIdOfKey("altro"), null);
});

/* ---- partner e token ---- */
test("loadPartner: sconosciuto, disattivato, id non valido", async () => {
  assert.equal(await P.loadPartner(redis, "demo"), null);
  await putPartner({ active: false });
  assert.equal(await P.loadPartner(redis, "demo"), null);
  assert.equal(await P.loadPartner(redis, "../x"), null);
  assert.equal(await P.loadPartner(redis, undefined), null);
});
test("loadPartner: usa la cache (un solo comando Redis)", async () => {
  await putPartner();
  srv.log.length = 0;
  await P.loadPartner(redis, "demo");
  await P.loadPartner(redis, "demo");
  await P.loadPartner(redis, "demo");
  assert.equal(srv.log.filter(c => c === "GET").length, 1);
});
test("partnerFromApiKey: chiave giusta, sbagliata, di un altro partner", async () => {
  const { apiKey } = await putPartner();
  assert.equal((await P.partnerFromApiKey(redis, apiKey)).id, "demo");
  await assert.rejects(P.partnerFromApiKey(redis, apiKey.slice(0, -1) + "0"), e => e.code === "api_key");
  await assert.rejects(P.partnerFromApiKey(redis, "sk_altro_" + "a".repeat(48)), e => e.code === "api_key");
  await assert.rejects(P.partnerFromApiKey(redis, ""), e => e.code === "api_key");
});
test("verifyPartnerToken: token valido", async () => {
  await putPartner();
  const r = await P.verifyPartnerToken(redis, jwt.sign(claims({ role: "organizer", lang: "en" }), SECRET));
  assert.equal(r.ctx.uid, "u1");
  assert.equal(r.ctx.team, "t1");
  assert.equal(r.ctx.role, "organizer");
  assert.equal(r.ctx.lang, "en");
  assert.equal(r.partner.id, "demo");
});
test("verifyPartnerToken: ruolo assente = member", async () => {
  await putPartner();
  const c = claims(); delete c.role;
  assert.equal((await P.verifyPartnerToken(redis, jwt.sign(c, SECRET))).ctx.role, "member");
});
test("verifyPartnerToken: claim non validi", async () => {
  await putPartner();
  const bad = [
    [claims({ role: "admin" }), "claim_role"],
    [claims({ sub: "" }), "claim_sub"],
    [claims({ sub: "a b" }), "claim_sub"],
    [claims({ team: "x/y" }), "claim_team"],
    [claims({ jti: "corto" }), "claim_jti"],
    [claims({ iss: "altro" }), "partner"]
  ];
  for (const [c, code] of bad) {
    await assert.rejects(P.verifyPartnerToken(redis, jwt.sign(c, SECRET)), e => e.code === code, code);
  }
});
test("verifyPartnerToken: firmato con un altro segreto", async () => {
  await putPartner();
  await assert.rejects(P.verifyPartnerToken(redis, jwt.sign(claims(), "altro-segreto")), e => e.code === "signature");
});
test("verifyPartnerToken: scadenza oltre 15 minuti rifiutata", async () => {
  await putPartner();
  await assert.rejects(P.verifyPartnerToken(redis, jwt.sign(claims({ exp: now() + 3600 }), SECRET)), e => e.code === "exp_too_far");
});
test("consumeJti: monouso", async () => {
  assert.equal(await P.consumeJti(redis, "demo", "abcdefgh", now() + 300), true);
  assert.equal(await P.consumeJti(redis, "demo", "abcdefgh", now() + 300), false);
  assert.equal(await P.consumeJti(redis, "altro", "abcdefgh", now() + 300), true);
});

/* ---- sessione dell'embed ---- */
test("sessione: coniata e verificata", async () => {
  const { cfg } = await putPartner();
  const tok = P.mintSession(cfg, { uid: "u1", name: "Anna", team: "t1", role: "organizer", lang: "it" });
  const r = await P.verifySession(redis, tok);
  assert.deepEqual(r.ctx, { uid: "u1", name: "Anna", team: "t1", role: "organizer", lang: "it" });
});
test("sessione: manomessa, scaduta, con segreto ruotato", async () => {
  const { cfg } = await putPartner();
  const tok = P.mintSession(cfg, { uid: "u1", name: "A", team: "t1", role: "member" });
  const [a, b, c] = tok.split(".");
  const evil = Buffer.from(JSON.stringify({ p: "demo", u: "u1", n: "A", t: "t1", r: "organizer", exp: now() + 9999 })).toString("base64url");
  await assert.rejects(P.verifySession(redis, a + "." + evil + "." + c), e => e.code === "session");
  await assert.rejects(P.verifySession(redis, "x.y.z"), e => e.code === "session");
  await assert.rejects(P.verifySession(redis, ""), e => e.code === "session");
  const old = P.mintSession(cfg, { uid: "u1", name: "A", team: "t1", role: "member" }, now() - 5 * 3600);
  await assert.rejects(P.verifySession(redis, old), e => e.code === "session_expired");
  await putPartner({ secret: crypto.randomBytes(32).toString("hex") });
  await assert.rejects(P.verifySession(redis, tok), e => e.code === "session");
});
test("sessione: con partner disattivato non vale più", async () => {
  const { cfg } = await putPartner();
  const tok = P.mintSession(cfg, { uid: "u1", name: "A", team: "t1", role: "member" });
  await putPartner({ active: false });
  await assert.rejects(P.verifySession(redis, tok), e => e.code === "session");
});
test("sessione: il token del partner non è una sessione e viceversa", async () => {
  const { cfg } = await putPartner();
  await assert.rejects(P.verifySession(redis, jwt.sign(claims(), SECRET)), e => e.code === "session");
  await assert.rejects(P.verifyPartnerToken(redis, P.mintSession(cfg, { uid: "u1", name: "A", team: "t1", role: "member" })), e => e instanceof jwt.AuthError);
});

/* ---- limiti e quota ---- */
test("limite di richieste: scatta alla soglia", async () => {
  for (let i = 1; i <= 3; i++) assert.equal((await limit.hit(redis, "x", 3, 60)).ok, true);
  const r = await limit.hit(redis, "x", 3, 60);
  assert.equal(r.ok, false);
  assert.ok(r.retryAfter >= 1 && r.retryAfter <= 60);
  assert.equal((await limit.hit(redis, "altro", 3, 60)).ok, true);
});
test("limite di richieste: costa 2 comandi la prima volta, 1 le altre", async () => {
  srv.log.length = 0;
  await limit.hit(redis, "c", 10, 60);
  assert.equal(srv.log.length, 2);
  srv.log.length = 0;
  await limit.hit(redis, "c", 10, 60);
  assert.equal(srv.log.length, 1);
});
test("quota: conta i comandi, li somma al contatore mensile e passa le soglie", async () => {
  const q = quota.track(redis);
  await quota.ensure(redis);
  for (let i = 0; i < 30; i++) await q.set("k" + i, "v");
  await quota.flush(redis);
  assert.equal(Number(await redis.get(quota.monthKey())), 30);
  assert.equal(quota.level(), "ok");
  await redis.set(quota.monthKey(), String(Math.round(quota.LIMIT * 0.85)));
  quota.reset(); await quota.ensure(redis);
  assert.equal(quota.level(), "warn");
  assert.doesNotThrow(() => quota.assertWritable());
  await redis.set(quota.monthKey(), String(Math.round(quota.LIMIT * 0.97)));
  quota.reset(); await quota.ensure(redis);
  assert.equal(quota.level(), "readonly");
  assert.throws(() => quota.assertWritable(), e => e.status === 503 && e.code === "read_only");
});
test("quota: conta anche i comandi di una pipeline", async () => {
  const q = quota.track(redis);
  await quota.ensure(redis);
  const p = q.pipeline();
  for (let i = 0; i < 40; i++) p.set("p" + i, "v");
  await p.exec();
  await quota.flush(redis);
  assert.equal(Number(await redis.get(quota.monthKey())), 40);
});
