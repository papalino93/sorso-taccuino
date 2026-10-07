const crypto = require("crypto");
const Scoring = require("../public/js/scoring.js");
const { HttpError, cleanText } = require("./_http");

/* Spazio di team: degustazioni, vini, voti e medie.

   Struttura: partner → team → degustazione → vini → voti.
   Chiavi Redis (<p> = id partner, <t> = degustazione, <w> = vino, <u> = utente):
     tl:<p>            hash  degustazione → JSON {id,team,name,status,createdAt,createdBy}
     wn:<p>:<t>        hash  vino → JSON {id,producer,name,vintage,createdAt,createdBy}
     vt:<p>:<t>:<w>    hash  utente → JSON del voto {s,m,d,n,t}
     mv:<p>:<t>:<u>    hash  vino → JSON del voto di quell'utente (lettura rapida)
     sm:<p>:<t>        hash  vino → somma dei punteggi
     ct:<p>:<t>        hash  vino → numero di voti
     uv:<p>:<u>        set   "<t>|<w>" di ogni voto dell'utente (per cancellarlo)
   La media si legge da sm/ct: nessuna scansione dei voti. Il punteggio di un
   voto lo calcola sempre il server dai giudizi: quello del client non conta. */

const MAX_TASTINGS = 500;
const MAX_WINES = 100;
const MIN_VOTES_API = 2;     // sotto questa soglia l'API non dà la media (sarebbe il voto di una persona)
const STATUSES = ["open", "closed"];

const rid = () => crypto.randomBytes(5).toString("hex");
const bad = (code, msg) => new HttpError(400, code, msg);
const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const round1 = x => Math.round(x * 10) / 10;

/* Il client Redis di questo progetto è creato con automaticDeserialization:
   false (vedi _redis.js), e in quel caso hgetall restituisce la lista piatta
   [campo, valore, campo, valore...] invece di un oggetto, e [] se vuoto.
   Qui si accettano entrambe le forme. L'oggetto è senza prototipo: i nomi dei
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

/* ---- degustazioni ---- */
async function getTasting(redis, pid, tid, team) {
  const raw = await redis.hget("tl:" + pid, String(tid));
  const t = raw ? parse(raw) : null;
  if (!t || (team != null && t.team !== team)) throw new HttpError(404, "not_found", "Degustazione non trovata.");
  return t;
}

function requireOrganizer(ctx) {
  if (ctx.role !== "organizer") throw new HttpError(403, "forbidden", "Solo l'organizzatore può farlo.");
}

async function createTasting(redis, pid, ctx, body) {
  requireOrganizer(ctx);
  const name = cleanText(body && body.name, 80);
  if (!name) throw bad("invalid_name", "Dai un nome alla degustazione.");
  if ((await redis.hlen("tl:" + pid)) >= MAX_TASTINGS) throw new HttpError(409, "limit", "Troppe degustazioni: contatta il gestore del servizio.");
  const t = { id: rid(), team: ctx.team, name, status: "open", createdAt: Date.now(), createdBy: ctx.uid };
  await redis.hset("tl:" + pid, { [t.id]: JSON.stringify(t) });
  return t;
}

async function setTastingStatus(redis, pid, ctx, tid, status) {
  requireOrganizer(ctx);
  if (STATUSES.indexOf(status) < 0) throw bad("invalid_status", "Stato non valido: open oppure closed.");
  const t = await getTasting(redis, pid, tid, ctx.team);
  t.status = status;
  await redis.hset("tl:" + pid, { [t.id]: JSON.stringify(t) });
  return t;
}

