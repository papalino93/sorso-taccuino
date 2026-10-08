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
     uv:<p>:<u>         set    "<t>|<w>" di ogni voto (o ipotesi) dell'utente (per cancellarlo)
     gs:<p>:<t>:<w>:<u> stringa l'ipotesi di quell'utente su quel vino (solo "alla cieca"): JSON {y,g,a,t}
     gr:<p>:<t>         hash   vino → riepilogo anonimo delle ipotesi, scritto UNA volta quando si svela
     st:<p>:<team>      stringa statistiche del team già calcolate (scadono dopo 2 minuti)

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
const WINE_TYPES = ["Rosso", "Bianco", "Rosato", "Spumante", "Passito"];
const STATS_TTL = 120;        // secondi: le statistiche del team si ricalcolano al massimo ogni due minuti
const STATS_WINDOW = 30;      // le ultime degustazioni chiuse che entrano nelle statistiche
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
  uv: (p, u) => "uv:" + p + ":" + u,
  gs: (p, t, w, u) => "gs:" + p + ":" + t + ":" + w + ":" + u, gr: (p, t) => "gr:" + p + ":" + t, st: (p, team) => "st:" + p + ":" + team
};

/* chiavi dei dati del partner che un'eventuale pulizia deve conoscere */
const KEY_PATTERNS = id => ["tl:" + id + ":*", "wn:" + id + ":*", "vt:" + id + ":*", "vs:" + id + ":*", "sm:" + id + ":*", "ct:" + id + ":*", "uv:" + id + ":*", "gs:" + id + ":*", "gr:" + id + ":*", "st:" + id + ":*"];

const invalidateStats = (redis, pid, team) => redis.del(K.st(pid, team)).catch(() => {});

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
  if (body && body.blind === true) { t.blind = true; t.revealed = false; }
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
  await invalidateStats(redis, pid, ctx.team);
  return t;
}

async function setTastingStatus(redis, pid, ctx, tid, status) {
  requireOrganizer(ctx);
  if (STATUSES.indexOf(status) < 0) throw bad("invalid_status", "Stato non valido: open oppure closed.");
  const t = await getTasting(redis, pid, tid, ctx.team);
  if (t.revealed && status === "open") throw new HttpError(409, "revealed", "Una degustazione svelata non si riapre: i vini sono già noti.");
  t.status = status;
  await redis.hset(K.tl(pid, ctx.team), { [t.id]: JSON.stringify(t) });
  /* se nel frattempo è stata eliminata, la scrittura l'avrebbe fatta risorgere: si toglie */
  if (!(await redis.hexists(K.ti(pid), t.id))) {
    await redis.hdel(K.tl(pid, ctx.team), t.id);
    throw notFound("Degustazione");
  }
  /* uno svelamento arrivato proprio in mezzo avrebbe perso il suo "svelata": si rimette */
  const cur = parse(await redis.hget(K.tl(pid, ctx.team), t.id));
  if (cur && cur.revealed && !t.revealed) {
    t.revealed = true; t.revealedAt = cur.revealedAt; t.status = "closed";
    await redis.hset(K.tl(pid, ctx.team), { [t.id]: JSON.stringify(t) });
    await invalidateStats(redis, pid, ctx.team);
    if (status === "open") throw new HttpError(409, "revealed", "Una degustazione svelata non si riapre: i vini sono già noti.");
    return t;
  }
  await invalidateStats(redis, pid, ctx.team);
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
  if (wines.length) {
    const sp = redis.pipeline();
    wines.forEach(w => sp.smembers(K.vs(pid, t.id, w)));
    const lists = await sp.exec();
    const c = redis.pipeline();
    wines.forEach((w, i) => {
      const uids = (lists[i] || []).map(String);
      /* una sola cancellazione per vino (voti, ipotesi e indice) e la voce tolta dall'elenco di chi ha votato */
      const keys = [K.vs(pid, t.id, w)];
      uids.forEach(u => { keys.push(K.vt(pid, t.id, w, u), K.gs(pid, t.id, w, u)); c.srem(K.uv(pid, u), t.id + "|" + w); });
      c.del(...keys);
      votes += uids.length;
    });
    await c.exec();
  }
  const f = redis.pipeline();
  f.del(K.wn(pid, t.id)); f.del(K.sm(pid, t.id)); f.del(K.ct(pid, t.id)); f.del(K.gr(pid, t.id)); f.hdel(K.cn(pid), "w:" + t.id);
  await f.exec();
  await invalidateStats(redis, pid, ctx.team);
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
  const type = body.type == null || body.type === "" ? "" : String(body.type);
  if (type && WINE_TYPES.indexOf(type) < 0) throw bad("invalid_type", "Tipologia non valida: " + WINE_TYPES.join(", ") + ".");
  const grape = cleanText(body.grape, 40);
  const campo = "w:" + t.id;
  const n = await redis.hincrby(K.cn(pid), campo, 1);
  if (n > MAX_WINES) {
    await redis.hincrby(K.cn(pid), campo, -1);
    throw new HttpError(409, "limit", "Troppi vini in questa degustazione (massimo " + MAX_WINES + ").");
  }
  const w = { id: rid(), producer, name, vintage, createdAt: Date.now() };
  if (type) w.type = type;
  if (grape) w.grape = grape;
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
  p.sadd(K.vs(pid, tid, wid), ctx.uid);
  p.hexists(K.ti(pid), tid);
  p.hget(K.tl(pid, ctx.team), tid);
  const res = await p.exec();
  /* chiusa (o svelata) mentre si votava: i voti sono definitivi, questo non entra e il precedente torna com'era */
  const t2 = res[5] ? parse(res[5]) : null;
  if (Number(res[4]) && t2 && t2.status !== "open") {
    const c = redis.pipeline();
    if (oldRaw) c.set(K.vt(pid, tid, wid, ctx.uid), oldRaw); else c.del(K.vt(pid, tid, wid, ctx.uid));
    c.hincrby(K.sm(pid, tid), wid, -delta);
    c.hincrby(K.ct(pid, tid), wid, oldRaw ? 0 : -1);
    await c.exec();
    throw new HttpError(409, "closed", "La degustazione è stata chiusa: il voto non è stato salvato.");
  }
  /* la degustazione è stata eliminata mentre si votava: il voto non deve restare orfano */
  if (!Number(res[4])) {
    const c = redis.pipeline();
    c.del(K.vt(pid, tid, wid, ctx.uid)); c.srem(K.uv(pid, ctx.uid), tid + "|" + wid);
    c.del(K.sm(pid, tid)); c.del(K.ct(pid, tid)); c.del(K.vs(pid, tid, wid));
    await c.exec();
    throw notFound("Degustazione");
  }
  return { score: vote.score, replaced: !!oldRaw };
}

