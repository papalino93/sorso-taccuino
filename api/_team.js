const crypto = require("crypto");
const Scoring = require("../public/js/scoring.js");
const { HttpError, cleanText } = require("./_http");

/* Spazio di team: degustazioni, vini, voti e medie.

   Struttura: partner → team → degustazione → vini → voti.
   Chiavi Redis (<p> = id partner, <team>, <t> = degustazione, <w> = vino, <u> = utente):
     tl:<p>:<team>      hash   degustazione → JSON {id,team,name,status,createdAt}
     ti:<p>             hash   degustazione → team (per trovarla dal solo id)
     tm:<p>             set    i team del partner
     cn:<p>             hash   contatori dei tetti: t:<team> (degustazioni), w:<t> (vini), T (team)
     wn:<p>:<t>         hash   vino → JSON {id,producer,name,vintage,createdAt}
     vt:<p>:<t>:<w>:<u> stringa il voto di quell'utente su quel vino: JSON {s,m,d,n,t}
     vs:<p>:<t>:<w>     set    gli utenti che hanno votato quel vino (serve a pulire)
     sm:<p>:<t>         hash   vino → somma dei punteggi
     ct:<p>:<t>         hash   vino → numero di voti
     uv:<p>:<u>         set    "<t>|<w>" di ogni voto dell'utente (per cancellarlo)

   Somma e conteggio restano esatti anche con richieste simultanee perché ogni voto è
   UNA SOLA operazione indivisibile sul suo voto — SET con GET restituisce il valore
   precedente — e poi si somma la differenza: le differenze si sommano in qualunque ordine
   arrivino. Per cancellare si usa GETDEL, che restituisce e toglie il voto insieme: due
   cancellazioni simultanee non tolgono due volte. Il punteggio di un voto lo calcola
   sempre il server dai giudizi: quello del client non conta. */

const MAX_TASTINGS_PER_TEAM = 200;
const MAX_TEAMS = 2000;
const MAX_WINES = 100;
const MIN_VOTES_API = 2;     // sotto questa soglia l'API non dà la media (sarebbe il voto di una persona)
const STATUSES = ["open", "closed"];
const ID_RE = /^[0-9a-f]{10}$/;

const rid = () => crypto.randomBytes(5).toString("hex");
const bad = (code, msg) => new HttpError(400, code, msg);
const notFound = (what) => new HttpError(404, "not_found", what + " non trovat" + (what === "Vino" ? "o." : "a."));
const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const round1 = x => Scoring.roundHalfUp(x, 1);

/* Il client Redis di questo progetto è creato con automaticDeserialization: false (vedi
   _redis.js): hgetall restituisce la lista piatta [campo, valore, ...] invece di un oggetto,
   e [] se vuoto. Qui si accettano entrambe le forme. L'oggetto è senza prototipo: i nomi dei
   campi (anche un utente chiamato __proto__) non sono mai fidati. */
function asObject(h) {
  const out = Object.create(null);
  if (Array.isArray(h)) {
    for (let i = 0; i + 1 < h.length; i += 2) out[String(h[i])] = h[i + 1];
  } else if (h && typeof h === "object") {
    Object.keys(h).forEach(k => { out[k] = h[k]; });
  }
  return out;
}

function parseHash(h) {
  const raw = asObject(h), out = Object.create(null);
  Object.keys(raw).forEach(k => { const v = parse(raw[k]); if (v) out[k] = v; });
  return out;
}

const K = {
  tl: (p, team) => "tl:" + p + ":" + team, ti: p => "ti:" + p, tm: p => "tm:" + p, cn: p => "cn:" + p,
  wn: (p, t) => "wn:" + p + ":" + t, vt: (p, t, w, u) => "vt:" + p + ":" + t + ":" + w + ":" + u,
  vs: (p, t, w) => "vs:" + p + ":" + t + ":" + w, sm: (p, t) => "sm:" + p + ":" + t, ct: (p, t) => "ct:" + p + ":" + t,
  uv: (p, u) => "uv:" + p + ":" + u
};

function checkId(id, what) {
  if (typeof id !== "string" || !ID_RE.test(id)) throw notFound(what);
  return id;
}

/* ---- degustazioni ---- */
async function getTasting(redis, pid, tid, team) {
  checkId(tid, "Degustazione");
  if (team == null) team = await redis.hget(K.ti(pid), tid);
  if (!team) throw notFound("Degustazione");
  const raw = await redis.hget(K.tl(pid, team), tid);
  const t = raw ? parse(raw) : null;
  if (!t) throw notFound("Degustazione");
  return t;
}

