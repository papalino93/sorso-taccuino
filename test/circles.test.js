/* Cerchie: ruoli, inviti legati alla mail, isolamento. Ogni operazione è provata per ogni ruolo. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, call } = require("./helpers/env");
const { getRedis } = require("../api/_redis");
const quota = require("../api/_quota");
const circles = require("../api/circles");
const C = require("../api/_circles");

let srv, redis;
const users = {};
async function account(name, email, extra) {
  const username = "google:" + name;
  await redis.set("user:" + username, JSON.stringify(Object.assign({ provider: "google", email, name: name[0].toUpperCase() + name.slice(1) + " Rossi" }, extra || {})));
  const token = "tok-" + name;
  await redis.set("session:" + token, username);
  users[name] = { token, username };
  return token;
}
const op = (who, body) => call(circles, { method: "POST", headers: { authorization: "Bearer " + (users[who] ? users[who].token : who), "x-forwarded-for": "1.1.1.1" }, body });
const ok = async (who, body) => { const r = await op(who, body); assert.equal(r.statusCode, 200, JSON.stringify([body, r.body])); return r.body; };
const err = async (who, body, status, code) => { const r = await op(who, body); assert.equal(r.statusCode, status, JSON.stringify([body, r.body])); if (code) assert.equal(r.body.error.code, code); return r.body; };

/* tre persone di prova: anna (Proprietario), bruno (Amministratore), carla (Membro) */
async function scena() {
  await account("anna", "anna@example.com"); await account("bruno", "Bruno@Example.com"); await account("carla", "carla@gmail.com"); await account("dario", "dario@example.com");
  const { circle } = await ok("anna", { op: "create", name: "Corso di giovedì" });
  const inv = (await ok("anna", { op: "invite", circle: circle.id, emails: ["bruno@example.com", "carla@gmail.com"] })).results;
  await ok("bruno", { op: "invite.accept", token: inv[0].token }); await ok("carla", { op: "invite.accept", token: inv[1].token });
  const g = await ok("anna", { op: "get", circle: circle.id });
  const mid = n => g.members.find(m => m.name.toLowerCase().startsWith(n)).mid;
  await ok("anna", { op: "member.role", circle: circle.id, member: mid("bruno"), role: "admin" });
  return { cid: circle.id, mid };
}

test.before(async () => { srv = await setup(); redis = getRedis(); });
test.after(async () => { await srv.stop(); });
test.beforeEach(() => { srv.reset(); quota.reset(); });

test("senza accesso: 401; metodo e operazioni sconosciute", async () => {
  await err("falso", { op: "list" }, 401, "session");
  assert.equal((await call(circles, { method: "GET", headers: {} })).statusCode, 405);
  await account("anna", "anna@example.com");
  await err("anna", { op: "boh" }, 400, "unknown_op");
  await err("anna", { op: "constructor" }, 400, "unknown_op");
});

test("creare: nome obbligatorio, il creatore è Proprietario, tetto di cerchie", async () => {
  await account("anna", "anna@example.com");
  await err("anna", { op: "create", name: "  " }, 400, "invalid_name");
  await err("anna", { op: "create", name: ["x"] }, 400, "invalid_name");
  const c = await ok("anna", { op: "create", name: "Amici del vino" });
  assert.equal(c.circle.role, "owner");
  for (let i = 1; i < C.MAX_OWNED; i++) await ok("anna", { op: "create", name: "Cerchia " + i });
  await err("anna", { op: "create", name: "Una di troppo" }, 409, "limit");
  assert.equal((await ok("anna", { op: "list" })).circles.length, C.MAX_OWNED);
});

test("isolamento: chi non è membro non sa nemmeno che la cerchia esiste", async () => {
  const { cid, mid } = await scena();
  for (const body of [{ op: "get", circle: cid }, { op: "rename", circle: cid, name: "x" }, { op: "invite", circle: cid, emails: ["x@example.com"] },
    { op: "member.remove", circle: cid, member: mid("carla") }, { op: "member.role", circle: cid, member: mid("carla"), role: "admin" },
    { op: "transfer", circle: cid, member: mid("carla") }, { op: "leave", circle: cid }, { op: "delete", circle: cid, confirm: true }, { op: "invite.revoke", circle: cid, invite: "0000000000" }]) {
    await err("dario", body, 404, "not_found");
  }
  assert.deepEqual((await ok("dario", { op: "list" })).circles, []);
});