/* ---- alla cieca: ipotesi, punteggio e svelamento ----
   Una degustazione "alla cieca" nasconde ai partecipanti nome, produttore, annata, tipologia
   e vitigno dei vini (si vede "Vino 1", "Vino 2"…) finché l'organizzatore non la svela: il
   server non manda mai quei dati prima, nemmeno nascosti. Ognuno può scrivere un'ipotesi
   (tipologia, vitigno, annata). Svelando, la degustazione si chiude per sempre e ognuno vede
   il proprio punteggio di ipotesi; del gruppo si vede solo un riepilogo anonimo. */

const normText = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const yearOf = v => /^\d{4}$/.test(String(v || "")) ? Number(v) : null;

/* tipologia 1 punto, vitigno 2, annata 2 (esatta) o 1 (±1). Si valutano solo i dati che l'organizzatore ha inserito. */
function scoreGuess(w, g) {
  const out = { points: 0, max: 0, type: "na", grape: "na", year: "na" };
  g = g || {};
  if (w.type) { out.max += 1; if (g.y) { out.type = g.y === w.type ? "ok" : "ko"; if (out.type === "ok") out.points += 1; } }
  if (w.grape) {
    out.max += 2;
    const a = normText(g.g), b = normText(w.grape);
    if (a) {
      const ok = a === b || (a.length >= 4 && b.length >= 4 && (a.indexOf(b) > -1 || b.indexOf(a) > -1));
      out.grape = ok ? "ok" : "ko"; if (ok) out.points += 2;
    }
  }
  /* "NV" (senza annata): giusto solo se anche il vino lo è */
  const nvW = /^nv$/i.test(String(w.vintage || "").trim()), nvG = /^nv$/i.test(String(g.a || "").trim());
  if (nvW) { out.max += 2; if (String(g.a || "").trim()) { out.year = nvG ? "ok" : "ko"; if (nvG) out.points += 2; } }
  const wy = yearOf(w.vintage);
  if (wy !== null) {
    out.max += 2;
    const gy = yearOf(g.a);
    if (nvG) out.year = "ko";
    else if (gy !== null) {
      const d = Math.abs(gy - wy);
      if (d === 0) { out.year = "ok"; out.points += 2; } else if (d === 1) { out.year = "close"; out.points += 1; } else out.year = "ko";
    }
  }
  return out;
}

