/* Mail degli inviti alle cerchie: servizio di posta esterno (Resend o Brevo), limiti anti-spam, nessun errore se manca. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, call } = require("./helpers/env");
const { getRedis } = require("../api/_redis");
const quota = require("../api/_quota");
const circles = require("../api/circles");
const mail = require("../api/_mail");

let srv, redis;
const realFetch = global.fetch;
const sent = [];
function stubFetch(mode) {
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (!/api\.resend\.com|api\.brevo\.com/.test(u)) return realFetch(url, opts);   // il finto Redis resta raggiungibile
    sent.push({ url: u, headers: opts.headers, body: JSON.parse(opts.body) });
    if (mode === "reject") throw new Error("rete assente con chiave re_ABCDEFGHIJKLMNOPQRSTUV");
    if (mode === "500") return { ok: false, status: 500 };
    return { ok: true, status: 200 };
  };
}
function env(o) { ["RESEND_API_KEY", "BREVO_API_KEY", "MAIL_FROM", "APP_ORIGIN"].forEach(k => delete process.env[k]); Object.assign(process.env, o || {}); }

async function account(name, email) {
  const username = "google:" + name;
  await redis.set("user:" + username, JSON.stringify({ provider: "google", email, name: name[0].toUpperCase() + name.slice(1) + " Rossi" }));
  await redis.set("session:tok-" + name, username);
}
const op = (who, body) => call(circles, { method: "POST", headers: { authorization: "Bearer tok-" + who, "x-forwarded-for": "1.1.1.1", host: "evil.example", "x-forwarded-host": "evil.example" }, body });
const ok = async (who, body) => { const r = await op(who, body); assert.equal(r.statusCode, 200, JSON.stringify([body, r.body])); return r.body; };

test.before(async () => { srv = await setup(); redis = getRedis(); });
test.after(async () => { global.fetch = realFetch; env(); await srv.stop(); });
test.beforeEach(() => { srv.reset(); quota.reset(); sent.length = 0; env(); stubFetch(); });

test("senza servizio di posta: l'invito si crea, la mail è «off», niente chiamate esterne", async () => {
  await account("anna", "anna@example.com");
  const { circle } = await ok("anna", { op: "create", name: "Corso" });
  const r = await ok("anna", { op: "invite", circle: circle.id, emails: ["bruno@example.com"] });
  assert.equal(r.results[0].status, "invited"); assert.equal(r.results[0].mail, "off"); assert.equal(r.mail, false);
  assert.equal(sent.length, 0);
  assert.equal((await ok("anna", { op: "list" })).mail, false);
});

test("Resend: la mail parte con link fisso, oggetto fisso, testo ripulito", async () => {
  env({ RESEND_API_KEY: "re_test_key_000000000000000000", MAIL_FROM: "Taste <inviti@esempio.it>" });
  await account("anna", "anna@example.com");
  const { circle } = await ok("anna", { op: "create", name: '<script>alert(1)</script> "Corso"' });
  const r = await ok("anna", { op: "invite", circle: circle.id, emails: ["bruno@example.com"], role: "admin" });
  assert.equal(r.results[0].mail, "sent"); assert.equal(r.mail, true);
  assert.equal(sent.length, 1);
  const m = sent[0];
  assert.equal(m.url, "https://api.resend.com/emails");
  assert.equal(m.headers.Authorization, "Bearer re_test_key_000000000000000000");
  assert.equal(m.body.from, "Taste <inviti@esempio.it>"); assert.deepEqual(m.body.to, ["bruno@example.com"]);
  assert.equal(m.body.subject, "Hai un invito su Taste", "il nome della cerchia non finisce nell'oggetto");
  const link = "https://sorso-taccuino.vercel.app/?invito=" + r.results[0].token;
  assert.ok(m.body.text.includes(link) && m.body.html.includes(link), "il link è quello del sito, non dell'intestazione Host della richiesta");
  assert.ok(!JSON.stringify(m.body).includes("evil.example"));
  assert.ok(!m.body.html.includes("<script>") && m.body.html.includes("&lt;script&gt;"), "il nome della cerchia è senza HTML");
  assert.ok(m.body.text.includes("Amministratore") && m.body.text.includes("Anna Rossi"));
});

test("APP_ORIGIN cambia l'indirizzo dei link; un valore strano è ignorato", async () => {
  env({ RESEND_API_KEY: "re_k", MAIL_FROM: "inviti@esempio.it", APP_ORIGIN: "https://sorso.esempio.it/" });
  await account("anna", "anna@example.com");
  const { circle } = await ok("anna", { op: "create", name: "C" });
  await ok("anna", { op: "invite", circle: circle.id, emails: ["b@example.com"] });
  assert.ok(sent[0].body.text.includes("https://sorso.esempio.it/?invito="));
  sent.length = 0; env({ RESEND_API_KEY: "re_k", MAIL_FROM: "inviti@esempio.it", APP_ORIGIN: "javascript:alert(1)" });
  await ok("anna", { op: "invite", circle: circle.id, emails: ["c@example.com"] });
  assert.ok(sent[0].body.text.includes("https://sorso-taccuino.vercel.app/?invito="));
});

test("Brevo: stessa mail con il formato di Brevo", async () => {
  env({ BREVO_API_KEY: "brevo-key", MAIL_FROM: "Taste <inviti@esempio.it>" });
  await account("anna", "anna@example.com");
  const { circle } = await ok("anna", { op: "create", name: "Corso" });
  const r = await ok("anna", { op: "invite", circle: circle.id, emails: ["bruno@example.com"] });
  assert.equal(r.results[0].mail, "sent");
  assert.equal(sent[0].url, "https://api.brevo.com/v3/smtp/email"); assert.equal(sent[0].headers["api-key"], "brevo-key");
  assert.deepEqual(sent[0].body.sender, { name: "Taste", email: "inviti@esempio.it" }); assert.deepEqual(sent[0].body.to, [{ email: "bruno@example.com" }]);
  assert.ok(sent[0].body.textContent.includes("?invito="));
});

test("servizio che non risponde: l'invito resta, la mail è «failed», la chiave non compare nella risposta", async () => {
  env({ RESEND_API_KEY: "re_ABCDEFGHIJKLMNOPQRSTUV", MAIL_FROM: "inviti@esempio.it" });
  await account("anna", "anna@example.com");
  const { circle } = await ok("anna", { op: "create", name: "Corso" });
  for (const mode of ["reject", "500"]) {
    stubFetch(mode);
    const r = await op("anna", { op: "invite", circle: circle.id, emails: [mode + "@example.com"] });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.results[0].status, "invited"); assert.equal(r.body.results[0].mail, "failed"); assert.ok(r.body.results[0].token);
    assert.ok(!JSON.stringify(r.body).includes("re_ABCDEFGHIJKLMNOPQRSTUV"));
  }
});

test("mittente non valido o senza chiave: il servizio non è attivo", async () => {
  env({ RESEND_API_KEY: "re_k", MAIL_FROM: "non un indirizzo" }); assert.equal(mail.enabled(), false);
  env({ MAIL_FROM: "inviti@esempio.it" }); assert.equal(mail.enabled(), false);
  env({ RESEND_API_KEY: "re_k", MAIL_FROM: "inviti@esempio.it" }); assert.equal(mail.enabled(), true);
});

test("anti-spam: limite per destinatario e per chi invita", async () => {
  env({ RESEND_API_KEY: "re_k", MAIL_FROM: "inviti@esempio.it" });
  await account("anna", "anna@example.com");
  /* la stessa persona riceve al massimo 5 mail al giorno, anche da cerchie diverse */
  const stati = [];
  for (let i = 0; i < 4; i++) {
    const { circle } = await ok("anna", { op: "create", name: "C" + i });
    for (const mail of ["x" + i + "@example.com"]) stati.push((await ok("anna", { op: "invite", circle: circle.id, emails: ["vittima@example.com", mail] })).results.map(r => r.mail));
  }
  const verso = stati.map(x => x[0]);
  assert.deepEqual(verso, ["sent", "sent", "sent", "sent"]);
  /* e chi invita non supera 30 mail al giorno */
  await account("bea", "bea@example.com");
  const c = (await ok("bea", { op: "create", name: "Grande" })).circle;
  let inviate = 0, limitate = 0;
  for (let k = 0; k < 4; k++) {
    const r = await ok("bea", { op: "invite", circle: c.id, emails: Array.from({ length: 10 }, (_, i) => "g" + k + "x" + i + "@example.com") });
    r.results.forEach(x => { if (x.mail === "sent") inviate++; if (x.mail === "limited") limitate++; });
  }
  assert.equal(inviate, 30); assert.equal(limitate, 10);
});