function requireOrganizer(ctx) {
  if (ctx.role !== "organizer") throw new HttpError(403, "forbidden", "Solo l'organizzatore può farlo.");
}

async function createTasting(redis, pid, ctx, body) {
  requireOrganizer(ctx);
  const name = cleanText(body && body.name, 80);
  if (!name) throw bad("invalid_name", "Dai un nome alla degustazione.");
  /* il tetto si controlla con un contatore che si incrementa in un colpo solo: due richieste
     simultanee non possono passarlo entrambe */
  const campo = "t:" + ctx.team;
  const n = await redis.hincrby(K.cn(pid), campo, 1);
  if (n > MAX_TASTINGS_PER_TEAM) {
    await redis.hincrby(K.cn(pid), campo, -1);
    throw new HttpError(409, "limit", "Questo team ha raggiunto il numero massimo di degustazioni (" + MAX_TASTINGS_PER_TEAM + "). Elimina quelle che non servono più.");
  }
  const t = { id: rid(), team: ctx.team, name, status: "open", createdAt: Date.now() };
  try {
    const p = redis.pipeline();
    p.hset(K.tl(pid, ctx.team), { [t.id]: JSON.stringify(t) });
    p.hset(K.ti(pid), { [t.id]: ctx.team });
    p.sadd(K.tm(pid), ctx.team);
    const res = await p.exec();
    if (Number(res[2]) === 1) {                       // team nuovo
      const T = await redis.hincrby(K.cn(pid), "T", 1);
      if (T > MAX_TEAMS) {
        const r = redis.pipeline();
        r.hdel(K.tl(pid, ctx.team), t.id); r.hdel(K.ti(pid), t.id); r.srem(K.tm(pid), ctx.team); r.hincrby(K.cn(pid), "T", -1);
        await r.exec();
        throw new HttpError(409, "limit", "Troppi team per questo partner: contatta il gestore del servizio.");
      }
    }
  } catch (e) {
    await redis.hincrby(K.cn(pid), campo, -1).catch(() => {});
    throw e;
  }
  return t;
}

async function setTastingStatus(redis, pid, ctx, tid, status) {
  requireOrganizer(ctx);
  if (STATUSES.indexOf(status) < 0) throw bad("invalid_status", "Stato non valido: open oppure closed.");
  const t = await getTasting(redis, pid, tid, ctx.team);
  t.status = status;
  await redis.hset(K.tl(pid, ctx.team), { [t.id]: JSON.stringify(t) });
  /* se nel frattempo è stata eliminata, la scrittura l'avrebbe fatta risorgere: si toglie */
  if (!(await redis.hexists(K.ti(pid), t.id))) {
    await redis.hdel(K.tl(pid, ctx.team), t.id);
    throw notFound("Degustazione");
  }
  return t;
}

/* Elimina una degustazione con vini e voti. Si toglie prima dall'elenco (da quel momento
   non si può più votare) e poi si pulisce il resto. */
async function deleteTasting(redis, pid, ctx, tid) {
  requireOrganizer(ctx);
  const t = await getTasting(redis, pid, tid, ctx.team);
  const p = redis.pipeline();
  p.hdel(K.tl(pid, ctx.team), t.id);
  p.hdel(K.ti(pid), t.id);
  const res = await p.exec();
  /* chi la elimina per primo la toglie e libera il posto; due richieste insieme non liberano due volte */
  if (Number(res[0]) !== 1) throw notFound("Degustazione");
  await redis.hincrby(K.cn(pid), "t:" + ctx.team, -1);
  const wines = Object.keys(asObject(await redis.hgetall(K.wn(pid, t.id))));
  let votes = 0;
  for (const w of wines) {
    const uids = (await redis.smembers(K.vs(pid, t.id, w))) || [];
    const c = redis.pipeline();
    uids.forEach(u => c.del(K.vt(pid, t.id, w, u)));
    c.del(K.vs(pid, t.id, w));
    await c.exec();
    votes += uids.length;
  }
  const f = redis.pipeline();
  f.del(K.wn(pid, t.id)); f.del(K.sm(pid, t.id)); f.del(K.ct(pid, t.id)); f.hdel(K.cn(pid), "w:" + t.id);
  await f.exec();
  return { deleted: t.id, votesRemoved: votes };
}

