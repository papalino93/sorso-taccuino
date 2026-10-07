const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { setup, call } = require("./helpers/env");
const P = require("../api/_partner");
const quota = require("../api/_quota");
const { getRedis } = require("../api/_redis");
const page = require("../api/embed-page");

let srv, redis;
async function putPartner(extra) {
  await redis.set("p:demo", JSON.stringify(Object.assign({ id: "demo", name: "Demo", active: true, secret: "s".repeat(64), origins: ["https://sito.example", "https://www.sito.example"], theme: {}, lang: "it" }, extra)));
  P.clearCache();
}
const get = (q, o) => call(page, Object.assign({ method: "GET", url: "/embed" + q }, o));

test.before(async () => { srv = await setup(); redis = getRedis(); });
test.after(async () => { await srv.stop(); });
test.beforeEach(async () => { srv.reset(); P.clearCache(); quota.reset(); await putPartner(); });

test("pagina: frame-ancestors con i soli domini del partner", async () => {
  const r = await get("?p=demo");
  assert.equal(r.statusCode, 200);
  const csp = r.headers["content-security-policy"];
  assert.match(csp, /frame-ancestors 'self' https:\/\/sito\.example https:\/\/www\.sito\.example$/);
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'(;|$)/, "nessuno script inline");
  assert.ok(!/unsafe-inline/.test(csp));
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /form-action 'none'/);
});
test("pagina: intestazioni di sicurezza", async () => {
  const r = await get("?p=demo");
  assert.equal(r.headers["referrer-policy"], "no-referrer");
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(r.headers["x-content-type-options"], "nosniff");
  assert.match(r.headers["content-type"], /text\/html/);
  assert.ok(!r.headers["x-frame-options"], "X-Frame-Options non va usato: frame-ancestors lo sostituisce");
});
test("pagina: un partner senza origini non è incorporabile da nessuno", async () => {
  await putPartner({ origins: [] });
  assert.match((await get("?p=demo")).headers["content-security-policy"], /frame-ancestors 'self'$/);
});
test("pagina: origini non valide ignorate", async () => {
  await putPartner({ origins: ["http://insicuro.example", "https://ok.example", "https://ok.example/percorso"] });
  assert.match((await get("?p=demo")).headers["content-security-policy"], /frame-ancestors 'self' https:\/\/ok\.example$/);
});
test("pagina: partner sconosciuto, disattivato o senza p = 404 e nessun incorporamento", async () => {
  for (const q of ["?p=ignoto", "", "?p=", "?p=../x"]) {
    const r = await get(q);
    assert.equal(r.statusCode, 404, q);
    assert.match(r.headers["content-security-policy"], /frame-ancestors 'none'/);
  }
  await putPartner({ active: false });
  assert.equal((await get("?p=demo")).statusCode, 404);
});
test("pagina: il tema è solo CSS controllato, con nonce", async () => {
  await putPartner({ theme: { accent: "#0a7a3c", bg: "#fafff8", font: "serif", title: "Club" } });
  const r = await get("?p=demo");
  const nonce = /nonce-([^']+)'/.exec(r.headers["content-security-policy"])[1];
  assert.ok(r.body.includes('<style nonce="' + nonce + '">:root{--accent:#0a7a3c;--bg:#fafff8;--font:Georgia'));
  assert.ok(!/<script[^>]*>[^<]/.test(r.body), "nessuno script inline");
});
test("pagina: tema con valori malevoli non finisce nel CSS", async () => {
  await putPartner({ theme: { accent: "red;}</style><script>alert(1)</script>", bg: "#12345g", font: "Comic Sans" } });
  const r = await get("?p=demo");
  assert.ok(!r.body.includes("alert(1)"));
  assert.ok(/<style nonce="[^"]+"><\/style>/.test(r.body));
});
test("pagina: il nonce cambia a ogni richiesta; la lingua segue il partner", async () => {
  const a = /nonce-([^']+)'/.exec((await get("?p=demo")).headers["content-security-policy"])[1];
  const b = /nonce-([^']+)'/.exec((await get("?p=demo")).headers["content-security-policy"])[1];
  assert.notEqual(a, b);
  await putPartner({ lang: "en" });
  assert.match((await get("?p=demo")).body, /<html lang="en">/);
});
test("pagina: carica solo script e stile propri", async () => {
  const r = await get("?p=demo");
  assert.ok(r.body.includes('<link rel="stylesheet" href="/embed.css">'));
  assert.ok(r.body.includes('<script src="/js/scoring.js"></script>'));
  assert.ok(r.body.includes('<script src="/embed.js"></script>'));
  assert.ok(!/https?:\/\//.test(r.body.replace(/<!doctype[^>]*>/i, "")), "nessun riferimento esterno");
});
test("pagina: solo GET/HEAD", async () => {
  assert.equal((await get("?p=demo", { method: "POST" })).statusCode, 405);
  assert.equal((await get("?p=demo", { method: "HEAD" })).statusCode, 200);
});
