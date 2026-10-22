/* Modalità gioco nelle cerchie: si accende per cerchia, mosse segrete fino allo svelamento, poi tutti vedono tutto. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, call } = require("./helpers/env");
const { getRedis } = require("../api/_redis");
const quota = require("../api/_quota");
const circles = require("../api/circles");
const embed = require("../api/embed");
const Game = require("../api/_game");

let srv, redis, ip = 0;
async function account(name, pic) {
  await redis.set("user:google:" + name, JSON.stringify({ provider: "google", email: name + "@example.com", name: name[0].toUpperCase() + name.slice(1) + " Rossi", picture: pic || "" }));
  await redis.set("session:tok-" + name, "google:" + name);
}
const H = w => ({ authorization: "Bearer tok-" + w, "x-forwarded-for": "8.8.8." + (ip++ % 250) });
const C = (w, b) => call(circles, { method: "POST", headers: H(w), body: b });
const E = (w, cid, b) => call(embed, { method: "POST", headers: H(w), body: Object.assign({ circle: cid }, b) });
const ok = async (p) => { const r = await p; assert.equal(r.statusCode, 200, JSON.stringify(r.body)); return r.body; };
const smart = n => ({ mode: "smart", giudizi: { occhio: n, naso: n, bocca: n } });

async function scena() {
  await account("anna", "https://lh3.googleusercontent.com/a/anna=s96"); await account("carla", "https://evil.example/x.png"); await account("bea");
  const { circle } = await ok(C("anna", { op: "create", name: "Team" }));
  const inv = (await ok(C("anna", { op: "invite", circle: circle.id, emails: ["carla@example.com", "bea@example.com"] }))).results;
  await ok(C("carla", { op: "invite.accept", token: inv[0].token })); await ok(C("bea", { op: "invite.accept", token: inv[1].token }));
  const t = (await ok(E("anna", circle.id, { op: "tasting.create", name: "Campioni" }))).tasting;
  const w1 = (await ok(E("anna", circle.id, { op: "wine.add", tasting: t.id, wine: { name: "Etna Rosso", producer: "Benanti" } }))).wine;
  const w2 = (await ok(E("anna", circle.id, { op: "wine.add", tasting: t.id, wine: { name: "Grillo", producer: "Planeta" } }))).wine;
  return { cid: circle.id, t: t.id, w1: w1.id, w2: w2.id };
}

test.before(async () => { srv = await setup(); redis = getRedis(); });
test.after(async () => { await srv.stop(); });
test.beforeEach(() => { srv.reset(); quota.reset(); });

test("il gioco si accende solo per cerchia, e solo Proprietario o amministratori", async () => {
  const s = await scena();
  assert.equal((await E("carla", s.cid, { op: "game.state", tasting: s.t })).statusCode, 403, "spento: niente gioco");
  assert.equal((await C("carla", { op: "game.set", circle: s.cid, on: true })).statusCode, 403, "un membro non lo accende");
  await ok(C("anna", { op: "game.set", circle: s.cid, on: true }));
  assert.equal((await ok(C("carla", { op: "get", circle: s.cid }))).circle.game, true);
  const sess = await ok(E("carla", s.cid, { op: "session" }));
  assert.equal(sess.config.game, true, "lo spazio delle serate sa che il gioco è acceso");
});

test("mosse segrete fino allo svelamento; poi tutti vedono tutto, con punti e cartellini", async () => {
  const s = await scena();
  await ok(C("anna", { op: "game.set", circle: s.cid, on: true }));
  /* mosse e voti sul primo vino */
  await ok(E("carla", s.cid, { op: "game.play", tasting: s.t, wine: s.w1, x: 8, y: 3, p: 85, e: 25 }));
  await ok(E("bea", s.cid, { op: "game.play", tasting: s.t, wine: s.w1, x: 2, y: 9, p: 70, e: 12 }));
  await ok(E("anna", s.cid, { op: "game.play", tasting: s.t, wine: s.w1, x: 7, y: 4, p: 82 }));
  await ok(E("carla", s.cid, Object.assign({ op: "vote", tasting: s.t, wine: s.w1 }, smart(88))));
  await ok(E("bea", s.cid, Object.assign({ op: "vote", tasting: s.t, wine: s.w1 }, smart(72))));
  let st = await ok(E("carla", s.cid, { op: "game.state", tasting: s.t }));
  let w = st.wines[s.w1];
  assert.equal(w.revealed, false); assert.equal(w.results, undefined, "prima dello svelamento nessuno vede le mosse degli altri");
  assert.deepEqual(w.mine, { x: 8, y: 3, p: 85, e: 25, a: [], wd: "", fan: "" });
  assert.equal(w.played.length, 3); assert.equal(w.voted.length, 2);
  assert.equal(w.axes, 0); assert.equal(st.wines[s.w2].axes, 1, "gli assi cambiano a ogni vino");
  assert.doesNotMatch(JSON.stringify(st), /google:|example\.com/, "niente account né mail");
  const me = Object.values(st.people).find(p => p.me);
  assert.equal(me.name, "Carla Rossi"); assert.equal(me.pic, "", "una foto che non è di Google non passa");
  assert.match(Object.values(st.people).find(p => p.name === "Anna Rossi").pic, /^https:\/\/lh3\.googleusercontent\.com\//);
  /* l'organizzatore scrive il prezzo; un membro no */
  assert.equal((await E("carla", s.cid, { op: "game.price", tasting: s.t, wine: s.w1, price: 20 })).statusCode, 403);
  await ok(E("anna", s.cid, { op: "game.price", tasting: s.t, wine: s.w1, price: 22 }));
  assert.equal((await ok(E("carla", s.cid, { op: "game.state", tasting: s.t }))).wines[s.w1].price, null, "il prezzo vero si vede solo dopo lo svelamento");
  /* quando votano tutti si svela da solo */
  await ok(E("anna", s.cid, Object.assign({ op: "vote", tasting: s.t, wine: s.w1 }, smart(80))));
  st = await ok(E("bea", s.cid, { op: "game.state", tasting: s.t }));
  w = st.wines[s.w1];
  assert.equal(w.revealed, true); assert.equal(w.price, 22); assert.equal(w.avg, 80);
  assert.equal(w.results.length, 3);
  const byName = n => w.results.find(r => st.people[r.who].name === n);
  assert.equal(byName("Carla Rossi").vote, 88); assert.equal(byName("Bea Rossi").vote, 72);
  assert.equal(byName("Anna Rossi").pts.pron, 8, "pronostico 82 su media 80: 8 punti");
  assert.equal(byName("Carla Rossi").pts.price, 9, "25 su 22: 10 × (1 − 3/22) = 8,6 → 9 punti");
  assert.ok(byName("Bea Rossi").badges.includes("fuori"), "Bea è la più lontana dal gruppo");
  assert.ok(byName("Carla Rossi").badges.includes("prezzo") || byName("Bea Rossi").badges.includes("prezzo"));
  /* dopo lo svelamento non si gioca più su quel vino; le reazioni sì, ma non a sé stessi */
  assert.equal((await E("bea", s.cid, { op: "game.play", tasting: s.t, wine: s.w1, x: 5, y: 5 })).statusCode, 409, "svelato da solo: le mosse non si cambiano più");
  const carlaPk = byName("Carla Rossi").who, beaPk = byName("Bea Rossi").who;
  await ok(E("bea", s.cid, { op: "game.react", tasting: s.t, wine: s.w1, to: carlaPk, e: "😂", f: "f1" }));
  assert.equal((await E("bea", s.cid, { op: "game.react", tasting: s.t, wine: s.w1, to: beaPk, e: "🔥" })).statusCode, 400, "non a sé stessi");
  assert.equal((await E("bea", s.cid, { op: "game.react", tasting: s.t, wine: s.w1, to: carlaPk, e: "💩" })).statusCode, 400, "solo le emoji previste");
  assert.equal((await E("bea", s.cid, { op: "game.react", tasting: s.t, wine: s.w1, to: carlaPk, f: "insulto libero" })).statusCode, 400, "solo frasi prestabilite");
  st = await ok(E("anna", s.cid, { op: "game.state", tasting: s.t }));
  const rc = st.wines[s.w1].results.find(r => r.who === carlaPk).reactions;
  assert.equal(rc.length, 1); assert.equal(rc[0].e, "😂"); assert.equal(rc[0].f, "f1"); assert.equal(rc[0].from, beaPk);
  /* reazioni prima dello svelamento: no */
  assert.equal((await E("bea", s.cid, { op: "game.react", tasting: s.t, wine: s.w2, to: carlaPk, e: "🔥" })).statusCode, 409);
});

