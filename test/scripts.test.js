const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/env");
const P = require("../api/_partner");
const quota = require("../api/_quota");
const { getRedis } = require("../api/_redis");
const partner = require("../scripts/partner");
const usage = require("../scripts/usage");

let srv, redis;
const run = async (args) => { const out = []; await partner.main(args, redis, l => out.push(l)); return out.join("\n"); };
const fails = async (args, re) => assert.rejects(run(args), re);

test.before(async () => { srv = await setup(); redis = getRedis(); });
test.after(async () => { await srv.stop(); });
test.beforeEach(() => { srv.reset(); P.clearCache(); });

test("create: scrive il partner e mostra segreto e chiave una volta sola", async () => {
  const out = await run(["create", "club-vini", "--name", "Club Vini", "--origin", "https://club.example", "--lang", "en"]);
  const secret = /Segreto di firma:\s+([0-9a-f]{64})/.exec(out)[1];
  const key = /Chiave API \(sola lettura\):\s+(sk_club-vini_[0-9a-f]{48})/.exec(out)[1];
  const cfg = JSON.parse(await redis.get("p:club-vini"));
  assert.equal(cfg.secret, secret);
  assert.equal(cfg.apiKeyHash, P.sha256(key));
  assert.ok(!JSON.stringify(cfg).includes(key), "la chiave non è salvata in chiaro");
  assert.deepEqual(cfg.origins, ["https://club.example"]);
  assert.equal(cfg.lang, "en");
  assert.equal(cfg.active, true);
  assert.deepEqual(cfg.modes, ["smart", "full"]);
  assert.ok((await redis.smembers("partners")).includes("club-vini"));
  assert.equal((await P.partnerFromApiKey(redis, key)).id, "club-vini");
  const shown = await run(["show", "club-vini"]);
  assert.ok(!shown.includes(secret) && !shown.includes(P.sha256(key)), "show non rivela segreti");
});
test("create: id non valido, nome mancante, doppione, origine non valida, modalità non valide", async () => {
  await fails(["create", "Club", "--name", "x"], /id non valido/);
  await fails(["create", "a", "--name", "x"], /id non valido/);
  await fails(["create", "club"], /--name/);
  await fails(["create", "club", "--name", "x", "--origin", "http://club.example"], /origine non valida/);
  await fails(["create", "club", "--name", "x", "--origin", "https://club.example/pagina"], /origine non valida/);
  await fails(["create", "club", "--name", "x", "--modes", "boh"], /--modes/);
  await run(["create", "club", "--name", "x"]);
  await fails(["create", "club", "--name", "y"], /esiste già/);
});
test("create: senza origini avverte; http solo per localhost con --allow-localhost", async () => {
  assert.match(await run(["create", "senza", "--name", "x"]), /nessuna origine registrata/);
  await fails(["create", "loc", "--name", "x", "--origin", "http://localhost:3000"], /origine non valida/);
  await run(["create", "loc", "--name", "x", "--origin", "http://localhost:3000", "--allow-localhost"]);
  assert.deepEqual(JSON.parse(await redis.get("p:loc")).origins, ["http://localhost:3000"]);
});
test("list, enable, disable", async () => {
  await run(["create", "uno", "--name", "Uno", "--origin", "https://uno.example"]);
  await run(["create", "due", "--name", "Due"]);
  assert.match(await run(["list"]), /due[\s\S]*uno/);
  await run(["disable", "uno"]);
  assert.match(await run(["list"]), /\[disattivato\] uno/);
  P.clearCache();
  assert.equal(await P.loadPartner(redis, "uno"), null);
  await run(["enable", "uno"]);
  P.clearCache();
  assert.equal((await P.loadPartner(redis, "uno")).id, "uno");
});
test("origins e settings", async () => {
  await run(["create", "p1", "--name", "P"]);
  await run(["origins", "p1", "--origin", "https://a.example", "--origin", "https://b.example", "--origin", "https://a.example"]);
  assert.deepEqual(JSON.parse(await redis.get("p:p1")).origins, ["https://a.example", "https://b.example"]);
  await run(["settings", "p1", "--modes", "smart", "--default-mode", "full", "--lang", "en", "--name", "Nuovo"]);
  const c = JSON.parse(await redis.get("p:p1"));
  assert.deepEqual([c.modes, c.defaultMode, c.lang, c.name], [["smart"], "full", "en", "Nuovo"]);
});
test("theme: unisce, convalida, --clear azzera", async () => {
  await run(["create", "p2", "--name", "P"]);
  await run(["theme", "p2", "--accent", "#0A7A3C", "--font", "serif", "--title", "Club"]);
  await run(["theme", "p2", "--bg", "#fafff8"]);
  assert.deepEqual(JSON.parse(await redis.get("p:p2")).theme, { accent: "#0a7a3c", bg: "#fafff8", font: "serif", title: "Club" });
  await fails(["theme", "p2", "--accent", "rosso"], /valori non validi per: accent/);
  await fails(["theme", "p2", "--logo", "http://x.example/l.png"], /logo/);
  assert.equal(JSON.parse(await redis.get("p:p2")).theme.accent, "#0a7a3c", "un errore non modifica nulla");
  await run(["theme", "p2", "--clear"]);
  assert.deepEqual(JSON.parse(await redis.get("p:p2")).theme, {});
});
test("rotate-secret e rotate-key invalidano i vecchi", async () => {
  const out = await run(["create", "p3", "--name", "P"]);
  const oldKey = /(sk_p3_[0-9a-f]{48})/.exec(out)[1];
  const oldSecret = JSON.parse(await redis.get("p:p3")).secret;
  const k = /(sk_p3_[0-9a-f]{48})/.exec(await run(["rotate-key", "p3"]))[1];
  P.clearCache();
  assert.notEqual(k, oldKey);
  await assert.rejects(P.partnerFromApiKey(redis, oldKey));
  assert.equal((await P.partnerFromApiKey(redis, k)).id, "p3");
  const s = /: ([0-9a-f]{64})/.exec(await run(["rotate-secret", "p3"]))[1];
  assert.notEqual(s, oldSecret);
  assert.equal(JSON.parse(await redis.get("p:p3")).secret, s);
});
test("token: genera un token valido per il partner", async () => {
  await run(["create", "p4", "--name", "P"]);
  const out = await run(["token", "p4", "--sub", "anna", "--team", "t1", "--role", "organizer", "--name", "Anna"]);
  const tk = out.split("\n")[0];
  P.clearCache();
  const r = await P.verifyPartnerToken(redis, tk);
  assert.deepEqual([r.ctx.uid, r.ctx.team, r.ctx.role, r.ctx.name], ["anna", "t1", "organizer", "Anna"]);
  await fails(["token", "p4", "--sub", "anna"], /--sub e --team/);
});
test("comando o partner sconosciuto", async () => {
  await fails(["boh"], /comando sconosciuto|inesistente|id non valido/);
  await fails(["show", "inesistente"], /inesistente/);
  await fails(["show", "../x"], /id non valido/);
  await fails([], /comando sconosciuto/);
});
test("usage: legge il contatore dei mesi", async () => {
  await redis.set(quota.monthKey(), "410000");
  const out = [];
  await usage.main(redis, l => out.push(l));
  assert.match(out[0], /410000 \/ 500000\s+\(82\.0%\)\s+→ attenzione/);
  assert.equal(out.length, 3);
});