async function castGuess(redis, partner, ctx, body) {
  const pid = partner.id;
  body = body || {};
  const tid = checkId(body.tasting, "Degustazione"), wid = checkId(body.wine, "Vino");
  const t = await getTasting(redis, pid, tid, ctx.team);
  if (!t.blind) throw new HttpError(409, "not_blind", "Questa degustazione non è alla cieca.");
  if (t.revealed || t.status !== "open") throw new HttpError(409, "closed", "La degustazione è chiusa: le ipotesi sono definitive.");
  if (!(await redis.hget(K.wn(pid, tid), wid))) throw notFound("Vino");
  const type = body.type == null || body.type === "" ? "" : String(body.type);
  if (type && WINE_TYPES.indexOf(type) < 0) throw bad("invalid_type", "Tipologia non valida: " + WINE_TYPES.join(", ") + ".");
  const grape = cleanText(body.grape, 40);
  const year = cleanText(typeof body.year === "number" ? String(body.year) : body.year, 10).toUpperCase();
  if (year) {
    const y = Number(year);
    if (!(year === "NV" || (/^\d{4}$/.test(year) && y >= 1800 && y <= new Date().getUTCFullYear() + 1))) throw bad("invalid_vintage", "Annata non valida: un anno di quattro cifre oppure NV.");
  }
  if (!type && !grape && !year) throw bad("invalid_guess", "Scrivi almeno una cosa: tipologia, vitigno o annata.");
  /* come per i voti: gli indici si scrivono prima e dopo, e dopo si ricontrolla che la degustazione esista ancora e sia aperta */
  const idx = redis.pipeline();
  idx.sadd(K.uv(pid, ctx.uid), tid + "|" + wid);
  idx.sadd(K.vs(pid, tid, wid), ctx.uid);
  await idx.exec();
  await redis.set(K.gs(pid, tid, wid, ctx.uid), JSON.stringify({ y: type, g: grape, a: year, t: Date.now() }));
  const p = redis.pipeline();
  p.sadd(K.uv(pid, ctx.uid), tid + "|" + wid);
  p.sadd(K.vs(pid, tid, wid), ctx.uid);
  p.hget(K.tl(pid, ctx.team), tid);
  p.hexists(K.ti(pid), tid);
  const res = await p.exec();
  const t2 = res[2] ? parse(res[2]) : null;
  if (!Number(res[3]) || !t2) {
    await redis.del(K.gs(pid, tid, wid, ctx.uid)).catch(() => {});
    throw notFound("Degustazione");
  }
  /* svelata (o chiusa) mentre si scriveva: l'ipotesi non vale e non resta */
  if (t2.revealed || t2.status !== "open") {
    await redis.del(K.gs(pid, tid, wid, ctx.uid)).catch(() => {});
    throw new HttpError(409, "closed", "La degustazione è stata chiusa: l'ipotesi non è stata salvata.");
  }
  return { saved: true };
}

/* contributo di un'ipotesi al riepilogo anonimo di un vino (sign = +1 per aggiungerla, -1 per toglierla) */
function addToSnap(sn, w, g, sign) {
  const sc = scoreGuess(w, g);
  sn.n += sign;
  if (sc.type !== "na") { sn.ty[0] += sign; if (sc.type === "ok") sn.ty[1] += sign; }
  if (sc.grape !== "na") { sn.gr[0] += sign; if (sc.grape === "ok") sn.gr[1] += sign; }
  if (sc.year !== "na") { sn.yr[0] += sign; if (sc.year === "ok") sn.yr[1] += sign; else if (sc.year === "close") sn.yr[2] += sign; }
}
const emptySnap = () => ({ n: 0, ty: [0, 0], gr: [0, 0], yr: [0, 0, 0] });

/* Svela: chiude la degustazione per sempre e scrive il riepilogo anonimo delle ipotesi.
   Il riepilogo si scrive PRIMA di segnare la degustazione come svelata: se la funzione si
   interrompe a metà, un secondo "Svela" lo rifà da capo invece di trovarlo mancante. */