test("svelamento a mano, vino chiuso, mosse non valide; classifica della stagione e soprannomi", async () => {
  const s = await scena();
  await ok(C("anna", { op: "game.set", circle: s.cid, on: true }));
  assert.equal((await E("carla", s.cid, { op: "game.play", tasting: s.t, wine: s.w2, x: 11, y: 3 })).statusCode, 400);
  assert.equal((await E("carla", s.cid, { op: "game.play", tasting: s.t, wine: s.w2, x: 5 })).statusCode, 400, "servono entrambi gli assi");
  assert.equal((await E("carla", s.cid, { op: "game.play", tasting: s.t, wine: s.w2, p: 40 })).statusCode, 400, "pronostico da 50 a 100");
  await ok(E("carla", s.cid, { op: "game.play", tasting: s.t, wine: s.w2, p: 90 }));
  await ok(E("carla", s.cid, Object.assign({ op: "vote", tasting: s.t, wine: s.w2 }, smart(95))));
  await ok(E("bea", s.cid, Object.assign({ op: "vote", tasting: s.t, wine: s.w2 }, smart(75))));
  assert.equal((await E("carla", s.cid, { op: "game.reveal", tasting: s.t, wine: s.w2 })).statusCode, 403);
  await ok(E("anna", s.cid, { op: "game.reveal", tasting: s.t, wine: s.w2 }));
  assert.equal((await E("bea", s.cid, { op: "game.play", tasting: s.t, wine: s.w2, p: 80 })).statusCode, 409, "svelato: niente più mosse");
  /* un altro vino, poi la classifica */
  await ok(E("carla", s.cid, Object.assign({ op: "vote", tasting: s.t, wine: s.w1 }, smart(96))));
  await ok(E("bea", s.cid, Object.assign({ op: "vote", tasting: s.t, wine: s.w1 }, smart(70))));
  await ok(E("anna", s.cid, Object.assign({ op: "vote", tasting: s.t, wine: s.w1 }, smart(82))));
  const b = await ok(E("bea", s.cid, { op: "game.board" }));
  assert.equal(b.rows.length, 3);
  const carla = b.rows.find(r => r.name === "Carla Rossi"), bea = b.rows.find(r => r.name === "Bea Rossi");
  assert.ok(carla.nick.includes("generoso"), "Carla vota sempre sopra la media: " + carla.nick);
  assert.ok(bea.nick.includes("spietato"), "Bea sempre sotto: " + bea.nick);
  assert.ok(carla.pts.total > 0);
  assert.doesNotMatch(JSON.stringify(b), /google:|example\.com/);
});