test("permessi per ruolo: Membro", async () => {
  const { cid, mid } = await scena();
  await ok("carla", { op: "get", circle: cid });
  for (const body of [{ op: "rename", circle: cid, name: "x" }, { op: "invite", circle: cid, emails: ["x@example.com"] }, { op: "delete", circle: cid, confirm: true },
    { op: "member.role", circle: cid, member: mid("bruno"), role: "member" }, { op: "member.remove", circle: cid, member: mid("bruno") }, { op: "transfer", circle: cid, member: mid("bruno") },
    { op: "invite.revoke", circle: cid, invite: "0000000000" }]) await err("carla", body, 403, "forbidden");
  /* il Membro non vede le mail né gli inviti */
  const g = await ok("carla", { op: "get", circle: cid });
  assert.equal(g.invites, undefined); g.members.forEach(m => assert.equal(m.email, undefined));
});

test("permessi per ruolo: Amministratore", async () => {
  const { cid, mid } = await scena();
  const g = await ok("bruno", { op: "get", circle: cid });
  assert.ok(Array.isArray(g.invites)); assert.ok(g.members.every(m => typeof m.email === "string"));
  /* invita membri ma non amministratori; può togliere un membro ma non un amministratore né il Proprietario; non cambia ruoli né proprietà */
  const r = await ok("bruno", { op: "invite", circle: cid, emails: ["dario@example.com"] });
  assert.equal(r.results[0].status, "invited");
  await err("bruno", { op: "invite", circle: cid, emails: ["x@example.com"], role: "admin" }, 403, "forbidden");
  await err("bruno", { op: "member.role", circle: cid, member: mid("carla"), role: "admin" }, 403);
  await err("bruno", { op: "transfer", circle: cid, member: mid("carla") }, 403);
  await err("bruno", { op: "rename", circle: cid, name: "x" }, 403);
  await err("bruno", { op: "delete", circle: cid, confirm: true }, 403);
  await err("bruno", { op: "member.remove", circle: cid, member: mid("anna") }, 403);
  await ok("anna", { op: "member.role", circle: cid, member: mid("carla"), role: "admin" });
  await err("bruno", { op: "member.remove", circle: cid, member: mid("carla") }, 403);
  await ok("anna", { op: "member.role", circle: cid, member: mid("carla"), role: "member" });
  await ok("bruno", { op: "member.remove", circle: cid, member: mid("carla") });
  assert.deepEqual((await ok("carla", { op: "list" })).circles, []);
  await err("carla", { op: "get", circle: cid }, 404);
});

test("permessi per ruolo: Proprietario; trasferimento e uscita", async () => {
  const { cid, mid } = await scena();
  await err("anna", { op: "leave", circle: cid }, 409, "owner_must_transfer");
  await err("anna", { op: "member.remove", circle: cid, member: mid("anna") }, 403);
  await err("anna", { op: "member.role", circle: cid, member: mid("anna"), role: "member" }, 403);
  await err("anna", { op: "member.role", circle: cid, member: mid("carla"), role: "owner" }, 400, "invalid_role");
  await err("anna", { op: "transfer", circle: cid, member: mid("anna") }, 400, "same_user");
  await ok("anna", { op: "rename", circle: cid, name: "Nuovo nome" });
  await ok("anna", { op: "transfer", circle: cid, member: mid("bruno") });
  assert.equal((await ok("bruno", { op: "get", circle: cid })).circle.role, "owner");
  assert.equal((await ok("anna", { op: "get", circle: cid })).circle.role, "admin");
  await err("anna", { op: "rename", circle: cid, name: "x" }, 403);
  assert.equal((await ok("anna", { op: "list" })).circles[0].role, "admin");
  await ok("anna", { op: "leave", circle: cid });
  await err("anna", { op: "get", circle: cid }, 404);
});