/* ---- vini ---- */
async function addWine(redis, pid, ctx, tid, body) {
  requireOrganizer(ctx);
  const t = await getTasting(redis, pid, tid, ctx.team);
  if (t.status !== "open") throw new HttpError(409, "closed", "La degustazione è chiusa.");
  const name = cleanText(body && body.name, 100);
  if (!name) throw bad("invalid_name", "Serve il nome del vino.");
  const producer = cleanText(body && body.producer, 80);
  const vintage = cleanText(body && body.vintage, 8);
  if (vintage && !/^(\d{4}|NV|nv)$/.test(vintage)) throw bad("invalid_vintage", "Annata non valida: quattro cifre oppure NV.");
  if ((await redis.hlen("wn:" + pid + ":" + t.id)) >= MAX_WINES) throw new HttpError(409, "limit", "Troppi vini in questa degustazione.");
  const w = { id: rid(), producer, name, vintage, createdAt: Date.now(), createdBy: ctx.uid };
  await redis.hset("wn:" + pid + ":" + t.id, { [w.id]: JSON.stringify(w) });
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
    if (!g || typeof g !== "object") throw bad("invalid_vote", "Mancano i giudizi.");
    const giudizi = {};
    Scoring.SMART_KEYS.forEach(k => {
      if (!isInt(g[k], 50, 100)) throw bad("invalid_vote", "Il giudizio '" + k + "' deve essere un intero tra 50 e 100.");
      giudizi[k] = g[k];
    });
    return { mode, data: { giudizi }, score: Scoring.smartScore(giudizi).total, note };
  }
  const v = body.voti;
  if (!v || typeof v !== "object") throw bad("invalid_vote", "Mancano i giudizi.");
  const voti = {};
  Object.keys(Scoring.ITEMS).forEach(grp => {
    voti[grp] = {};
    Scoring.ITEMS[grp].forEach(d => {
      const n = v[grp] && v[grp][d[0]];
      if (!isInt(n, 0, 10)) throw bad("invalid_vote", "Il giudizio '" + grp + "." + d[0] + "' deve essere un intero tra 0 e 10.");
      voti[grp][d[0]] = n;
    });
  });
  return { mode, data: { voti }, score: Scoring.fullScore(voti, Scoring.ITEMS).total, note };
}

async function castVote(redis, partner, ctx, body) {
  const pid = partner.id;
  const vote = validateVote(partner, body);
  const tid = String(body.tasting || ""), wid = String(body.wine || "");
  const t = await getTasting(redis, pid, tid, ctx.team);
  if (t.status !== "open") throw new HttpError(409, "closed", "La degustazione è chiusa: i voti sono definitivi.");
  if (!(await redis.hget("wn:" + pid + ":" + tid, wid))) throw new HttpError(404, "not_found", "Vino non trovato.");
  const oldRaw = await redis.hget("vt:" + pid + ":" + tid + ":" + wid, ctx.uid);
  const old = oldRaw ? parse(oldRaw) : null;
  const delta = vote.score - (old ? old.s : 0);
  const rec = JSON.stringify({ s: vote.score, m: vote.mode, d: vote.data, n: vote.note, t: Date.now() });
  const p = redis.pipeline();
  p.hset("vt:" + pid + ":" + tid + ":" + wid, { [ctx.uid]: rec });
  p.hset("mv:" + pid + ":" + tid + ":" + ctx.uid, { [wid]: rec });
  p.hincrby("sm:" + pid + ":" + tid, wid, delta);
  p.hincrby("ct:" + pid + ":" + tid, wid, old ? 0 : 1);
  p.sadd("uv:" + pid + ":" + ctx.uid, tid + "|" + wid);
  const res = await p.exec();
  const sum = Number(res[2]), count = Number(res[3]);
  return { score: vote.score, replaced: !!old, team: { avg: count ? round1(sum / count) : null, count } };
}

/* ---- stato per l'embed ---- */
async function getState(redis, partner, ctx, tid) {
  const pid = partner.id;
  const all = parseHash(await redis.hgetall("tl:" + pid));
  const tastings = Object.values(all).filter(t => t.team === ctx.team)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(t => ({ id: t.id, name: t.name, status: t.status, createdAt: t.createdAt }));
  const state = { tastings, tasting: null, wines: [] };
  if (!tid) return state;
  const t = all[tid];
  if (!t || t.team !== ctx.team) throw new HttpError(404, "not_found", "Degustazione non trovata.");
  const [wn, ct, sm, mv] = await Promise.all([
    redis.hgetall("wn:" + pid + ":" + tid), redis.hgetall("ct:" + pid + ":" + tid),
    redis.hgetall("sm:" + pid + ":" + tid), redis.hgetall("mv:" + pid + ":" + tid + ":" + ctx.uid)
  ]);
  const wines = Object.values(parseHash(wn)).sort((a, b) => a.createdAt - b.createdAt);
  const mine = parseHash(mv), cts = asObject(ct), sms = asObject(sm);
  state.tasting = { id: t.id, name: t.name, status: t.status };
  state.wines = wines.map(w => {
    const m = mine[w.id] || null;
    const count = Number(cts[w.id]) || 0, sum = Number(sms[w.id]) || 0;
    return {
      id: w.id, producer: w.producer, name: w.name, vintage: w.vintage,
      mine: m ? { score: m.s, mode: m.m, data: m.d, note: m.n } : null,
      /* la media si vede solo dopo aver votato; l'organizzatore vede sempre
         quanti hanno votato, per sapere chi manca */
      team: m && count ? { avg: round1(sum / count), count } : null,
      votes: (m || ctx.role === "organizer") ? count : null
    };
  });
  return state;
}