test("pulizia: «Cancella i miei voti» toglie anche mosse e reazioni; eliminare la serata toglie tutto il gioco", async () => {
  const s = await scena();
  await ok(C("anna", { op: "game.set", circle: s.cid, on: true }));
  await ok(E("carla", s.cid, { op: "game.play", tasting: s.t, wine: s.w1, x: 3, y: 3, p: 80 }));
  await ok(E("anna", s.cid, { op: "game.reveal", tasting: s.t, wine: s.w1 }));
  const st = await ok(E("bea", s.cid, { op: "game.state", tasting: s.t }));
  const carlaPk = Object.keys(st.people).find(k => st.people[k].name === "Carla Rossi");
  await ok(E("bea", s.cid, { op: "game.react", tasting: s.t, wine: s.w1, to: carlaPk, e: "🧐" }));
  const r = await ok(C("carla", { op: "votes.delete", circle: s.cid, confirm: true }));
  assert.equal(r.movesRemoved, 1);
  assert.equal(await redis.hget(Game.K.gp(s.t, s.w1), "google:carla"), null);
  assert.equal(Object.keys(await redis.hgetall(Game.K.gx(s.t, s.w1)) || {}).length, 0, "anche la reazione ricevuta");
  await ok(E("bea", s.cid, { op: "game.play", tasting: s.t, wine: s.w2, p: 70 }));
  await ok(E("anna", s.cid, { op: "tasting.delete", tasting: s.t }));
  assert.equal(await redis.exists(Game.K.gp(s.t, s.w2)), 0); assert.equal(await redis.exists(Game.K.gw(s.t)), 0);
});

