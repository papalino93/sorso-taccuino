const crypto = require("crypto");
const { HttpError, cleanText } = require("./_http");
const limit = require("./_limit");
const mail = require("./_mail");
const Team = require("./_team");

/* Le cerchie: gruppi di persone (amici, colleghi, corsisti) con un Proprietario, degli
   Amministratori e dei Membri. Un invito è legato a un indirizzo mail: lo può accettare solo
   chi entra con Google con quell'indirizzo (verificato da Google). Ogni operazione controlla il
   ruolo QUI, sul server, a ogni richiesta.

   Chiavi Redis:
     ci:<cerchia>        JSON della cerchia {id, name, owner, createdAt}
     cm:<cerchia>        hash  account → JSON {role, mid, at}   (mid = codice pubblico del membro)
     cu:<account>        set   delle cerchie di cui l'account fa parte
     co:<account>        set   delle cerchie create (di cui è Proprietario)
     cv:<cerchia>        hash  invito → JSON dell'invito
     ce:<hash mail>      set   "cerchia|invito" degli inviti pendenti per quella mail
     cl:<token>          "cerchia|invito"   (scade con l'invito) */

const MAX_MEMBERS = 50;          // persone per cerchia (compresi gli inviti in attesa)
const MAX_OWNED = 5;             // cerchie create da una persona
const MAX_JOINED = 20;           // cerchie di cui una persona fa parte
const INVITE_DAYS = 14;
const MAX_INVITES_PER_CALL = 10;
const MAX_INVITES_PER_DAY = 100; // per cerchia
const MAIL_PER_INVITER_DAY = 30;        // mail di invito al giorno per chi invita
const MAIL_PER_RECIPIENT_DAY = 5;       // mail al giorno verso lo stesso indirizzo (da qualunque cerchia)
const MAX_RESENDS = 3;                  // quante volte si può rimandare la mail di uno stesso invito
const MAX_PENDING_PER_RECIPIENT = 20;   // inviti in attesa verso lo stesso indirizzo (anti-spam)
const ROLES = ["owner", "admin", "member"];
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Un blocco breve per cerchia: le operazioni che cambiano membri, ruoli o proprietà non si
   incrociano (due trasferimenti insieme non fanno due Proprietari, il tetto dei 50 regge). */
async function locked(redis, cid, fn) {
  if (typeof cid !== "string" || !ID.test(cid)) throw notFound("Cerchia");
  const key = "cx:" + cid, mine = crypto.randomBytes(8).toString("hex");
  let got = false;
  for (let i = 0; i < 40 && !got; i++) {
    got = !!(await redis.set(key, mine, { nx: true, ex: 8 }));
    if (!got) await sleep(40 + Math.floor(Math.random() * 40));
  }
  if (!got) throw new HttpError(409, "busy", "Un'altra modifica è in corso: riprova fra un attimo.");
  try { return await fn(); }
  finally { try { if (String(await redis.get(key)) === mine) await redis.del(key); } catch (e) { /* scade da solo */ } }
}

const K = {
  ci: c => "ci:" + c, cm: c => "cm:" + c, cu: u => "cu:" + u, co: u => "co:" + u,
  cv: c => "cv:" + c, ce: h => "ce:" + h, cl: t => "cl:" + t,
  cw: c => "cw:" + c, wt: t => "wt:" + t          // widget: la cerchia → {token,…}; il token → la cerchia
};
const ID = /^[0-9a-f]{10}$/, TOKEN = /^[0-9a-f]{48}$/, MID = /^[0-9a-f]{12}$/;
const rid = () => crypto.randomBytes(5).toString("hex");
const bad = (code, msg) => new HttpError(400, code, msg);
const notFound = what => new HttpError(404, "not_found", what + (what === "Invito" ? " non trovato." : " non trovata."));
const forbidden = msg => new HttpError(403, "forbidden", msg || "Non hai il permesso di farlo.");
const parse = s => { try { return typeof s === "string" ? JSON.parse(s) : (s && typeof s === "object" ? s : null); } catch (e) { return null; } };
/* hgetall può tornare come elenco piatto [chiave, valore, …] oppure come oggetto */
function asObject(h) {
  const out = Object.create(null);
  if (Array.isArray(h)) { for (let i = 0; i + 1 < h.length; i += 2) out[String(h[i])] = h[i + 1]; }
  else if (h && typeof h === "object") Object.keys(h).forEach(k => { out[k] = h[k]; });
  return out;
}