async function revealTasting(redis, pid, ctx, tid) {
  requireOrganizer(ctx);
  const t = await getTasting(redis, pid, tid, ctx.team);
  if (!t.blind) throw new HttpError(409, "not_blind", "Questa degustazione non è alla cieca.");
  if (t.revealed) return t;
  const wines = Object.values(parseHash(await redis.hgetall(K.wn(pid, t.id))));
  const snap = {};
  if (wines.length) {
    const sp = redis.pipeline();
    wines.forEach(w => sp.smembers(K.vs(pid, t.id, w.id)));
    const lists = (await sp.exec()).map(l => (l || []).map(String));
    const gp = redis.pipeline();
    let any = false;
    wines.forEach((w, i) => { if (lists[i].length) { any = true; gp.mget(...lists[i].map(u => K.gs(pid, t.id, w.id, u))); } });
    const got = any ? await gp.exec() : [];
    let k = 0;
    wines.forEach((w, i) => {
      const sn = emptySnap();
      if (lists[i].length) (got[k++] || []).forEach(r => { const g = r ? parse(r) : null; if (g) addToSnap(sn, w, g, 1); });
      snap[w.id] = JSON.stringify(sn);
    });
    await redis.hset(K.gr(pid, t.id), snap);
  }
  t.status = "closed"; t.revealed = true; t.revealedAt = Date.now();
  await redis.hset(K.tl(pid, ctx.team), { [t.id]: JSON.stringify(t) });
  if (!(await redis.hexists(K.ti(pid), t.id))) {
    await redis.hdel(K.tl(pid, ctx.team), t.id);
    await redis.del(K.gr(pid, t.id)).catch(() => {});
    throw notFound("Degustazione");
  }
  await invalidateStats(redis, pid, ctx.team);
  return t;
}

/* il riepilogo del gruppo è anonimo: con meno di due ipotesi coinciderebbe con quelle di una persona, e non si mostra */
const guessSummary = sn => !sn ? null : (sn.n < MIN_VOTES_API
  ? { guessers: Math.max(0, sn.n), hidden: true, type: null, grape: null, year: null }
  : { guessers: sn.n, hidden: false, type: { answered: sn.ty[0], correct: sn.ty[1] }, grape: { answered: sn.gr[0], correct: sn.gr[1] }, year: { answered: sn.yr[0], exact: sn.yr[1], close: sn.yr[2] } });