test("2.13: la scommessa della serata è segreta fino alla chiusura, poi 10 punti a chi indovina", async () => {
  const s = await scena();
  await ok(C("anna", { op: "game.set", circle: s.cid, on: true }));
  await ok(E("carla", s.cid, { op: "game.fav", tasting: s.t, wine: s.w1 }));
  await ok(E("bea", s.cid, { op: "game.fav", tasting: s.t, wine: s.w2 }));
  let st = await ok(E("anna", s.cid, { op: "game.state", tasting: s.t }));
  assert.equal(st.fav.eligible, true); assert.equal(st.fav.mine, null); assert.equal(st.fav.pickers.length, 2);
  assert.equal(st.fav.results, undefined, "prima della chiusura nessuno vede le scelte");
  const c = await ok(E("carla", s.cid, { op: "game.state", tasting: s.t })); assert.equal(c.fav.mine, s.w1, "ognuno vede la sua");
  for (const [who, a, b] of [["anna", 90, 70], ["carla", 88, 72], ["bea", 86, 74]]) {
    await ok(E(who, s.cid, { op: "game.play", tasting: s.t, wine: s.w1, p: 85 }));
    await ok(E(who, s.cid, { op: "vote", tasting: s.t, wine: s.w1, ...smart(a) }));
    await ok(E(who, s.cid, { op: "vote", tasting: s.t, wine: s.w2, ...smart(b) }));
  }
  await ok(E("anna", s.cid, { op: "tasting.status", tasting: s.t, status: "closed" }));
  assert.equal((await E("bea", s.cid, { op: "game.fav", tasting: s.t, wine: s.w1 })).statusCode, 409, "a serata chiusa non si cambia");
  st = await ok(E("anna", s.cid, { op: "game.state", tasting: s.t }));
  assert.deepEqual(st.fav.winners, [s.w1]);
  assert.equal(st.fav.results.filter(r => r.ok).length, 1);
  await redis.del("gb:" + s.cid);
  const b = await ok(E("anna", s.cid, { op: "game.board" }));
  const carla = b.rows.find(r => r.name === "Carla Rossi"), bea = b.rows.find(r => r.name === "Bea Rossi");
  assert.equal(carla.pts.fav, 10); assert.ok(carla.feats.includes("favorito"), "traguardo «Fiuto del vincitore»");
  assert.ok(!bea.feats.includes("favorito"));
  assert.ok(carla.feats.includes("primo"), "traguardo «Primo sorso»");
  assert.ok(carla.month >= 10, "i punti contano anche nel mese");
  assert.deepEqual(b.ach.length, 12);
});

test("2.13: serie di pronostici centrati e la nemesi", async () => {
  const s = await scena();
  await ok(C("anna", { op: "game.set", circle: s.cid, on: true }));
  const w3 = (await ok(E("anna", s.cid, { op: "wine.add", tasting: s.t, wine: { name: "Nero d'Avola" } }))).wine.id;
  for (const w of [s.w1, s.w2, w3]) {
    for (const [who, v, p] of [["anna", 95, 82], ["carla", 70, 82], ["bea", 80, 60]]) {
      await ok(E(who, s.cid, { op: "game.play", tasting: s.t, wine: w, p }));
      await ok(E(who, s.cid, { op: "vote", tasting: s.t, wine: w, ...smart(v) }));
    }
  }
  await redis.del("gb:" + s.cid);
  const b = await ok(E("anna", s.cid, { op: "game.board" }));
  const anna = b.rows.find(r => r.name === "Anna Rossi"), bea = b.rows.find(r => r.name === "Bea Rossi");
  assert.equal(anna.streak.cur, 3); assert.equal(anna.streak.best, 3); assert.ok(anna.feats.includes("serie3"));
  assert.equal(bea.streak.cur, 0);
  assert.equal(anna.rival, "Carla Rossi", "i voti più lontani dai suoi");
});