/* ---- vini ---- */
async function addWine(redis, pid, ctx, tid, body) {
  requireOrganizer(ctx);
  const t = await getTasting(redis, pid, tid, ctx.team);
  if (t.status !== "open") throw new HttpError(409, "closed", "La degustazione è chiusa.");
  body = body && typeof body === "object" ? body : {};
  const name = cleanText(body.name, 100);
  if (!name) throw bad("invalid_name", "Serve il nome del vino.");
  const producer = cleanText(body.producer, 80);
  // si tronca largo (10) e poi si convalida: tagliare a 4 farebbe passare "20188" come "2018"
  const vintage = cleanText(typeof body.vintage === "number" ? String(body.vintage) : body.vintage, 10).toUpperCase();
  if (vintage) {
    const y = Number(vintage);
    const valida = vintage === "NV" || (/^\d{4}$/.test(vintage) && y >= 1800 && y <= new Date().getUTCFullYear() + 1);
    if (!valida) throw bad("invalid_vintage", "Annata non valida: un anno di quattro cifre oppure NV.");
  }
  const campo = "w:" + t.id;
  const n = await redis.hincrby(K.cn(pid), campo, 1);
  if (n > MAX_WINES) {
    await redis.hincrby(K.cn(pid), campo, -1);
    throw new HttpError(409, "limit", "Troppi vini in questa degustazione (massimo " + MAX_WINES + ").");
  }
  const w = { id: rid(), producer, name, vintage, createdAt: Date.now() };
  try { await redis.hset(K.wn(pid, t.id), { [w.id]: JSON.stringify(w) }); }
  catch (e) { await redis.hincrby(K.cn(pid), campo, -1).catch(() => {}); throw e; }
  return w;
}

/* ---- voti ---- */
function isInt(n, min, max) { return Number.isInteger(n) && n >= min && n <= max; }

/* Controlla il voto ricevuto e calcola il punteggio dai giudizi. */
function validateVote(partner, body) {
  body = body || {};
  const modes = partner.modes && partner.modes.length ? partner.modes : ["smart", "full"];
  const mode = body.mode === "smart" || body.mode === "full" ? body.mode : null;
  if (!mode) throw bad("invalid_vote", "Modalità non valida: smart oppure full.");
  if (modes.indexOf(mode) < 0) throw new HttpError(403, "mode_not_allowed", "Modalità non consentita per questo partner.");
  const note = cleanText(body.note, 500);
  if (mode === "smart") {
    const g = body.giudizi;
    if (!g || typeof g !== "object" || Array.isArray(g)) throw bad("invalid_vote", "Mancano i giudizi.");
    const giudizi = {};
    Scoring.SMART_KEYS.forEach(k => {
      if (!isInt(g[k], 50, 100)) throw bad("invalid_vote", "Il giudizio '" + k + "' deve essere un intero tra 50 e 100.");
      giudizi[k] = g[k];
    });
    return { mode, data: { giudizi }, score: Scoring.smartScore(giudizi).total, note };
  }
  const v = body.voti;
  if (!v || typeof v !== "object" || Array.isArray(v)) throw bad("invalid_vote", "Mancano i giudizi.");
  const voti = {};
  Object.keys(Scoring.ITEMS).forEach(grp => {
    voti[grp] = {};
    Scoring.ITEMS[grp].forEach(d => {
      const n = v[grp] && typeof v[grp] === "object" ? v[grp][d[0]] : undefined;
      if (!isInt(n, 0, 10)) throw bad("invalid_vote", "Il giudizio '" + grp + "." + d[0] + "' deve essere un intero tra 0 e 10.");
      voti[grp][d[0]] = n;
    });
  });
  return { mode, data: { voti }, score: Scoring.fullScore(voti, Scoring.ITEMS).total, note };
}