/* ---- API di sola lettura ---- */
async function listTastings(redis, pid, filter) {
  const all = Object.values(parseHash(await redis.hgetall("tl:" + pid)));
  return all
    .filter(t => (!filter.team || t.team === filter.team) && (!filter.status || t.status === filter.status))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(t => ({ id: t.id, team: t.team, name: t.name, status: t.status, createdAt: new Date(t.createdAt).toISOString() }));
}

async function getResults(redis, pid, tid) {
  const t = await getTasting(redis, pid, tid, null);
  const [wn, ct, sm] = await Promise.all([
    redis.hgetall("wn:" + pid + ":" + tid), redis.hgetall("ct:" + pid + ":" + tid), redis.hgetall("sm:" + pid + ":" + tid)
  ]);
  const cts = asObject(ct), sms = asObject(sm);
  const wines = Object.values(parseHash(wn)).sort((a, b) => a.createdAt - b.createdAt).map(w => {
    const count = Number(cts[w.id]) || 0, sum = Number(sms[w.id]) || 0;
    const show = count >= MIN_VOTES_API;
    return { id: w.id, producer: w.producer, name: w.name, vintage: w.vintage, votes: count,
      average: show ? round1(sum / count) : null, hidden: count > 0 && !show };
  });
  return {
    tasting: { id: t.id, team: t.team, name: t.name, status: t.status, createdAt: new Date(t.createdAt).toISOString() },
    minVotes: MIN_VOTES_API, wines
  };
}

/* una cella che inizia con = + - @ in un foglio di calcolo verrebbe eseguita come formula */
function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function resultsCsv(r) {
  const head = ["tasting_id", "tasting", "wine_id", "producer", "name", "vintage", "votes", "average"];
  const rows = r.wines.map(w => [r.tasting.id, r.tasting.name, w.id, w.producer, w.name, w.vintage, w.votes, w.average == null ? "" : w.average]);
  return [head].concat(rows).map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/* ---- cancellazione dei dati di un utente (richiesta del partner) ---- */
async function deleteUser(redis, pid, uid) {
  const members = (await redis.smembers("uv:" + pid + ":" + uid)) || [];
  let removed = 0;
  const mvDone = {};
  for (const m of members) {
    const [tid, wid] = String(m).split("|");
    if (!tid || !wid) continue;
    const vk = "vt:" + pid + ":" + tid + ":" + wid;
    const raw = await redis.hget(vk, uid);
    if (raw) {
      const s = (parse(raw) || {}).s || 0;
      const p = redis.pipeline();
      p.hdel(vk, uid);
      p.hincrby("sm:" + pid + ":" + tid, wid, -s);
      p.hincrby("ct:" + pid + ":" + tid, wid, -1);
      await p.exec();
      removed++;
    }
    mvDone["mv:" + pid + ":" + tid + ":" + uid] = true;
  }
  const keys = Object.keys(mvDone).concat(["uv:" + pid + ":" + uid]);
  if (keys.length) await redis.del(...keys);
  return { votesRemoved: removed };
}

module.exports = {
  MAX_TASTINGS, MAX_WINES, MIN_VOTES_API,
  validateVote, createTasting, setTastingStatus, addWine, castVote, getState,
  listTastings, getResults, resultsCsv, csvCell, deleteUser, getTasting
};