test("2.14: caccia agli aromi, il vino in una parola, il fan numero uno", async () => {
  const s = await scena();
  await ok(C("anna", { op: "game.set", circle: s.cid, on: true }));
  const st0 = await ok(E("anna", s.cid, { op: "game.state", tasting: s.t }));
  const pk = n => Object.keys(st0.people).find(k => st0.people[k].name === n);
  assert.equal((await E("anna", s.cid, { op: "game.play", tasting: s.t, wine: s.w1, a: ["rossi", "spezie", "fiori", "erbe"] })).statusCode, 400, "al massimo tre aromi");
  assert.equal((await E("anna", s.cid, { op: "game.play", tasting: s.t, wine: s.w1, a: ["caffè"] })).statusCode, 400, "solo aromi della lista");
  assert.equal((await E("anna", s.cid, { op: "game.play", tasting: s.t, wine: s.w1, wd: "boh" })).statusCode, 400);
  assert.equal((await E("anna", s.cid, { op: "game.play", tasting: s.t, wine: s.w1, fan: "0000000000" })).statusCode, 400, "il fan deve essere della cerchia");
  /* Carla darà il voto più alto */
  await ok(E("anna", s.cid, { op: "game.play", tasting: s.t, wine: s.w1, a: ["rossi", "spezie"], wd: "elegante", fan: pk("Carla Rossi") }));
  await ok(E("carla", s.cid, { op: "game.play", tasting: s.t, wine: s.w1, a: ["rossi", "spezie", "vaniglia"], wd: "elegante", fan: pk("Bea Rossi") }));
  await ok(E("bea", s.cid, { op: "game.play", tasting: s.t, wine: s.w1, a: ["fiori"], wd: "potente", fan: pk("Carla Rossi") }));
  let st = await ok(E("bea", s.cid, { op: "game.state", tasting: s.t }));
  assert.deepEqual(st.wines[s.w1].mine.a, ["fiori"]); assert.equal(st.wines[s.w1].results, undefined, "segreto fino allo svelamento");
  for (const [who, n] of [["anna", 80], ["carla", 92], ["bea", 75]]) await ok(E(who, s.cid, { op: "vote", tasting: s.t, wine: s.w1, ...smart(n) }));
  st = await ok(E("bea", s.cid, { op: "game.state", tasting: s.t }));
  const w = st.wines[s.w1], R = n => w.results.find(r => st.people[r.who].name === n);
  assert.deepEqual(w.aromas.slice(0, 2).map(x => x.k).sort(), ["rossi", "spezie"]);
  assert.equal(w.words[0].k, "elegante"); assert.deepEqual(w.fanTop, [pk("Carla Rossi")]);
  assert.equal(R("Anna Rossi").pts.aroma, 6); assert.equal(R("Anna Rossi").pts.word, 5); assert.equal(R("Anna Rossi").pts.fan, 5);
  assert.equal(R("Carla Rossi").pts.aroma, 6); assert.equal(R("Carla Rossi").pts.fan, 0);
  assert.equal(R("Bea Rossi").pts.aroma, 0); assert.equal(R("Bea Rossi").pts.word, 0); assert.equal(R("Bea Rossi").pts.fan, 5);
  assert.equal(R("Anna Rossi").pts.total, 16);
});