test("inviti: legati alla mail, un solo uso, scadenza, revoca", async () => {
  await account("anna", "anna@example.com"); await account("bruno", "bruno@example.com"); await account("dario", "dario@example.com");
  const { circle } = await ok("anna", { op: "create", name: "Colleghi" });
  const r = (await ok("anna", { op: "invite", circle: circle.id, emails: ["Bruno@Example.com", "bruno@example.com", "non-una-mail", "anna@example.com"] })).results;
  assert.deepEqual(r.map(x => x.status), ["invited", "invalid", "already_member"], "duplicati ignorati, mail non valida e già membro segnalate");
  const tok = r[0].token;
  /* chi ha il link ma un'altra mail non entra */
  const peek = await ok("dario", { op: "invite.peek", token: tok });
  assert.equal(peek.invite.matches, false); assert.ok(!JSON.stringify(peek).includes("bruno@example.com"), "la mail intera non si mostra a un altro");
  await err("dario", { op: "invite.accept", token: tok }, 403, "wrong_account");
  assert.deepEqual((await ok("dario", { op: "list" })).invites, []);
  /* l'invito compare nell'elenco personale di chi ha quella mail, e si accetta senza link */
  const mine = (await ok("bruno", { op: "list" })).invites;
  assert.equal(mine.length, 1); assert.equal(mine[0].circleName, "Colleghi"); assert.equal(mine[0].role, "member");
  await ok("bruno", { op: "invite.accept", circle: mine[0].circleId, invite: mine[0].id });
  assert.equal((await ok("bruno", { op: "list" })).circles.length, 1);
  /* un solo uso */
  await err("bruno", { op: "invite.accept", token: tok }, 410, "invite_expired");
  /* revoca */
  const r2 = (await ok("anna", { op: "invite", circle: circle.id, emails: ["dario@example.com"] })).results[0];
  await ok("anna", { op: "invite.revoke", circle: circle.id, invite: r2.id });
  await err("dario", { op: "invite.accept", token: r2.token }, 410);
  assert.deepEqual((await ok("dario", { op: "list" })).invites, []);
  /* rifiuto */
  const r3 = (await ok("anna", { op: "invite", circle: circle.id, emails: ["dario@example.com"] })).results[0];
  await ok("dario", { op: "invite.decline", circle: circle.id, invite: r3.id });
  await err("dario", { op: "invite.accept", token: r3.token }, 410);
  /* scadenza */
  const r4 = (await ok("anna", { op: "invite", circle: circle.id, emails: ["dario@example.com"] })).results[0];
  const rec = JSON.parse(await redis.hget("cv:" + circle.id, r4.id)); rec.exp = Date.now() - 1000;
  await redis.hset("cv:" + circle.id, { [r4.id]: JSON.stringify(rec) });
  await err("dario", { op: "invite.accept", token: r4.token }, 410);
  assert.deepEqual((await ok("dario", { op: "list" })).invites, []);
});

test("inviti: Gmail con punti e +etichetta è lo stesso indirizzo; mail non verificata non basta", async () => {
  await account("anna", "anna@example.com"); await account("marco", "marco.rossi@gmail.com"); await account("falso", "falso@example.com", { emailVerified: false });
  const { circle } = await ok("anna", { op: "create", name: "Gmail" });
  const t1 = (await ok("anna", { op: "invite", circle: circle.id, emails: ["MarcoRossi+vino@googlemail.com"] })).results[0].token;
  await ok("marco", { op: "invite.accept", token: t1 });
  const t2 = (await ok("anna", { op: "invite", circle: circle.id, emails: ["falso@example.com"] })).results[0].token;
  await err("falso", { op: "invite.accept", token: t2 }, 403, "wrong_account");
  assert.deepEqual((await ok("falso", { op: "list" })).invites, []);
});