/* indirizzo mail confrontabile: minuscolo; per Gmail senza punti e senza «+etichetta» */
function normEmail(e) {
  if (typeof e !== "string") return "";
  const s = e.trim().toLowerCase();
  if (s.length > 254 || !/^[^\s@,;<>()\[\]\\"]{1,64}@[^\s@,;<>()\[\]\\"]{1,190}\.[a-z]{2,}$/.test(s)) return "";
  let [local, domain] = s.split("@");
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.split("+")[0].replace(/\./g, "");
    domain = "gmail.com";
    if (!local) return "";
  }
  return local + "@" + domain;
}
const emailHash = e => crypto.createHash("sha256").update(e).digest("hex").slice(0, 32);
function maskEmail(e) {
  const [l, d] = String(e).split("@");
  return (l.length <= 2 ? l.charAt(0) : l.slice(0, 2)) + "•••@" + d;
}

async function getUser(redis, username) {
  const u = parse(await redis.get("user:" + username)) || {};
  return {
    username, name: cleanText(u.name, 60) || "Utente",
    email: normEmail(u.email || ""), verified: u.emailVerified !== false   // i profili più vecchi non hanno il campo: Google dà sempre mail verificate
  };
}
async function getUsers(redis, usernames) {
  if (!usernames.length) return {};
  const raws = await redis.mget(...usernames.map(u => "user:" + u));
  const out = {};
  usernames.forEach((u, i) => {
    const o = parse(raws[i]) || {};
    out[u] = { name: cleanText(o.name, 60) || "Utente", email: normEmail(o.email || "") };
  });
  return out;
}

async function getCircle(redis, cid) {
  if (typeof cid !== "string" || !ID.test(cid)) throw notFound("Cerchia");
  const c = parse(await redis.get(K.ci(cid)));
  if (!c) throw notFound("Cerchia");
  return c;
}
/* chi non fa parte di una cerchia non sa nemmeno se esiste: sempre 404 */
async function requireRole(redis, user, cid, min) {
  const c = await getCircle(redis, cid).catch(e => { throw e; });
  const m = parse(await redis.hget(K.cm(cid), user.username));
  if (!m) throw notFound("Cerchia");
  const rank = { member: 1, admin: 2, owner: 3 };
  if (rank[m.role] < rank[min]) throw forbidden();
  return { circle: c, me: m };
}
function pickMember(username, m, users, viewerRole) {
  const u = users[username] || { name: "Utente", email: "" };
  const o = { mid: m.mid, name: u.name, role: m.role, at: m.at };
  if (viewerRole === "owner" || viewerRole === "admin") o.email = u.email;
  return o;
}

/* ---- cerchie ---- */
async function create(redis, user, body) {
  const name = cleanText(body.name, 48);
  if (!name) throw bad("invalid_name", "Dai un nome alla cerchia.");
  const c = { id: rid(), name, owner: user.username, createdAt: Date.now() };
  /* prima si prenota il posto, poi si controlla il tetto: due richieste insieme non lo superano */
  const p0 = redis.pipeline();
  p0.sadd(K.co(user.username), c.id); p0.sadd(K.cu(user.username), c.id); p0.scard(K.co(user.username)); p0.scard(K.cu(user.username));
  const r0 = await p0.exec();
  const tooMany = Number(r0[2]) > MAX_OWNED ? "Hai già creato " + MAX_OWNED + " cerchie: eliminane una prima di crearne un'altra." : (Number(r0[3]) > MAX_JOINED ? "Fai già parte di " + MAX_JOINED + " cerchie." : "");
  if (tooMany) {
    const u = redis.pipeline(); u.srem(K.co(user.username), c.id); u.srem(K.cu(user.username), c.id); await u.exec();
    throw new HttpError(409, "limit", tooMany);
  }
  const mid = crypto.randomBytes(6).toString("hex");
  const p = redis.pipeline();
  p.set(K.ci(c.id), JSON.stringify(c));
  p.hset(K.cm(c.id), { [user.username]: JSON.stringify({ role: "owner", mid, at: c.createdAt }) });
  await p.exec();
  return { circle: { id: c.id, name: c.name, role: "owner", members: 1, createdAt: c.createdAt } };
}