test("rimandare la mail: solo admin, al massimo 3 volte, «off» se non c'è il servizio", async () => {
  env({ RESEND_API_KEY: "re_k", MAIL_FROM: "inviti@esempio.it" });
  await account("anna", "anna@example.com"); await account("carla", "carla@example.com");
  const { circle } = await ok("anna", { op: "create", name: "Corso" });
  const t = (await ok("anna", { op: "invite", circle: circle.id, emails: ["carla@example.com", "dario@example.com"] })).results;
  await ok("carla", { op: "invite.accept", token: t[0].token });
  assert.equal((await op("carla", { op: "invite.resend", circle: circle.id, invite: t[1].id })).statusCode, 403, "un Membro non può");
  sent.length = 0;
  const esiti = [];
  for (let i = 0; i < 4; i++) esiti.push((await ok("anna", { op: "invite.resend", circle: circle.id, invite: t[1].id })).mail);
  assert.deepEqual(esiti, ["sent", "sent", "sent", "limited"]);
  assert.equal(sent.length, 3);
  assert.equal((await op("anna", { op: "invite.resend", circle: circle.id, invite: "0000000000" })).statusCode, 404);
  env();
  assert.equal((await ok("anna", { op: "invite.resend", circle: circle.id, invite: t[1].id })).mail, "off");
});
