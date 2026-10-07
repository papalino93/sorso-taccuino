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

/* ---- difetti della verifica approfondita ---- */
test("create: due creazioni simultanee dello stesso partner, ne vince una sola", async () => {
  const r = await Promise.allSettled([run(["create", "gara", "--name", "A"]), run(["create", "gara", "--name", "B"])]);
  assert.equal(r.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(r.filter(x => x.status === "rejected").length, 1);
  assert.match(String(r.find(x => x.status === "rejected").reason.message), /esiste già/);
  const out = r.find(x => x.status === "fulfilled").value;
  const secret = /Segreto di firma:\s+([0-9a-f]{64})/.exec(out)[1];
  assert.equal(JSON.parse(await redis.get("p:gara")).secret, secret, "le credenziali mostrate sono quelle salvate");
});
test("identificativi: niente trattini ai bordi o doppi", async () => {
  for (const id of ["a-", "-a", "a--b", "a_b", "A", "ab c", "x".repeat(32), "a"]) await fails(["create", id, "--name", "x"], /id non valido/);
  for (const id of ["ab", "a-b", "club-2", "x".repeat(31), "a1-b2-c3"]) await run(["create", id, "--name", "x"]);
});
test("argomenti: un valore mancante non si scambia con l'opzione successiva; lingue e modalità solo valide", async () => {
  await fails(["create", "uno", "--name", "--origin", "https://a.example"], /manca il valore di --name/);
  await fails(["create", "uno", "--name"], /manca il valore di --name/);
  assert.equal(await redis.get("p:uno"), null, "nessuna scrittura parziale");
  await fails(["create", "uno", "--name", "x", "--lang", "xx"], /--lang/);
  await fails(["create", "uno", "--name", "x", "--default-mode", "boh"], /--default-mode/);
  await run(["create", "uno", "--name", "x"]);
  await fails(["settings", "uno", "--lang", "xx"], /--lang/);
  await fails(["settings", "uno", "--default-mode", "x"], /--default-mode/);
});
test("origins: senza --origin non cancella nulla; --clear le toglie, esplicitamente", async () => {
  await run(["create", "og", "--name", "x", "--origin", "https://a.example"]);
  await fails(["origins", "og"], /serve almeno un --origin/);
  assert.deepEqual(JSON.parse(await redis.get("p:og")).origins, ["https://a.example"]);
  await run(["origins", "og", "--clear"]);
  assert.deepEqual(JSON.parse(await redis.get("p:og")).origins, []);
  await fails(["origins", "og", "--origin", "https://*.example"], /origine non valida/);
});
test("localhost: l'autorizzazione resta nel partner e vale per la politica di sicurezza", async () => {
  await run(["create", "loc2", "--name", "x", "--origin", "http://localhost:3000", "--allow-localhost"]);
  const cfg = JSON.parse(await redis.get("p:loc2"));
  assert.equal(cfg.allowLocalhost, true);
  assert.equal(P.frameAncestors(cfg), "'self' http://localhost:3000");
  await run(["create", "noloc", "--name", "x", "--origin", "https://a.example"]);
  await fails(["origins", "noloc", "--origin", "http://localhost:3000"], /origine non valida/);
});
test("theme: mostra la tavolozza calcolata e avvisa quando corregge un colore illeggibile", async () => {
  await run(["create", "tm", "--name", "x"]);
  const out = await run(["theme", "tm", "--accent", "#ffff00", "--bg", "#ffffff"]);
  assert.match(out, /Tavolozza calcolata/);
  assert.match(out, /sono stati corretti: accent/);
  const out2 = await run(["theme", "tm", "--clear", "--accent", "#7a1228", "--bg", "#fbfaf8"]);
  assert.ok(!/sono stati corretti/.test(out2));
  assert.match(out2, /non segue più il chiaro\/scuro/);
});
test("purge: chiede conferma e cancella solo i dati del partner indicato", async () => {
  const { setup } = require("./helpers/env");
  await run(["create", "pa", "--name", "A"]); await run(["create", "pa-2", "--name", "B"]);
  for (const id of ["pa", "pa-2"]) {
    await redis.hset("tl:" + id + ":t1", { aaaaaaaaaa: "{}" }); await redis.hset("ti:" + id, { aaaaaaaaaa: "t1" }); await redis.sadd("tm:" + id, "t1");
    await redis.hset("cn:" + id, { "t:t1": "1" }); await redis.hset("wn:" + id + ":aaaaaaaaaa", { bbbbbbbbbb: "{}" });
    await redis.set("vt:" + id + ":aaaaaaaaaa:bbbbbbbbbb:u", "{}"); await redis.sadd("vs:" + id + ":aaaaaaaaaa:bbbbbbbbbb", "u");
    await redis.hset("sm:" + id + ":aaaaaaaaaa", { bbbbbbbbbb: "1" }); await redis.hset("ct:" + id + ":aaaaaaaaaa", { bbbbbbbbbb: "1" });
    await redis.sadd("uv:" + id + ":u", "aaaaaaaaaa|bbbbbbbbbb"); await redis.set("jti:" + id + ":j1", "1");
  }
  await fails(["purge", "pa"], /Ripeti con --yes/);
  assert.ok((await redis.keys("*pa:*")).length > 0, "senza --yes non si cancella nulla");
  const out = await run(["purge", "pa", "--yes"]);
  assert.match(out, /Cancellate 10 chiavi/);
  const rimaste = await redis.keys("*");
  assert.ok(!rimaste.some(k => /^[a-z]{2}:pa(:|$)/.test(k)), "dati di pa tutti spariti: " + rimaste.join(","));
  assert.ok(rimaste.some(k => k.startsWith("tl:pa-2:")), "i dati di pa-2 restano (id che inizia allo stesso modo)");
  assert.ok(rimaste.includes("p:pa") && rimaste.includes("p:pa-2"), "le configurazioni restano");
  assert.ok(rimaste.includes("jti:pa:j1"), "i token già usati restano segnati: non tornano riutilizzabili");
});
test("recount: ripara una degustazione da riga di comando", async () => {
  const Team = require("../api/_team");
  await run(["create", "rc", "--name", "x"]);
  const ctx = { uid: "o", team: "t", role: "organizer" };
  const p = (await P.loadPartner(redis, "rc"));
  const t = await Team.createTasting(redis, "rc", ctx, { name: "T" });
  const w = await Team.addWine(redis, "rc", ctx, t.id, { name: "V" });
  await Team.castVote(redis, p, { uid: "a", team: "t", role: "member" }, { tasting: t.id, wine: w.id, mode: "smart", giudizi: { occhio: 80, naso: 80, bocca: 80 } });
  await redis.hset("sm:rc:" + t.id, { [w.id]: "12345" });
  const out = await run(["recount", "rc", t.id]);
  assert.match(out, /1 voti, somma 80/);
  assert.equal(await redis.hget("sm:rc:" + t.id, w.id), "80");
});

test("origins: imposta, aggiunge con --add, e mostra prima e dopo; opzioni sconosciute rifiutate", async () => {
  await run(["create", "og", "--name", "x", "--origin", "https://uno.example"]);
  let out = await run(["origins", "og", "--origin", "https://due.example"]);
  assert.match(out, /prima: https:\/\/uno\.example/);
  assert.match(out, /ora:\s+https:\/\/due\.example/);
  out = await run(["origins", "og", "--add", "--origin", "https://tre.example"]);
  assert.match(out, /ora:\s+https:\/\/due\.example, https:\/\/tre\.example/);
  await fails(["origins", "og", "--clear", "--origin", "https://x.example"], /non si combina/);
  await fails(["theme", "og", "--nonsense", "1"], /non esiste/);
  await fails(["settings", "og", "--foo", "bar"], /non esiste/);
});