test("inviti: amministratore invitato dal Proprietario; limiti di dimensione", async () => {
  await account("anna", "anna@example.com"); await account("bruno", "bruno@example.com");
  const { circle } = await ok("anna", { op: "create", name: "Piccola" });
  const t = (await ok("anna", { op: "invite", circle: circle.id, emails: ["bruno@example.com"], role: "admin" })).results[0].token;
  assert.equal((await ok("bruno", { op: "invite.accept", token: t })).circle.role, "admin");
  await err("anna", { op: "invite", circle: circle.id, emails: [] }, 400, "invalid_email");
  await err("anna", { op: "invite", circle: circle.id, emails: Array.from({ length: 11 }, (_, i) => "p" + i + "@example.com") }, 400, "too_many");
  /* si arriva al tetto (compresi gli inviti in attesa) e oltre si risponde «full» */
  let stati = [];
  for (let k = 0; k < 6; k++) stati = stati.concat((await ok("anna", { op: "invite", circle: circle.id, emails: Array.from({ length: 10 }, (_, i) => "u" + k + "x" + i + "@example.com") })).results.map(r => r.status));
  assert.equal(stati.filter(s => s === "invited").length, C.MAX_MEMBERS - 2);
  assert.ok(stati.includes("full"));
});

test("eliminare: serve la conferma, sparisce per tutti, inviti inutilizzabili", async () => {
  const { cid } = await scena();
  const r = (await ok("anna", { op: "invite", circle: cid, emails: ["dario@example.com"] })).results[0];
  await err("anna", { op: "delete", circle: cid }, 400, "confirm_required");
  await ok("anna", { op: "delete", circle: cid, confirm: true });
  for (const who of ["anna", "bruno", "carla"]) assert.deepEqual((await ok(who, { op: "list" })).circles, []);
  await err("dario", { op: "invite.accept", token: r.token }, 410);
  assert.equal((await redis.smembers("co:google:anna")).length, 0);
  /* e si può crearne un'altra */
  await ok("anna", { op: "create", name: "Di nuovo" });
});

test("id e token malformati non danno errori interni", async () => {
  await account("anna", "anna@example.com");
  for (const body of [{ op: "get", circle: "../x" }, { op: "get", circle: 5 }, { op: "get" }, { op: "invite.accept", token: "zz" }, { op: "invite.accept", token: {} },
    { op: "invite.accept", circle: "a", invite: "b" }, { op: "member.remove", circle: "0000000000", member: "x" }, { op: "invite.peek", token: "0".repeat(48) }]) {
    const r = await op("anna", body);
    assert.ok(r.statusCode >= 400 && r.statusCode < 500, JSON.stringify([body, r.statusCode, r.body]));
  }
});

/* ---- difetti emersi dalla revisione indipendente ---- */
test("concorrenza: i tetti reggono anche con richieste in parallelo", async () => {
  await account("anna", "anna@example.com");
  const r = await Promise.all(Array.from({ length: 12 }, (_, i) => op("anna", { op: "create", name: "C" + i })));
  assert.equal(r.filter(x => x.statusCode === 200).length, C.MAX_OWNED, "al massimo 5 cerchie create");
  assert.equal((await redis.smembers("co:google:anna")).length, C.MAX_OWNED);
  assert.equal((await redis.smembers("cu:google:anna")).length, C.MAX_OWNED);
});

test("concorrenza: due trasferimenti insieme non fanno due Proprietari", async () => {
  const { cid, mid } = await scena();
  const r = await Promise.all([op("anna", { op: "transfer", circle: cid, member: mid("bruno") }), op("anna", { op: "transfer", circle: cid, member: mid("carla") })]);
  assert.equal(r.filter(x => x.statusCode === 200).length, 1, JSON.stringify(r.map(x => x.statusCode)));
  const hm = await redis.hgetall("cm:" + cid);
  const ruoli = []; for (let i = 0; i < hm.length; i += 2) ruoli.push(JSON.parse(hm[i + 1]).role);
  assert.equal(ruoli.filter(x => x === "owner").length, 1);
  const owner = JSON.parse(await redis.get("ci:" + cid)).owner;
  assert.equal((await redis.smembers("co:" + owner)).includes(cid), true);
  assert.equal((await redis.smembers("co:google:anna")).length, 0);
});