test("2.15: duelli — sfida, accetta o rifiuta, risultato allo svelamento, +5, gongola", async () => {
  const s = await scena();
  await ok(C("anna", { op: "game.set", circle: s.cid, on: true }));
  const st0 = await ok(E("anna", s.cid, { op: "game.state", tasting: s.t }));
  const pk = n => Object.keys(st0.people).find(k => st0.people[k].name === n);
  assert.equal((await E("anna", s.cid, { op: "game.duel", tasting: s.t, wine: s.w1, to: pk("Anna Rossi"), stake: "vino" })).statusCode, 400, "non si sfida sé stessi");
  assert.equal((await E("anna", s.cid, { op: "game.duel", tasting: s.t, wine: s.w1, to: pk("Carla Rossi"), stake: "boh" })).statusCode, 400, "la posta va scelta dalla lista");
  const d1 = (await ok(E("anna", s.cid, { op: "game.duel", tasting: s.t, wine: s.w1, to: pk("Carla Rossi"), stake: "vino" }))).id;
  assert.equal((await E("carla", s.cid, { op: "game.duel", tasting: s.t, wine: s.w1, to: pk("Anna Rossi"), stake: "caffe" })).statusCode, 409, "un solo duello per coppia e vino");
  const d2 = (await ok(E("anna", s.cid, { op: "game.duel", tasting: s.t, wine: s.w2, to: pk("Bea Rossi"), stake: "versa" }))).id;
  assert.equal((await E("bea", s.cid, { op: "game.duel.answer", tasting: s.t, id: d1, accept: true })).statusCode, 403, "risponde solo chi è sfidato");
  await ok(E("carla", s.cid, { op: "game.duel.answer", tasting: s.t, id: d1, accept: true }));
  await ok(E("bea", s.cid, { op: "game.duel.answer", tasting: s.t, id: d2, accept: false }));
  let st = await ok(E("bea", s.cid, { op: "game.state", tasting: s.t }));
  assert.equal(st.duels.length, 2, "tutti vedono i duelli"); assert.equal(st.duels.find(d => d.id === d1).status, "accepted"); assert.equal(st.duels.find(d => d.id === d2).status, "declined");
  /* Anna centra il pronostico, Carla no */
  await ok(E("anna", s.cid, { op: "game.play", tasting: s.t, wine: s.w1, p: 80 }));
  await ok(E("carla", s.cid, { op: "game.play", tasting: s.t, wine: s.w1, p: 60 }));
  for (const [who, n] of [["anna", 80], ["carla", 80], ["bea", 80]]) await ok(E(who, s.cid, { op: "vote", tasting: s.t, wine: s.w1, ...smart(n) }));
  st = await ok(E("bea", s.cid, { op: "game.state", tasting: s.t }));
  const d = st.duels.find(x => x.id === d1);
  assert.equal(d.status, "done"); assert.equal(d.winner, pk("Anna Rossi")); assert.deepEqual(d.score, [10, 0]);
  assert.equal((await E("carla", s.cid, { op: "game.duel.taunt", tasting: s.t, id: d1, taunt: "t1" })).statusCode, 403, "gongola solo chi vince");
  await ok(E("anna", s.cid, { op: "game.duel.taunt", tasting: s.t, id: d1, taunt: "t3" }));
  st = await ok(E("bea", s.cid, { op: "game.state", tasting: s.t }));
  assert.equal(st.duels.find(x => x.id === d1).taunt, "t3");
  await redis.del("gb:" + s.cid);
  const b = await ok(E("anna", s.cid, { op: "game.board" }));
  const anna = b.rows.find(r => r.name === "Anna Rossi"), bea = b.rows.find(r => r.name === "Bea Rossi");
  assert.equal(anna.pts.duel, 5); assert.deepEqual(anna.duels, { w: 1, l: 0, t: 0, dec: 0 }); assert.equal(bea.duels.dec, 1);
  assert.equal(b.challenge.month, new Date().toISOString().slice(0, 7)); assert.ok(b.themes.includes(b.challenge.theme));
  assert.ok(b.challenge.rows.find(r => r.who === anna.who).pts >= 15, "la sfida del mese conta anche i duelli");
});

test("2.15: la pagella della serata a serata chiusa", async () => {
  const s = await scena();
  await ok(C("anna", { op: "game.set", circle: s.cid, on: true }));
  for (const w of [s.w1, s.w2]) for (const [who, n, p] of [["anna", 90, 85], ["carla", 70, 60], ["bea", 80, 82]]) {
    await ok(E(who, s.cid, { op: "game.play", tasting: s.t, wine: w, p }));
    await ok(E(who, s.cid, { op: "vote", tasting: s.t, wine: w, ...smart(n) }));
  }
  let st = await ok(E("anna", s.cid, { op: "game.state", tasting: s.t }));
  assert.equal(st.pagella, undefined, "solo a serata chiusa");
  await ok(E("anna", s.cid, { op: "tasting.status", tasting: s.t, status: "closed" }));
  st = await ok(E("anna", s.cid, { op: "game.state", tasting: s.t }));
  const by = k => st.pagella.find(x => x.k === k), name = who => st.people[who].name;
  assert.equal(name(by("mvp").who), "Bea Rossi"); assert.equal(name(by("nera").who), "Carla Rossi");
  assert.equal(name(by("generoso").who), "Anna Rossi"); assert.equal(name(by("spietato").who), "Carla Rossi");
});