async function castVote(redis, partner, ctx, body) {
  const pid = partner.id;
  body = body || {};
  const vote = validateVote(partner, body);
  const tid = checkId(body.tasting, "Degustazione"), wid = checkId(body.wine, "Vino");
  const t = await getTasting(redis, pid, tid, ctx.team);
  if (t.status !== "open") throw new HttpError(409, "closed", "La degustazione è chiusa: i voti sono definitivi.");
  if (!(await redis.hget(K.wn(pid, tid), wid))) throw notFound("Vino");
  const rec = JSON.stringify({ s: vote.score, m: vote.mode, d: vote.data, n: vote.note, t: Date.now() });
  /* UN'operazione sola scrive il voto e restituisce il precedente: da qui in poi ogni richiesta
     sa esattamente da quale valore parte, comunque arrivino le altre */
  /* Gli indici (voti dell'utente, votanti del vino) si scrivono PRIMA del voto e di nuovo dopo:
     l'indice contiene sempre almeno i voti che esistono, quindi una cancellazione che arriva
     in mezzo non può lasciare un voto che nessuno trova più. */
  const idx = redis.pipeline();
  idx.sadd(K.uv(pid, ctx.uid), tid + "|" + wid);
  idx.sadd(K.vs(pid, tid, wid), ctx.uid);
  await idx.exec();
  const oldRaw = await redis.set(K.vt(pid, tid, wid, ctx.uid), rec, { get: true });
  const old = oldRaw ? parse(oldRaw) : null;
  const delta = vote.score - (old && Number.isFinite(old.s) ? old.s : 0);
  const p = redis.pipeline();
  p.hincrby(K.sm(pid, tid), wid, delta);
  p.hincrby(K.ct(pid, tid), wid, oldRaw ? 0 : 1);
  p.sadd(K.uv(pid, ctx.uid), tid + "|" + wid);
  p.hexists(K.ti(pid), tid);
  const res = await p.exec();
  /* la degustazione è stata eliminata mentre si votava: il voto non deve restare orfano */
  if (!Number(res[3])) {
    const c = redis.pipeline();
    c.del(K.vt(pid, tid, wid, ctx.uid)); c.srem(K.uv(pid, ctx.uid), tid + "|" + wid);
    c.del(K.sm(pid, tid)); c.del(K.ct(pid, tid)); c.del(K.vs(pid, tid, wid));
    await c.exec();
    throw notFound("Degustazione");
  }
  return { score: vote.score, replaced: !!oldRaw };
}

/* ---- stato per l'embed ---- */
async function getState(redis, partner, ctx, tid) {
  const pid = partner.id;
  const all = parseHash(await redis.hgetall(K.tl(pid, ctx.team)));
  const tastings = Object.values(all)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(t => ({ id: t.id, name: t.name, status: t.status, createdAt: t.createdAt }));
  const state = { tastings, tasting: null, wines: [] };
  if (!tid) return state;
  const t = typeof tid === "string" && ID_RE.test(tid) ? all[tid] : null;
  if (!t) throw notFound("Degustazione");
  const winesById = parseHash(await redis.hgetall(K.wn(pid, tid)));
  const wines = Object.values(winesById).sort((a, b) => a.createdAt - b.createdAt);
  state.tasting = { id: t.id, name: t.name, status: t.status };
  if (!wines.length) return state;
  const [ct, sm, mie] = await Promise.all([
    redis.hgetall(K.ct(pid, tid)), redis.hgetall(K.sm(pid, tid)),
    redis.mget(...wines.map(w => K.vt(pid, tid, w.id, ctx.uid)))
  ]);
  const cts = asObject(ct), sms = asObject(sm);
  state.wines = wines.map((w, i) => {
    const m = mie && mie[i] ? parse(mie[i]) : null;
    const count = Math.max(0, Number(cts[w.id]) || 0), sum = Number(sms[w.id]) || 0;
    return {
      id: w.id, producer: w.producer, name: w.name, vintage: w.vintage,
      mine: m ? { score: m.s, mode: m.m, data: m.d, note: m.n } : null,
      /* la media si vede solo dopo aver votato; l'organizzatore vede sempre
         quanti hanno votato, per sapere chi manca */
      team: m && count > 0 ? { avg: round1(sum / count), count } : null,
      votes: (m || ctx.role === "organizer") ? count : null
    };
  });
  return state;
}

/* ---- API di sola lettura ---- */
async function listTastings(redis, pid, filter) {
  const teams = filter.team ? [filter.team] : ((await redis.smembers(K.tm(pid))) || []);
  const rows = [];
  if (teams.length) {
    /* una sola richiesta di rete per tutti i team (resta un comando per team: meglio filtrare per team) */
    const p = redis.pipeline();
    teams.forEach(team => p.hgetall(K.tl(pid, team)));
    (await p.exec()).forEach(h => Object.values(parseHash(h)).forEach(t => rows.push(t)));
  }
  return rows
    .filter(t => !filter.status || t.status === filter.status)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(t => ({ id: t.id, team: t.team, name: t.name, status: t.status, createdAt: new Date(t.createdAt).toISOString() }));
}

async function getResults(redis, pid, tid) {
  const t = await getTasting(redis, pid, tid, null);
  const [wn, ct, sm] = await Promise.all([
    redis.hgetall(K.wn(pid, tid)), redis.hgetall(K.ct(pid, tid)), redis.hgetall(K.sm(pid, tid))
  ]);
  const cts = asObject(ct), sms = asObject(sm);
  const wines = Object.values(parseHash(wn)).sort((a, b) => a.createdAt - b.createdAt).map(w => {
    const count = Math.max(0, Number(cts[w.id]) || 0), sum = Number(sms[w.id]) || 0;
    const show = count >= MIN_VOTES_API;
    return { id: w.id, producer: w.producer, name: w.name, vintage: w.vintage, votes: count,
      average: show ? round1(sum / count) : null, hidden: count > 0 && !show };
  });
  return {
    tasting: { id: t.id, team: t.team, name: t.name, status: t.status, createdAt: new Date(t.createdAt).toISOString() },
    minVotes: MIN_VOTES_API, wines
  };
}