test("concorrenza: gli inviti non superano il tetto di 50 e le accettazioni nemmeno", async () => {
  await account("anna", "anna@example.com");
  const { circle } = await ok("anna", { op: "create", name: "Piena" });
  const mails = k => Array.from({ length: 10 }, (_, i) => "p" + k + "x" + i + "@example.com");
  await Promise.all([0, 1, 2, 3].map(k => op("anna", { op: "invite", circle: circle.id, emails: mails(k) })));
  const hv = await redis.hgetall("cv:" + circle.id);
  assert.ok(hv.length / 2 <= C.MAX_MEMBERS - 1, "inviti in attesa: " + hv.length / 2);
});

test("accettare un invito di una cerchia eliminata nel frattempo non lascia tracce", async () => {
  await account("anna", "anna@example.com"); await account("bea", "bea@example.com");
  const { circle } = await ok("anna", { op: "create", name: "Breve" });
  const t = (await ok("anna", { op: "invite", circle: circle.id, emails: ["bea@example.com"] })).results[0].token;
  await ok("anna", { op: "delete", circle: circle.id, confirm: true });
  await err("bea", { op: "invite.accept", token: t }, 410);
  assert.equal((await redis.smembers("cu:google:bea")).length, 0);
  /* e una voce orfana in «le mie cerchie» si ripulisce da sola */
  await redis.sadd("cu:google:bea", "aaaaaaaaaa");
  assert.deepEqual((await ok("bea", { op: "list" })).circles, []);
  assert.equal((await redis.smembers("cu:google:bea")).length, 0);
});

test("anti-spam: il limite giornaliero conta le mail, non le chiamate; tetto di inviti per destinatario", async () => {
  await account("anna", "anna@example.com");
  const { circle } = await ok("anna", { op: "create", name: "Spam" });
  let ultimo = 200, invitate = 0;
  for (let k = 0; k < 12 && ultimo === 200; k++) {
    const r = await op("anna", { op: "invite", circle: circle.id, emails: Array.from({ length: 10 }, (_, i) => "s" + k + "x" + i + "@example.com") });
    ultimo = r.statusCode;
    if (r.statusCode === 200) {
      invitate += r.body.results.filter(x => x.status === "invited").length;
      await redis.del("cv:" + circle.id);      // libera i posti (come se fossero stati revocati o scaduti)
    }
  }
  assert.equal(ultimo, 429, "dopo 100 mail in un giorno si ferma");
  assert.ok(invitate <= 100);
  /* la stessa persona non riceve più di 20 inviti in attesa */
  await account("vittima", "vittima@example.com");
  let stati = [];
  for (let k = 0; k < 24; k++) {
    await account("c" + k, "c" + k + "@example.com");
    const c = (await ok("c" + k, { op: "create", name: "Cerchia " + k })).circle;
    stati.push((await ok("c" + k, { op: "invite", circle: c.id, emails: ["vittima@example.com"] })).results[0].status);
  }
  assert.equal(stati.filter(s => s === "invited").length, 20);
  assert.ok(stati.includes("unavailable"));
  assert.equal((await ok("vittima", { op: "list" })).invites.length, 20);
});

test("inviti scaduti: si tolgono quando si legge la cerchia", async () => {
  await account("anna", "anna@example.com");
  const { circle } = await ok("anna", { op: "create", name: "Pulizia" });
  const r = (await ok("anna", { op: "invite", circle: circle.id, emails: ["x@example.com"] })).results[0];
  const rec = JSON.parse(await redis.hget("cv:" + circle.id, r.id)); rec.exp = Date.now() - 1;
  await redis.hset("cv:" + circle.id, { [r.id]: JSON.stringify(rec) });
  await ok("anna", { op: "get", circle: circle.id });
  assert.equal((await redis.hgetall("cv:" + circle.id)).length, 0);
  assert.equal((await redis.smembers("ce:" + rec.eh)).length, 0);
});

test("costo: «le mie cerchie» fa poche letture", async () => {
  await account("anna", "anna@example.com");
  for (let i = 0; i < 5; i++) await ok("anna", { op: "create", name: "C" + i });
  srv.log.length = 0;
  await ok("anna", { op: "list" });
  assert.ok(srv.log.length <= 20, "comandi: " + srv.log.length);
});