/* ---- stato per l'embed ---- */
async function getState(redis, partner, ctx, tid) {
  const pid = partner.id;
  const all = parseHash(await redis.hgetall(K.tl(pid, ctx.team)));
  const tastings = Object.values(all)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(t => ({ id: t.id, name: t.name, status: t.status, createdAt: t.createdAt, blind: !!t.blind, revealed: !!t.revealed }));
  const state = { tastings, tasting: null, wines: [] };
  if (!tid) return state;
  const t = typeof tid === "string" && ID_RE.test(tid) ? all[tid] : null;
  if (!t) throw notFound("Degustazione");
  const winesById = parseHash(await redis.hgetall(K.wn(pid, tid)));
  const wines = Object.values(winesById).sort((a, b) => a.createdAt - b.createdAt);
  state.tasting = { id: t.id, name: t.name, status: t.status, blind: !!t.blind, revealed: !!t.revealed };
  if (!wines.length) return state;
  /* alla cieca e non ancora svelata: ai partecipanti non si manda NULLA che riveli il vino */
  const hide = !!t.blind && !t.revealed && ctx.role !== "organizer";
  const [ct, sm, mie, gue, gr] = await Promise.all([
    redis.hgetall(K.ct(pid, tid)), redis.hgetall(K.sm(pid, tid)),
    redis.mget(...wines.map(w => K.vt(pid, tid, w.id, ctx.uid))),
    t.blind ? redis.mget(...wines.map(w => K.gs(pid, tid, w.id, ctx.uid))) : null,
    t.blind && t.revealed ? redis.hgetall(K.gr(pid, tid)) : null
  ]);
  const cts = asObject(ct), sms = asObject(sm), grs = parseHash(gr || []);
  state.wines = wines.map((w, i) => {
    const m = mie && mie[i] ? parse(mie[i]) : null;
    const count = Math.max(0, Number(cts[w.id]) || 0), sum = Number(sms[w.id]) || 0;
    const out = hide
      ? { id: w.id, index: i + 1, producer: "", name: "", vintage: "", type: "", grape: "" }
      : { id: w.id, index: i + 1, producer: w.producer, name: w.name, vintage: w.vintage, type: w.type || "", grape: w.grape || "" };
    out.mine = m ? { score: m.s, mode: m.m, data: m.d, note: m.n } : null;
    /* la media si vede dopo aver votato; a degustazione chiusa la vedono tutti, ma solo dal secondo voto
       (con un voto solo coinciderebbe con quello di una persona). L'organizzatore vede sempre
       quanti hanno votato, per sapere chi manca */
    out.team = (m && count > 0) || (t.status === "closed" && count >= MIN_VOTES_API) ? { avg: round1(sum / count), count } : null;
    out.votes = (m || ctx.role === "organizer") ? count : null;
    if (t.blind) {
      const g = gue && gue[i] ? parse(gue[i]) : null;
      out.guess = g ? { type: g.y || "", grape: g.g || "", year: g.a || "" } : null;
      if (t.revealed) {
        out.guessResult = g ? scoreGuess(w, g) : null;
        out.guessStats = guessSummary(grs[w.id] || null);
      }
    }
    return out;
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
    .map(t => ({ id: t.id, team: t.team, name: t.name, status: t.status, blind: !!t.blind, revealed: !!t.revealed, createdAt: new Date(t.createdAt).toISOString() }));
}

/* classifica con pari merito: a media uguale, stessa posizione (1, 2, 2, 4) */
function ranks(items, avgOf) {
  const out = new Map();
  items.forEach(it => { const a = avgOf(it); if (a == null) return; out.set(it, 1 + items.filter(o => { const b = avgOf(o); return b != null && b > a; }).length); });
  return out;
}

async function getResults(redis, pid, tid) {
  const t = await getTasting(redis, pid, tid, null);
  const [wn, ct, sm] = await Promise.all([
    redis.hgetall(K.wn(pid, tid)), redis.hgetall(K.ct(pid, tid)), redis.hgetall(K.sm(pid, tid))
  ]);
  const cts = asObject(ct), sms = asObject(sm);
  /* alla cieca e non svelata: l'API non rivela il vino (il sito del partner potrebbe mostrarlo ai partecipanti) */
  const hide = !!t.blind && !t.revealed;
  const rows = Object.values(parseHash(wn)).sort((a, b) => a.createdAt - b.createdAt).map((w, i) => {
    const count = Math.max(0, Number(cts[w.id]) || 0), sum = Number(sms[w.id]) || 0;
    const show = count >= MIN_VOTES_API;
    return Object.assign({ id: w.id, position: i + 1 },
      hide ? { producer: null, name: null, vintage: null, type: null, grape: null }
           : { producer: w.producer, name: w.name, vintage: w.vintage, type: w.type || null, grape: w.grape || null },
      { votes: count, average: show ? round1(sum / count) : null, hidden: count > 0 && !show });
  });
  const rk = ranks(rows, w => w.average);
  rows.forEach(w => { w.rank = rk.has(w) ? rk.get(w) : null; });
  return {
    tasting: { id: t.id, team: t.team, name: t.name, status: t.status, blind: !!t.blind, revealed: !!t.revealed, createdAt: new Date(t.createdAt).toISOString() },
    minVotes: MIN_VOTES_API, wines: rows
  };
}

/* riepilogo anonimo delle ipotesi di una degustazione alla cieca già svelata */
async function getGuesses(redis, pid, tid) {
  const t = await getTasting(redis, pid, tid, null);
  if (!t.blind) throw new HttpError(409, "not_blind", "Questa degustazione non è alla cieca.");
  if (!t.revealed) throw new HttpError(409, "not_revealed", "La degustazione non è ancora stata svelata.");
  const [wn, gr] = await Promise.all([redis.hgetall(K.wn(pid, tid)), redis.hgetall(K.gr(pid, tid))]);
  const grs = parseHash(gr);
  const nobody = { guessers: 0, hidden: true, type: null, grape: null, year: null };
  const wines = Object.values(parseHash(wn)).sort((a, b) => a.createdAt - b.createdAt).map((w, i) => {
    const g = guessSummary(grs[w.id]) || nobody;
    return { id: w.id, position: i + 1, producer: w.producer, name: w.name, vintage: w.vintage, type: w.type || null, grape: w.grape || null,
      guessers: g.guessers, answers: g.hidden ? null : { type: g.type, grape: g.grape, year: g.year } };
  });
  return { tasting: { id: t.id, team: t.team, name: t.name, status: t.status, revealed: true, createdAt: new Date(t.createdAt).toISOString() }, wines };
}

/* Una cella che inizia con = + - @, o con uno spazio, tabulazione o ritorno a capo seguito da
   uno di quei caratteri, in un foglio di calcolo verrebbe eseguita come formula. */
function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[\s]*[=+\-@|]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function resultsCsv(r) {
  const head = ["tasting_id", "tasting", "wine_id", "producer", "name", "vintage", "votes", "average", "type", "grape", "rank"];
  const rows = r.wines.map(w => [r.tasting.id, r.tasting.name, w.id, w.producer, w.name, w.vintage, w.votes, w.average == null ? "" : w.average, w.type, w.grape, w.rank == null ? "" : w.rank]);
  return [head].concat(rows).map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/* ---- cancellazione dei dati di un utente (richiesta del partner) ----
   Per ogni voto si usa GETDEL, che restituisce e toglie il voto in un'operazione sola:
   chi la ripete (o ne lancia due insieme) non toglie due volte. Il suo "voto
   nell'elenco dell'utente" si toglie voce per voce, non tutto insieme, così un nuovo
   voto arrivato nel frattempo non va perso. */
async function deleteUser(redis, pid, uid) {
  const members = ((await redis.smembers(K.uv(pid, uid))) || []).map(String).filter(m => /^[0-9a-f]{10}\|[0-9a-f]{10}$/.test(m));
  let removed = 0, guessesRemoved = 0;
  for (let i0 = 0; i0 < members.length; i0 += 200) {      // a blocchi: una richiesta enorme non passerebbe
    const blocco = members.slice(i0, i0 + 200);
    /* le ipotesi "alla cieca" dell'utente si tolgono allo stesso modo (restituisce e toglie in un colpo) */
    const gg = redis.pipeline();
    blocco.forEach(m => { const [t, w] = m.split("|"); gg.getdel(K.gs(pid, t, w, uid)); });
    const gone = await gg.exec();
    const tolti = [];
    gone.forEach((x, i) => { if (x) { guessesRemoved++; tolti.push([blocco[i], parse(x)]); } });
    /* se la degustazione è già svelata, l'ipotesi si toglie anche dal riepilogo anonimo del gruppo */
    if (tolti.length) {
      const q = redis.pipeline();
      tolti.forEach(([m]) => { const [t, w] = m.split("|"); q.hget(K.wn(pid, t), w); q.hget(K.gr(pid, t), w); });
      const info = await q.exec();
      const upd = {};
      tolti.forEach(([m, g], i) => {
        const [t, w] = m.split("|");
        const wine = info[2 * i] ? parse(info[2 * i]) : null, snRaw = info[2 * i + 1];
        if (!wine || !snRaw || !g) return;
        const sn = parse(snRaw); if (!sn) return;
        addToSnap(sn, wine, g, -1);
        (upd[t] || (upd[t] = {}))[w] = JSON.stringify(sn);
      });
      const u = redis.pipeline();
      Object.keys(upd).forEach(t => u.hset(K.gr(pid, t), upd[t]));
      if (Object.keys(upd).length) await u.exec();
    }
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
        removed++;
      }
    });
    if (fatti) await p.exec();
    /* la voce dell'indice si toglie solo se il voto non c'è più: un voto arrivato nel frattempo
       resta raggiungibile dalla prossima cancellazione */
    const e = redis.pipeline();
    blocco.forEach(m => { const [t, w] = m.split("|"); e.exists(K.vt(pid, t, w, uid), K.gs(pid, t, w, uid)); });
    const esiste = await e.exec();
    const r = redis.pipeline();
    let n = 0;
    const tolte = [];
    blocco.forEach((m, i) => { if (!Number(esiste[i])) { const [t, w] = m.split("|"); r.srem(K.uv(pid, uid), m); r.srem(K.vs(pid, t, w), uid); tolte.push(m); n++; } });
    if (n) {
      await r.exec();
      /* un voto scritto proprio tra il controllo e la rimozione: si ricontrolla e, se c'è, la voce si rimette */
      const e2 = redis.pipeline();
      tolte.forEach(m => { const [t, w] = m.split("|"); e2.exists(K.vt(pid, t, w, uid), K.gs(pid, t, w, uid)); });
      const ancora = await e2.exec();
      const back = redis.pipeline();
      let nb = 0;
      tolte.forEach((m, i) => { if (Number(ancora[i])) { const [t, w] = m.split("|"); back.sadd(K.uv(pid, uid), m); back.sadd(K.vs(pid, t, w), uid); nb++; } });
      if (nb) await back.exec();
    }
  }
  /* le statistiche in memoria dei team toccati si buttano: le medie sono cambiate */
  if (removed || guessesRemoved) {
    const tids = [...new Set(members.map(m => m.split("|")[0]))];
    const tp = redis.pipeline();
    tids.forEach(t => tp.hget(K.ti(pid), t));
    const teams = [...new Set((await tp.exec()).filter(Boolean).map(String))];
    if (teams.length) { const d = redis.pipeline(); teams.forEach(tm => d.del(K.st(pid, tm))); await d.exec(); }
  }
  return { votesRemoved: removed, guessesRemoved };
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

/* ---- statistiche ed eventi del team ----
   Si calcolano sulle ultime degustazioni CHIUSE (le aperte svelerebbero le medie di chi non ha
   ancora votato) e si tengono in memoria per due minuti: ricalcolarle costa un centinaio di
   comandi, leggerle uno. Solo aggregati: una media compare dal secondo voto in su, e per le
   degustazioni alla cieca non ancora svelate i vini restano "Vino N". */
const BUCKETS = [["lt60", 0, 59], ["b60", 60, 69], ["b70", 70, 79], ["b80", 80, 89], ["b90", 90, 100]];

async function computeTeamStats(redis, pid, team) {
  const all = Object.values(parseHash(await redis.hgetall(K.tl(pid, team))));
  const open = all.filter(t => t.status === "open").length;
  const closed = all.filter(t => t.status === "closed").sort((a, b) => b.createdAt - a.createdAt);
  const win = closed.slice(0, STATS_WINDOW);
  const res = win.length ? await (() => {
    const p = redis.pipeline();
    win.forEach(t => { p.hgetall(K.wn(pid, t.id)); p.hgetall(K.ct(pid, t.id)); p.hgetall(K.sm(pid, t.id)); });
    return p.exec();
  })() : [];
  let wineN = 0, voteN = 0, sumAll = 0, cntAll = 0;
  const dist = {}; BUCKETS.forEach(b => { dist[b[0]] = 0; });
  const rated = [], types = Object.create(null), events = [], wm = {}, tids = [];
  win.forEach((t, i) => {
    tids.push(t.id);
    const hide = !!t.blind && !t.revealed;
    const wines = Object.values(parseHash(res[3 * i])).sort((a, b) => a.createdAt - b.createdAt);
    const cts = asObject(res[3 * i + 1]), sms = asObject(res[3 * i + 2]);
    let tSum = 0, tCnt = 0, tVotes = 0, best = null, tie = false;
    wines.forEach((w, k) => {
      const count = Math.max(0, Number(cts[w.id]) || 0), sum = Number(sms[w.id]) || 0;
      wineN++; voteN += count; tVotes += count;
      const info = hide ? { name: "", producer: "", vintage: "", hidden: true, index: k + 1 } : { name: w.name, producer: w.producer, vintage: w.vintage, hidden: false, index: k + 1 };
      const avg = count >= MIN_VOTES_API ? sum / count : null;
      if (avg == null) return;
      if (wn_ok(wm)) wm[t.id + "|" + w.id] = Object.assign({ a: Scoring.roundHalfUp(avg, 2), t: t.name }, info);
      sumAll += sum; cntAll += count; tSum += sum; tCnt += count;
      const r = Scoring.roundHalfUp(avg);
      BUCKETS.forEach(b => { if (r >= b[1] && r <= b[2]) dist[b[0]]++; });
      const row = Object.assign({ avg: round1(avg), votes: count, tasting: t.id, tastingName: t.name }, info);
      rated.push(row);
      /* stesso criterio della classifica: si confrontano le medie arrotondate al decimale */
      if (!best || row.avg > best.avg) { best = row; tie = false; } else if (row.avg === best.avg) tie = true;
      if (w.type && !hide) { const e = types[w.type] || (types[w.type] = { sum: 0, count: 0, wines: 0 }); e.sum += sum; e.count += count; e.wines++; }
    });
    events.push({
      id: t.id, name: t.name, createdAt: t.createdAt, blind: !!t.blind, revealed: !!t.revealed, wines: wines.length, votes: tVotes,
      average: tCnt ? round1(tSum / tCnt) : null,
      winner: best ? { name: best.name, producer: best.producer, vintage: best.vintage, hidden: best.hidden, index: best.index, average: best.avg, votes: best.votes, tie } : null
    });
  });
  rated.sort((a, b) => b.avg - a.avg || b.votes - a.votes);
  return {
    v: 1, at: Date.now(),
    window: { tastings: win.length, closedTotal: closed.length, open },
    totals: { tastings: closed.length + open, open, closed: closed.length, wines: wineN, votes: voteN },
    average: cntAll ? round1(sumAll / cntAll) : null,
    distribution: BUCKETS.map(b => ({ key: b[0], wines: dist[b[0]] })),
    top: rated.slice(0, 5),
    byType: Object.keys(types).map(k => ({ type: k, wines: types[k].wines, average: round1(types[k].sum / types[k].count) })).sort((a, b) => b.average - a.average),
    events, tids, wm
  };
}
const wn_ok = wm => Object.keys(wm).length < 1500;       // tetto di sicurezza sulla dimensione di quanto si tiene in memoria

async function teamStats(redis, pid, team) {
  const raw = await redis.get(K.st(pid, team));
  const hit = raw ? parse(raw) : null;
  if (hit && hit.v === 1) return hit;
  const st = await computeTeamStats(redis, pid, team);
  await redis.set(K.st(pid, team), JSON.stringify(st), { ex: STATS_TTL }).catch(() => {});
  return st;
}

const publicStats = st => ({ at: st.at, window: st.window, totals: st.totals, average: st.average, distribution: st.distribution, top: st.top, byType: st.byType, events: st.events });

/* statistiche personali: solo i voti di chi le chiede, nelle degustazioni chiuse delle statistiche del team */
async function myStats(redis, pid, uid, st) {
  const inWin = new Set(st.tids);
  const members = ((await redis.smembers(K.uv(pid, uid))) || []).map(String).filter(m => /^[0-9a-f]{10}\|[0-9a-f]{10}$/.test(m) && inWin.has(m.split("|")[0])).slice(0, 300);
  if (!members.length) return { votes: 0, average: null, best: null, vsTeam: null };
  const votes = [];
  for (let i = 0; i < members.length; i += 150) {
    const blocco = members.slice(i, i + 150);
    const vals = await redis.mget(...blocco.map(m => { const [t, w] = m.split("|"); return K.vt(pid, t, w, uid); }));
    vals.forEach((v, j) => { const o = v ? parse(v) : null; if (o && Number.isFinite(o.s)) votes.push({ key: blocco[j], score: o.s }); });
  }
  if (!votes.length) return { votes: 0, average: null, best: null, vsTeam: null };
  const avg = votes.reduce((a, v) => a + v.score, 0) / votes.length;
  let top = votes[0];
  votes.forEach(v => { if (v.score > top.score) top = v; });
  let meta = st.wm[top.key] || null;
  if (!meta) {
    /* un vino senza media (meno di due voti) non è in memoria: si legge solo quello */
    const [t, w] = top.key.split("|");
    const raw = await redis.hget(K.wn(pid, t), w);
    const wine = raw ? parse(raw) : null, ev = st.events.find(e => e.id === t);
    if (wine && ev) {
      const hid = !!ev.blind && !ev.revealed;
      meta = hid ? { name: "", producer: "", vintage: "", hidden: true, index: 0, t: ev.name } : { name: wine.name, producer: wine.producer, vintage: wine.vintage, hidden: false, index: 0, t: ev.name };
    }
  }
  const cmp = votes.filter(v => st.wm[v.key] && st.wm[v.key].a != null);
  const diff = cmp.length >= 3 ? cmp.reduce((a, v) => a + (v.score - st.wm[v.key].a), 0) / cmp.length : null;
  return {
    votes: votes.length, average: round1(avg),
    best: meta ? { score: top.score, name: meta.name, producer: meta.producer, vintage: meta.vintage, hidden: !!meta.hidden, index: meta.index, tasting: meta.t } : { score: top.score, name: "", producer: "", vintage: "", hidden: true, index: 0, tasting: "" },
    vsTeam: diff == null ? null : { diff: round1(diff), wines: cmp.length }
  };
}

async function getStats(redis, partner, ctx) {
  const st = await teamStats(redis, partner.id, ctx.team);
  return Object.assign(publicStats(st), { mine: await myStats(redis, partner.id, ctx.uid, st) });
}

/* per il server del partner: stesse statistiche del team, senza dati personali */
async function getTeamStatsApi(redis, pid, team) {
  const st = await teamStats(redis, pid, team);
  const iso = x => new Date(x).toISOString();
  const p = publicStats(st);
  return Object.assign({ team }, p, { at: iso(p.at), events: p.events.map(e => Object.assign({}, e, { createdAt: iso(e.createdAt) })) });
}
async function getEventsApi(redis, pid, team) {
  const st = await getTeamStatsApi(redis, pid, team);
  return { team, events: st.events, window: st.window };
}

module.exports = {
  MAX_TASTINGS_PER_TEAM, MAX_TEAMS, MAX_WINES, MIN_VOTES_API,
  WINE_TYPES, STATS_TTL, STATS_WINDOW, KEY_PATTERNS, scoreGuess,
  validateVote, createTasting, setTastingStatus, deleteTasting, addWine, castVote, castGuess, revealTasting, getState, getStats,
  listTastings, getResults, getGuesses, getTeamStatsApi, getEventsApi, resultsCsv, csvCell, deleteUser, recount, getTasting, K, asObject
};