/* Una cella che inizia con = + - @, o con uno spazio, tabulazione o ritorno a capo seguito da
   uno di quei caratteri, in un foglio di calcolo verrebbe eseguita come formula. */
function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[\s]*[=+\-@|]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function resultsCsv(r) {
  const head = ["tasting_id", "tasting", "wine_id", "producer", "name", "vintage", "votes", "average"];
  const rows = r.wines.map(w => [r.tasting.id, r.tasting.name, w.id, w.producer, w.name, w.vintage, w.votes, w.average == null ? "" : w.average]);
  return [head].concat(rows).map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/* ---- cancellazione dei dati di un utente (richiesta del partner) ----
   Per ogni voto si usa GETDEL, che restituisce e toglie il voto in un'operazione sola:
   chi la ripete (o ne lancia due insieme) non toglie due volte. Il suo "voto
   nell'elenco dell'utente" si toglie voce per voce, non tutto insieme, così un nuovo
   voto arrivato nel frattempo non va perso. */
async function deleteUser(redis, pid, uid) {
  const members = ((await redis.smembers(K.uv(pid, uid))) || []).map(String).filter(m => /^[0-9a-f]{10}\|[0-9a-f]{10}$/.test(m));
  let removed = 0;
  for (let i0 = 0; i0 < members.length; i0 += 200) {      // a blocchi: una richiesta enorme non passerebbe
    const blocco = members.slice(i0, i0 + 200);
    const g = redis.pipeline();
    blocco.forEach(m => { const [t, w] = m.split("|"); g.getdel(K.vt(pid, t, w, uid)); });
    const olds = await g.exec();
    const p = redis.pipeline();
    let fatti = 0;
    blocco.forEach((m, i) => {
      const [t, w] = m.split("|");
      if (olds[i]) {
        fatti++;
        const o = parse(olds[i]);
        p.hincrby(K.sm(pid, t), w, -(o && Number.isFinite(o.s) ? o.s : 0));
        p.hincrby(K.ct(pid, t), w, -1);
        p.srem(K.vs(pid, t, w), uid);
        removed++;
      }
    });
    if (fatti) await p.exec();
    /* la voce dell'indice si toglie solo se il voto non c'è più: un voto arrivato nel frattempo
       resta raggiungibile dalla prossima cancellazione */
    const e = redis.pipeline();
    blocco.forEach(m => { const [t, w] = m.split("|"); e.exists(K.vt(pid, t, w, uid)); });
    const esiste = await e.exec();
    const r = redis.pipeline();
    let n = 0;
    blocco.forEach((m, i) => { if (!Number(esiste[i])) { r.srem(K.uv(pid, uid), m); n++; } });
    if (n) await r.exec();
  }
  return { votesRemoved: removed };
}

/* Ricalcola somma e conteggio di una degustazione dai voti veri: strumento di riparazione
   (se una funzione si spegne tra il voto e l'aggiornamento della media). */
async function recount(redis, pid, tid) {
  const wines = Object.keys(asObject(await redis.hgetall(K.wn(pid, tid))));
  const out = [];
  for (const w of wines) {
    const uids = (await redis.smembers(K.vs(pid, tid, w))) || [];
    let sum = 0, count = 0;
    if (uids.length) {
      const vals = await redis.mget(...uids.map(u => K.vt(pid, tid, w, u)));
      vals.forEach(v => { const o = v ? parse(v) : null; if (o && Number.isFinite(o.s)) { sum += o.s; count++; } });
    }
    const p = redis.pipeline();
    p.hset(K.sm(pid, tid), { [w]: String(sum) });
    p.hset(K.ct(pid, tid), { [w]: String(count) });
    await p.exec();
    out.push({ wine: w, votes: count, sum });
  }
  return out;
}

module.exports = {
  MAX_TASTINGS_PER_TEAM, MAX_TEAMS, MAX_WINES, MIN_VOTES_API,
  validateVote, createTasting, setTastingStatus, deleteTasting, addWine, castVote, getState,
  listTastings, getResults, resultsCsv, csvCell, deleteUser, recount, getTasting, K, asObject
};