async function list(redis, user) {
  const ids = ((await redis.smembers(K.cu(user.username))) || []).map(String).filter(x => ID.test(x));
  let circles = [];
  if (ids.length) {
    const cs = await redis.mget(...ids.map(K.ci));
    const p = redis.pipeline();
    ids.forEach(id => { p.hget(K.cm(id), user.username); p.hlen(K.cm(id)); });
    const r = await p.exec();
    const orfane = [];
    ids.forEach((id, i) => {
      const c = parse(cs[i]), m = parse(r[2 * i]);
      if (c && m) circles.push({ id, name: c.name, role: m.role, members: Number(r[2 * i + 1]) || 0, createdAt: c.createdAt });
      else orfane.push(id);
    });
    /* voci di una cerchia che non c'è più (o in cui non si è più): si tolgono, per non occupare il tetto */
    if (orfane.length) { const d = redis.pipeline(); orfane.forEach(id => { d.srem(K.cu(user.username), id); d.srem(K.co(user.username), id); }); await d.exec(); }
    circles.sort((a, b) => a.name.localeCompare(b.name, "it"));
  }
  return { circles, invites: await myInvites(redis, user), limits: { maxMembers: MAX_MEMBERS, maxOwned: MAX_OWNED, maxJoined: MAX_JOINED }, mail: mail.enabled() };
}

async function myInvites(redis, user) {
  if (!user.email || !user.verified) return [];
  const eh = emailHash(user.email);
  const refs = ((await redis.smembers(K.ce(eh))) || []).map(String);
  if (!refs.length) return [];
  const p = redis.pipeline();
  refs.forEach(r => { const [c, i] = r.split("|"); p.hget(K.cv(c), i); p.get(K.ci(c)); });
  const res = await p.exec();
  const out = [], stale = [], names = [];
  refs.forEach((r, k) => {
    const inv = parse(res[2 * k]), c = parse(res[2 * k + 1]);
    if (!inv || !c || inv.exp < Date.now() || inv.email !== user.email) { stale.push(r); return; }
    out.push({ id: inv.id, circleId: c.id, circleName: c.name, role: inv.role, by: inv.by, exp: inv.exp });
    names.push(inv.by);
  });
  if (stale.length) { const d = redis.pipeline(); stale.forEach(r => d.srem(K.ce(eh), r)); await d.exec(); }
  const users = await getUsers(redis, [...new Set(names)]);
  return out.map(o => ({ id: o.id, circleId: o.circleId, circleName: o.circleName, role: o.role, by: (users[o.by] || {}).name || "Un amico", exp: o.exp }));
}

async function get(redis, user, body) {
  const { circle, me } = await requireRole(redis, user, body.circle, "member");
  const hm = asObject(await redis.hgetall(K.cm(circle.id)));
  const usernames = Object.keys(hm);
  const users = await getUsers(redis, usernames);
  const members = usernames.map(u => parse(hm[u]) && Object.assign(pickMember(u, parse(hm[u]), users, me.role), { you: u === user.username })).filter(Boolean)
    .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.name.localeCompare(b.name, "it"));
  const out = { circle: { id: circle.id, name: circle.name, role: me.role, createdAt: circle.createdAt, members: members.length }, members };
  if (me.role !== "member") {
    out.mail = mail.enabled();
    const hv = asObject(await redis.hgetall(K.cv(circle.id)));
    await dropExpired(redis, circle.id, hv);
    out.invites = Object.values(hv).map(parse).filter(i => i && i.exp > Date.now())
      .map(i => ({ id: i.id, email: i.email, role: i.role, exp: i.exp, token: i.token, by: (i.by === user.username ? "tu" : ((users[i.by] || {}).name || "")) }))
      .sort((a, b) => b.exp - a.exp);
    const w = parse(await redis.get(K.cw(circle.id)));
    out.widget = w && TOKEN.test(w.token) ? { token: w.token, createdAt: w.at } : null;
  }
  return out;
}

/* gli inviti scaduti si tolgono (restano solo a pesare sulle letture) */
async function dropExpired(redis, cid, hv) {
  const scaduti = Object.values(hv).map(parse).filter(i => i && i.exp <= Date.now());
  if (!scaduti.length) return;
  const p = redis.pipeline();
  scaduti.forEach(i => { p.hdel(K.cv(cid), i.id); p.del(K.cl(i.token)); p.srem(K.ce(i.eh), cid + "|" + i.id); });
  await p.exec();
  scaduti.forEach(i => { delete hv[i.id]; });
}

const rename = (redis, user, body) => locked(redis, body.circle, async () => {
  const { circle } = await requireRole(redis, user, body.circle, "owner");
  const name = cleanText(body.name, 48);
  if (!name) throw bad("invalid_name", "Dai un nome alla cerchia.");
  circle.name = name;
  await redis.set(K.ci(circle.id), JSON.stringify(circle));
  return { circle: { id: circle.id, name } };
});

const remove = (redis, user, body) => locked(redis, body.circle, async () => {
  const { circle } = await requireRole(redis, user, body.circle, "owner");
  if (body.confirm !== true) throw bad("confirm_required", "Conferma l'eliminazione.");
  const hm = asObject(await redis.hgetall(K.cm(circle.id)));
  const hv = asObject(await redis.hgetall(K.cv(circle.id)));
  const p = redis.pipeline();
  Object.keys(hm).forEach(u => p.srem(K.cu(u), circle.id));
  p.srem(K.co(user.username), circle.id);      // il Proprietario è chi sta eliminando (verificato sopra)
  Object.keys(hm).forEach(u => p.srem(K.co(u), circle.id));
  Object.values(hv).map(parse).filter(Boolean).forEach(i => { p.del(K.cl(i.token)); p.srem(K.ce(i.eh), circle.id + "|" + i.id); });
  p.del(K.ci(circle.id)); p.del(K.cm(circle.id)); p.del(K.cv(circle.id));
  const wg = parse(await redis.get(K.cw(circle.id)));
  if (wg && TOKEN.test(wg.token)) p.del(K.wt(wg.token));
  p.del(K.cw(circle.id));
  await p.exec();
  await Team.deleteTeam(redis, CIRCLE_PARTNER.id, circle.id);   // le serate della cerchia, con i voti
  return { deleted: circle.id };
});

/* ---- inviti ---- */
const inviteCore = (redis, user, body) => locked(redis, body.circle, async () => {
  const { circle, me } = await requireRole(redis, user, body.circle, "admin");
  const role = body.role === "admin" ? "admin" : "member";
  if (role === "admin" && me.role !== "owner") throw forbidden("Solo il Proprietario può invitare un amministratore.");
  const list = Array.isArray(body.emails) ? body.emails : (typeof body.email === "string" ? [body.email] : []);
  if (!list.length) throw bad("invalid_email", "Scrivi almeno un indirizzo mail.");
  if (list.length > MAX_INVITES_PER_CALL) throw bad("too_many", "Al massimo " + MAX_INVITES_PER_CALL + " inviti per volta.");
  const validi = new Set(list.map(normEmail).filter(Boolean)).size;
  const rl = await limit.hit(redis, "cinv:" + circle.id, MAX_INVITES_PER_DAY, 86400, Math.max(1, validi));
  if (!rl.ok) throw new HttpError(429, "rate_limited", "Troppi inviti oggi per questa cerchia: riprova domani.");

  const hm = asObject(await redis.hgetall(K.cm(circle.id)));
  const memberUsers = await getUsers(redis, Object.keys(hm));
  const memberEmails = new Set(Object.values(memberUsers).map(u => u.email).filter(Boolean));
  const hv = asObject(await redis.hgetall(K.cv(circle.id)));
  await dropExpired(redis, circle.id, hv);
  const pending = Object.values(hv).map(parse).filter(i => i && i.exp > Date.now());
  const byEmail = new Map(pending.map(i => [i.email, i]));
  let count = Object.keys(hm).length + pending.length;
  const results = [], seen = new Set(), toMail = [];
  for (const raw of list) {
    const email = normEmail(raw);
    if (!email) { results.push({ email: String(raw).slice(0, 80), status: "invalid" }); continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    if (memberEmails.has(email)) { results.push({ email, status: "already_member" }); continue; }
    if (byEmail.has(email)) { const i = byEmail.get(email); results.push({ email, status: "already_invited", id: i.id, token: i.token }); continue; }
    if (count >= MAX_MEMBERS) { results.push({ email, status: "full" }); continue; }
    /* a una stessa persona non si può mandare una valanga di inviti */
    if ((await redis.scard(K.ce(emailHash(email)))) >= MAX_PENDING_PER_RECIPIENT) { results.push({ email, status: "unavailable" }); continue; }
    count++;
    const inv = { id: rid(), email, eh: emailHash(email), role, by: user.username, at: Date.now(), exp: Date.now() + INVITE_DAYS * 86400000, token: crypto.randomBytes(24).toString("hex") };
    const p = redis.pipeline();
    p.hset(K.cv(circle.id), { [inv.id]: JSON.stringify(inv) });
    p.set(K.cl(inv.token), circle.id + "|" + inv.id, { ex: INVITE_DAYS * 86400 });
    p.sadd(K.ce(inv.eh), circle.id + "|" + inv.id);
    await p.exec();
    const row = { email, status: "invited", id: inv.id, token: inv.token, exp: inv.exp };
    results.push(row);
    toMail.push({ row, inv });
  }
  return { results, circle: { id: circle.id, name: circle.name }, toMail };
});

/* La mail dell'invito (se è configurato un servizio di posta). Si manda DOPO aver creato gli inviti e
   fuori dal blocco; ogni persona ha dei limiti, così Sorso non diventa un modo per fare spam. */
async function mailInvite(redis, user, circle, inv, ctx) {
  if (!mail.enabled()) return "off";
  const a = await limit.hit(redis, "cmail:u:" + user.username, MAIL_PER_INVITER_DAY, 86400);
  const b = await limit.hit(redis, "cmail:r:" + inv.eh, MAIL_PER_RECIPIENT_DAY, 86400);
  if (!a.ok || !b.ok) return "limited";
  const link = ((ctx && ctx.origin) || "") + "/?invito=" + inv.token;
  const r = await mail.send(mail.inviteMail({ to: inv.email, circleName: circle.name, byName: user.name, role: inv.role, link, days: INVITE_DAYS }));
  return r.sent ? "sent" : "failed";
}
async function invite(redis, user, body, ctx) {
  const out = await inviteCore(redis, user, body);
  const rows = await Promise.all(out.toMail.map(({ row, inv }) => mailInvite(redis, user, out.circle, inv, ctx).then(m => { row.mail = m; })));
  void rows;
  return { results: out.results, mail: mail.enabled() };
}

/* «Rimanda la mail»: per un invito ancora valido, al massimo 3 volte */
async function resendInvite(redis, user, body, ctx) {
  const { circle } = await requireRole(redis, user, body.circle, "admin");
  const inv = typeof body.invite === "string" && ID.test(body.invite) ? parse(await redis.hget(K.cv(circle.id), body.invite)) : null;
  if (!inv || inv.exp < Date.now()) throw notFound("Invito");
  if (!mail.enabled()) return { mail: "off" };
  if ((inv.sent || 1) >= MAX_RESENDS + 1) return { mail: "limited" };
  const m = await mailInvite(redis, user, circle, inv, ctx);
  if (m === "sent") { inv.sent = (inv.sent || 1) + 1; await redis.hset(K.cv(circle.id), { [inv.id]: JSON.stringify(inv) }); }
  return { mail: m };
}

async function dropInvite(redis, circleId, inv) {
  const p = redis.pipeline();
  p.hdel(K.cv(circleId), inv.id); p.del(K.cl(inv.token)); p.srem(K.ce(inv.eh), circleId + "|" + inv.id);
  await p.exec();
}

const revokeInvite = (redis, user, body) => locked(redis, body.circle, async () => {
  const { circle } = await requireRole(redis, user, body.circle, "admin");
  const inv = typeof body.invite === "string" && ID.test(body.invite) ? parse(await redis.hget(K.cv(circle.id), body.invite)) : null;
  if (!inv) throw notFound("Invito");
  await dropInvite(redis, circle.id, inv);
  return { revoked: inv.id };
});

/* trova l'invito indicato (con il link o dall'elenco personale) e controlla che sia della persona */
async function findInvite(redis, user, body) {
  let cid, iid;
  if (typeof body.token === "string") {
    if (!TOKEN.test(body.token)) throw notFound("Invito");
    const ref = await redis.get(K.cl(body.token));
    if (!ref) throw new HttpError(410, "invite_expired", "Questo invito è scaduto o è già stato usato.");
    [cid, iid] = String(ref).split("|");
  } else { cid = body.circle; iid = body.invite; }
  if (typeof cid !== "string" || !ID.test(cid) || typeof iid !== "string" || !ID.test(iid)) throw notFound("Invito");
  const inv = parse(await redis.hget(K.cv(cid), iid));
  if (!inv || inv.exp < Date.now()) throw new HttpError(410, "invite_expired", "Questo invito è scaduto o è già stato usato.");
  const circle = parse(await redis.get(K.ci(cid)));
  if (!circle) throw new HttpError(410, "invite_expired", "Questa cerchia non esiste più.");
  const matches = !!user.email && user.verified && inv.email === user.email;
  return { inv, circle, matches };
}

async function peekInvite(redis, user, body) {
  const { inv, circle, matches } = await findInvite(redis, user, body);
  const by = (await getUsers(redis, [inv.by]))[inv.by];
  return { invite: { id: inv.id, circleId: circle.id, circleName: circle.name, role: inv.role, by: by ? by.name : "Un amico", exp: inv.exp, matches, emailMasked: maskEmail(inv.email) } };
}

/* Anteprima pubblica dell'invito, per chi apre il link senza aver ancora fatto l'accesso: chi lo manda, la cerchia,
   il ruolo e l'indirizzo mascherato. Il codice del link (192 bit) è già la prova; niente elenchi, niente altri dati. */
async function previewInvite(redis, _user, body) {
  const { inv, circle } = await findInvite(redis, { email: "", verified: false }, body);
  const by = (await getUsers(redis, [inv.by]))[inv.by];
  return { invite: { circleName: circle.name, role: inv.role, by: by ? by.name : "Un amico", exp: inv.exp, emailMasked: maskEmail(inv.email) } };
}

async function acceptInvite(redis, user, body) {
  const first = await findInvite(redis, user, body);
  return locked(redis, first.circle.id, async () => {
    /* dentro il blocco si rilegge tutto: nel frattempo la cerchia potrebbe essere stata eliminata o l'invito usato */
    const { inv, circle, matches } = await findInvite(redis, user, body);
    if (!matches) throw new HttpError(403, "wrong_account", "Questo invito è per " + maskEmail(inv.email) + ": entra con quell'account Google.");
    const cm = K.cm(circle.id);
    const existing = parse(await redis.hget(cm, user.username));
    if (!existing) {
      if ((await redis.hlen(cm)) >= MAX_MEMBERS) throw new HttpError(409, "full", "Questa cerchia è al completo (" + MAX_MEMBERS + " persone).");
      /* si prenota il posto tra le proprie cerchie, poi si controlla il tetto */
      await redis.sadd(K.cu(user.username), circle.id);
      if ((await redis.scard(K.cu(user.username))) > MAX_JOINED) { await redis.srem(K.cu(user.username), circle.id); throw new HttpError(409, "limit", "Fai già parte di " + MAX_JOINED + " cerchie."); }
      await redis.hset(cm, { [user.username]: JSON.stringify({ role: inv.role, mid: crypto.randomBytes(6).toString("hex"), at: Date.now() }) });
    }
    await dropInvite(redis, circle.id, inv);
    return { circle: { id: circle.id, name: circle.name, role: existing ? existing.role : inv.role } };
  });
}

async function declineInvite(redis, user, body) {
  const { inv, circle, matches } = await findInvite(redis, user, body);
  if (!matches) throw new HttpError(403, "wrong_account", "Questo invito non è per questo account.");
  await dropInvite(redis, circle.id, inv);
  return { declined: inv.id };
}

/* ---- membri ---- */
async function findMember(redis, circleId, mid) {
  if (typeof mid !== "string" || !MID.test(mid)) throw notFound("Persona");
  const hm = asObject(await redis.hgetall(K.cm(circleId)));
  for (const u of Object.keys(hm)) { const m = parse(hm[u]); if (m && m.mid === mid) return { username: u, m }; }
  throw notFound("Persona");
}

const setRole = (redis, user, body) => locked(redis, body.circle, async () => {
  const { circle } = await requireRole(redis, user, body.circle, "owner");
  if (body.role !== "admin" && body.role !== "member") throw bad("invalid_role", "Il ruolo è admin oppure member.");
  const t = await findMember(redis, circle.id, body.member);
  if (t.m.role === "owner") throw forbidden("Il ruolo del Proprietario si cambia trasferendo la proprietà.");
  t.m.role = body.role;
  await redis.hset(K.cm(circle.id), { [t.username]: JSON.stringify(t.m) });
  return { member: body.member, role: body.role };
});

const removeMember = (redis, user, body) => locked(redis, body.circle, async () => {
  const { circle, me } = await requireRole(redis, user, body.circle, "admin");
  const t = await findMember(redis, circle.id, body.member);
  if (t.m.role === "owner") throw forbidden("Il Proprietario non si può togliere.");
  if (t.username === user.username) throw bad("use_leave", "Per uscire usa «Esci dalla cerchia».");
  if (me.role === "admin" && t.m.role !== "member") throw forbidden("Un amministratore può togliere solo i membri.");
  const p = redis.pipeline();
  p.hdel(K.cm(circle.id), t.username); p.srem(K.cu(t.username), circle.id);
  await p.exec();
  return { removed: body.member };
});

const leave = (redis, user, body) => locked(redis, body.circle, async () => {
  const { circle, me } = await requireRole(redis, user, body.circle, "member");
  if (me.role === "owner") throw new HttpError(409, "owner_must_transfer", "Sei il Proprietario: trasferisci prima la proprietà a un'altra persona, oppure elimina la cerchia.");
  const p = redis.pipeline();
  p.hdel(K.cm(circle.id), user.username); p.srem(K.cu(user.username), circle.id);
  await p.exec();
  return { left: circle.id };
});

const transfer = (redis, user, body) => locked(redis, body.circle, async () => {
  const { circle } = await requireRole(redis, user, body.circle, "owner");
  const t = await findMember(redis, circle.id, body.member);
  if (t.username === user.username) throw bad("same_user", "Sei già il Proprietario.");
  if ((await redis.scard(K.co(t.username))) >= MAX_OWNED) throw new HttpError(409, "limit", "Quella persona ha già " + MAX_OWNED + " cerchie: non può riceverne un'altra.");
  const mine = parse(await redis.hget(K.cm(circle.id), user.username));
  t.m.role = "owner"; mine.role = "admin";
  circle.owner = t.username;
  const p = redis.pipeline();
  p.hset(K.cm(circle.id), { [t.username]: JSON.stringify(t.m), [user.username]: JSON.stringify(mine) });
  p.set(K.ci(circle.id), JSON.stringify(circle));
  p.srem(K.co(user.username), circle.id); p.sadd(K.co(t.username), circle.id);
  await p.exec();
  return { owner: body.member };
});

const WRITES = new Set(["widget.create", "widget.revoke", "votes.delete", "create", "rename", "delete", "invite", "invite.resend", "invite.revoke", "invite.accept", "invite.decline", "member.role", "member.remove", "leave", "transfer"]);
const OPS = {
  list, create, get, rename, delete: remove, invite, "invite.revoke": revokeInvite, "invite.resend": resendInvite, "invite.peek": peekInvite, "invite.preview": previewInvite,
  "invite.accept": acceptInvite, "invite.decline": declineInvite, "member.role": setRole, "member.remove": removeMember, leave, transfer,
  "votes.delete": deleteMyVotes, export: exportCircle, "widget.create": widgetCreate, "widget.revoke": widgetRevoke
};

/* ---- serate della cerchia: lo stesso motore dello spazio di team (api/_team.js) ----
   Per il motore una cerchia è un team di un partner interno, «cerchie»: la cerchia è il team, l'account è
   l'utente; Proprietario e Amministratori sono organizzatori, i Membri partecipanti. I voti restano anonimi. */
const CIRCLE_PARTNER = Object.freeze({ id: "cerchie", name: "Cerchie", modes: ["smart", "full"], defaultMode: "smart", lang: "it", theme: {} });

/* Chi può entrare nelle serate di una cerchia: sessione Sorso valida e ruolo letto dalla cerchia a OGNI richiesta
   (chi è stato tolto o ha cambiato ruolo lo vede subito). Chi non ne fa parte non sa nemmeno che esiste. */
async function embedContext(redis, token, cid) {
  const username = token ? await redis.get("session:" + token) : null;
  if (!username) throw new HttpError(401, "session", "Sessione scaduta: accedi di nuovo.");
  if (typeof cid !== "string" || !ID.test(cid)) throw notFound("Cerchia");
  const [mRaw, cRaw] = await Promise.all([redis.hget(K.cm(cid), String(username)), redis.get(K.ci(cid))]);
  const m = parse(mRaw), c = parse(cRaw);
  if (!m || !c) throw notFound("Cerchia");
  return {
    partner: CIRCLE_PARTNER, circle: c, username: String(username),
    ctx: { uid: String(username), name: "", team: cid, role: m.role === "member" ? "member" : "organizer", circleRole: m.role, lang: null, mode: null }
  };
}

/* «Cancella i miei voti»: tutti i voti e le ipotesi di questa persona in questa cerchia (le medie si ricalcolano) */
async function deleteMyVotes(redis, user, body) {
  const { circle } = await requireRole(redis, user, body.circle, "member");
  if (body.confirm !== true) throw bad("confirm_required", "Conferma la cancellazione.");
  const r = await Team.deleteUser(redis, CIRCLE_PARTNER.id, user.username, circle.id);
  return { votesRemoved: r.votesRemoved, guessesRemoved: r.guessesRemoved };
}

/* Esportazione per Proprietario e Amministratori: medie per vino di ogni serata, anonime
   (sotto i 2 voti la media non si dà: sarebbe il voto di una persona). */
async function exportCircle(redis, user, body) {
  const { circle } = await requireRole(redis, user, body.circle, "admin");
  const list = await Team.listTastings(redis, CIRCLE_PARTNER.id, { team: circle.id });
  const tastings = [];
  for (const t of list.slice(0, 200)) { try { tastings.push(await Team.getResults(redis, CIRCLE_PARTNER.id, t.id)); } catch (e) { /* eliminata nel frattempo */ } }
  const csv = ["tasting_id,tasting,date,status,wine_id,producer,name,vintage,votes,average,rank"].concat(
    ...tastings.map(r => r.wines.map(w => [r.tasting.id, r.tasting.name, r.tasting.createdAt.slice(0, 10), r.tasting.status, w.id, w.producer, w.name, w.vintage, w.votes, w.average == null ? "" : w.average, w.rank == null ? "" : w.rank].map(Team.csvCell).join(",")))
  ).join("\r\n") + "\r\n";
  const json = { circle: { id: circle.id, name: circle.name }, exportedAt: new Date().toISOString(), minVotes: Team.MIN_VOTES_API,
    tastings: tastings.map(r => ({ id: r.tasting.id, name: r.tasting.name, createdAt: r.tasting.createdAt, status: r.tasting.status, blind: r.tasting.blind, revealed: r.tasting.revealed,
      wines: r.wines.map(w => ({ id: w.id, position: w.position, producer: w.producer, name: w.name, vintage: w.vintage, type: w.type, grape: w.grape, status: w.status, votes: w.votes, average: w.average, rank: w.rank })) })) };
  return { csv, json };
}

/* ---- widget per i siti: un link di sola lettura con le statistiche della cerchia (api/widget.js) ----
   Uno per cerchia; lo creano e lo revocano Proprietario e amministratori. Mostra solo aggregati. */
function widgetCreate(redis, user, body) { return locked(redis, body.circle, async () => {
  const { circle } = await requireRole(redis, user, body.circle, "admin");
  const old = parse(await redis.get(K.cw(circle.id)));
  if (old && TOKEN.test(old.token) && body.rotate !== true) return { widget: { token: old.token, createdAt: old.at } };
  const token = crypto.randomBytes(24).toString("hex"), at = Date.now();
  const p = redis.pipeline();
  if (old && TOKEN.test(old.token)) p.del(K.wt(old.token));
  p.set(K.wt(token), circle.id); p.set(K.cw(circle.id), JSON.stringify({ token, by: user.username, at }));
  await p.exec();
  return { widget: { token, createdAt: at } };
}); }
function widgetRevoke(redis, user, body) { return locked(redis, body.circle, async () => {
  const { circle } = await requireRole(redis, user, body.circle, "admin");
  const old = parse(await redis.get(K.cw(circle.id)));
  const p = redis.pipeline();
  if (old && TOKEN.test(old.token)) p.del(K.wt(old.token));
  p.del(K.cw(circle.id));
  await p.exec();
  return { revoked: !!old };
}); }
/* per la pagina pubblica del widget: dal token alla cerchia (null se revocato o inesistente) */
async function widgetCircle(redis, token) {
  if (typeof token !== "string" || !TOKEN.test(token)) return null;
  const cid = await redis.get(K.wt(token));
  if (!cid || !ID.test(String(cid))) return null;
  const c = parse(await redis.get(K.ci(String(cid))));
  return c ? { id: c.id, name: c.name } : null;
}

/* operazioni che non chiedono l'accesso */
const PUBLIC = new Set(["invite.preview"]);

module.exports = { OPS, WRITES, PUBLIC, CIRCLE_PARTNER, embedContext, widgetCircle, getUser, normEmail, emailHash, MAX_MEMBERS, MAX_OWNED, MAX_JOINED, INVITE_DAYS, K };
