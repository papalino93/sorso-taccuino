const crypto = require("crypto");
const { HttpError } = require("./_http");
const Team = require("./_team");
const Circles = require("./_circles");
const Scoring = require("../public/js/scoring.js");

/* Modalità gioco nelle cerchie (la accendono Proprietario o Amministratori, cerchia per cerchia).
   Per ogni vino di una serata, oltre al voto:
     - IL CAMPO: un piano con due assi (cambiano a ogni vino) dove ognuno mette la propria faccia;
     - IL PRONOSTICO: quanto darà il gruppo a questo vino (50-100);
     - QUANTO COSTA: il prezzo a occhio (l'organizzatore scrive quello vero).
   Finché il vino non è svelato ognuno vede solo le proprie mosse e chi ha già giocato. Si svela quando
   hanno votato tutti, quando il vino o la serata si chiudono, o quando l'organizzatore preme «Svela!»:
   allora tutti vedono tutto di tutti (nomi, facce, voti, posizioni, pronostici, prezzi), i punti, i
   cartellini, e si possono lasciare reazioni e frecciatine (solo frasi prestabilite: niente testo libero).
   Fuori dalle cerchie col gioco acceso non cambia nulla: medie anonime come sempre.

   Redis (t = degustazione, w = vino, c = cerchia):
     gp:<t>:<w>   hash   utente → {x,y,p,e,at}         le mosse
     gx:<t>:<w>   hash   "da|a" → {e,f}                le reazioni (una emoji e una frase per coppia)
     gw:<t>       hash   vino → {price, revealed}       prezzo vero e svelamento manuale
     gb:<c>       stringa la classifica della stagione già calcolata (2 minuti)

   Chi gioca si riconosce da un'impronta per cerchia (mai l'account Google). */

const PID = Circles.CIRCLE_PARTNER.id;
const K = { gp: (t, w) => "gp:" + t + ":" + w, gx: (t, w) => "gx:" + t + ":" + w, gw: t => "gw:" + t, gb: c => "gb:" + c, gq: c => "gq:" + c };
const AXES = [["corpo", "acidita"], ["tannino", "morbidezza"], ["frutto", "legno"], ["intensita", "persistenza"], ["dolcezza", "freschezza"]];
const EMOJI = ["🍷", "😂", "🙈", "🧐", "🔥"];
const PHRASES = 10;                      // f1…f10: i testi sono nell'interfaccia (italiano e inglese)
const BOARD_TTL = 120, BOARD_TASTINGS = 30;
const ID_RE = /^[0-9a-f]{10}$/;

const parse = s => { try { return typeof s === "string" ? JSON.parse(s) : (s && typeof s === "object" ? s : null); } catch (e) { return null; } };
const r1 = x => Scoring.roundHalfUp(x, 1);
const r0 = x => Scoring.roundHalfUp(x, 0);
const pk = (cid, uid) => crypto.createHash("sha256").update(cid + "|" + uid).digest("hex").slice(0, 10);
const off = () => new HttpError(403, "game_off", "In questa cerchia il gioco non è attivo.");
const bad = (code, msg) => new HttpError(400, code, msg);

function requireGame(partner, ctx) { if (partner.id !== PID || !ctx.game) throw off(); }

async function wineOf(redis, ctx, tid, wid) {
  const t = await Team.getTasting(redis, PID, tid, ctx.team);
  if (typeof wid !== "string" || !ID_RE.test(wid)) throw new HttpError(404, "not_found", "Vino non trovato.");
  const w = parse(await redis.hget(Team.K.wn(PID, t.id), wid));
  if (!w) throw new HttpError(404, "not_found", "Vino non trovato.");
  return { t, w };
}

/* i membri della cerchia: impronta, nome, foto */
async function people(redis, ctx) {
  const hm = Team.asObject(await redis.hgetall(Circles.K.cm(ctx.team)));
  const uids = Object.keys(hm);
  const users = await Circles.getUsers(redis, uids);
  const out = {};
  uids.forEach(u => { out[pk(ctx.team, u)] = { uid: u, name: (users[u] || {}).name || "Utente", pic: (users[u] || {}).pic || "", me: u === ctx.uid }; });
  return out;
}

/* punti di un vino svelato: pronostico (10 se indovini la media), prezzo (10 se esatto), campo (10 al centro del gruppo) */
function score(entries, votes, price) {
  const vs = Object.values(votes);
  const avg = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  const pos = Object.values(entries).filter(e => e.x != null);
  const center = pos.length ? { x: pos.reduce((a, e) => a + e.x, 0) / pos.length, y: pos.reduce((a, e) => a + e.y, 0) / pos.length } : null;
  const res = {};
  const all = new Set(Object.keys(entries).concat(Object.keys(votes)));
  all.forEach(u => {
    const e = entries[u] || {};
    const pts = { pron: null, price: null, field: null };
    if (e.p != null && avg != null) pts.pron = Math.max(0, r0(10 - Math.abs(e.p - avg)));
    if (e.e != null && price) pts.price = Math.max(0, r0(10 * (1 - Math.abs(e.e - price) / price)));
    const dist = e.x != null && center && pos.length >= 2 ? Math.hypot(e.x - center.x, e.y - center.y) : null;
    if (dist != null) pts.field = Math.max(0, r0(10 - dist * 1.5));
    pts.total = (pts.pron || 0) + (pts.price || 0) + (pts.field || 0);
    res[u] = { e, vote: votes[u] != null ? votes[u] : null, pts, dist, pronErr: e.p != null && avg != null ? Math.abs(e.p - avg) : null, priceErr: e.e != null && price ? Math.abs(e.e - price) : null };
  });
  /* cartellini: chi è più lontano dal gruppo, chi è più in sintonia, il pronostico e il prezzo migliori */
  const best = (key, fn) => { let k = null, v = null; Object.keys(res).forEach(u => { const x = res[u][key]; if (x != null && (v == null || fn(x, v))) { v = x; k = u; } }); return k; };
  const badges = {};
  const add = (u, b) => { if (u) (badges[u] = badges[u] || []).push(b); };
  if (pos.length >= 3) { add(best("dist", (a, b) => a > b), "fuori"); add(best("dist", (a, b) => a < b), "sintonia"); }
  if (Object.values(res).filter(r => r.pronErr != null).length >= 2) add(best("pronErr", (a, b) => a < b), "pronostico");
  if (Object.values(res).filter(r => r.priceErr != null).length >= 2) add(best("priceErr", (a, b) => a < b), "prezzo");
  return { avg, center, res, badges };
}

/* svelato: a mano, a vino o serata chiusi, oppure quando hanno votato tutti i membri della cerchia */
async function isRevealed(redis, ctx, t, w, m) {
  if (m.revealed || t.status === "closed" || w.closed) return true;
  const [members, voters] = await Promise.all([redis.hkeys(Circles.K.cm(ctx.team)), redis.smembers(Team.K.vs(PID, t.id, w.id))]);
  const set = new Set((voters || []).map(String));
  return members.length > 0 && members.every(u => set.has(String(u)));
}

/* lo stato del gioco di una serata */
async function state(redis, partner, ctx, body) {
  requireGame(partner, ctx);
  const t = await Team.getTasting(redis, PID, body.tasting, ctx.team);
  const wines = Object.values(Team.asObject(await redis.hgetall(Team.K.wn(PID, t.id)))).map(parse).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt);
  const ppl = await people(redis, ctx);
  const byUid = {}; Object.keys(ppl).forEach(k => { byUid[ppl[k].uid] = k; });
  const meta = Team.asObject(await redis.hgetall(K.gw(t.id)));
  const out = { axes: AXES, emoji: EMOJI, phrases: PHRASES, people: {}, wines: {} };
  Object.keys(ppl).forEach(k => { out.people[k] = { name: ppl[k].name, pic: ppl[k].pic, me: ppl[k].me }; });
  const members = Object.keys(ppl).length;
  for (let i = 0; i < wines.length; i++) {
    const w = wines[i], m = parse(meta[w.id]) || {};
    const [gpRaw, voters, gxRaw] = await Promise.all([redis.hgetall(K.gp(t.id, w.id)), redis.smembers(Team.K.vs(PID, t.id, w.id)), redis.hgetall(K.gx(t.id, w.id))]);
    const gp = Team.asObject(gpRaw), entries = {};
    Object.keys(gp).forEach(u => { const e = parse(gp[u]); if (e) entries[u] = e; });
    const voterList = (voters || []).map(String);
    const revealed = !!m.revealed || t.status === "closed" || !!w.closed || (members > 0 && voterList.filter(u => byUid[u]).length >= members);
    const wout = { axes: i % AXES.length, revealed, manual: !!m.revealed, played: Object.keys(entries).map(u => byUid[u]).filter(Boolean), voted: voterList.map(u => byUid[u]).filter(Boolean),
      mine: entries[ctx.uid] ? { x: entries[ctx.uid].x, y: entries[ctx.uid].y, p: entries[ctx.uid].p, e: entries[ctx.uid].e } : null,
      price: (revealed || ctx.role === "organizer") && m.price ? m.price : null };
    if (revealed) {
      const vraw = voterList.length ? await redis.mget(...voterList.map(u => Team.K.vt(PID, t.id, w.id, u))) : [];
      const votes = {}; voterList.forEach((u, j) => { const v = parse(vraw[j]); if (v && typeof v.s === "number") votes[u] = v.s; });
      const sc = score(entries, votes, m.price || null);
      const gx = Team.asObject(gxRaw), reacts = {};
      Object.keys(gx).forEach(k => { const [from, to] = k.split("|"); const r = parse(gx[k]); if (r && byUid[to] !== undefined) (reacts[to] = reacts[to] || []).push({ from: byUid[from] || null, e: r.e || "", f: r.f || "" }); });
      wout.avg = sc.avg == null ? null : r1(sc.avg);
      wout.center = sc.center ? { x: r1(sc.center.x), y: r1(sc.center.y) } : null;
      wout.results = Object.keys(sc.res).filter(u => byUid[u]).map(u => {
        const r = sc.res[u];
        return { who: byUid[u], vote: r.vote, x: r.e.x != null ? r.e.x : null, y: r.e.y != null ? r.e.y : null, p: r.e.p != null ? r.e.p : null, e: r.e.e != null ? r.e.e : null,
          pts: r.pts, badges: sc.badges[u] || [], reactions: reacts[u] || [] };
      }).sort((a, b) => b.pts.total - a.pts.total);
    }
    out.wines[w.id] = wout;
  }
  return out;
}

function num(v, min, max, dec) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  if (!isFinite(n) || n < min || n > max) return undefined;
  return Math.round(n * Math.pow(10, dec)) / Math.pow(10, dec);
}

/* le mosse di chi gioca: posizione sul campo, pronostico, prezzo (si possono cambiare fino allo svelamento) */
async function play(redis, partner, ctx, body) {
  requireGame(partner, ctx);
  const { t, w } = await wineOf(redis, ctx, body.tasting, body.wine);
  if (t.status !== "open" || w.closed) throw new HttpError(409, "closed", "Questo vino è chiuso: il gioco è finito.");
  const m = parse(await redis.hget(K.gw(t.id), w.id)) || {};
  if (await isRevealed(redis, ctx, t, w, m)) throw new HttpError(409, "revealed", "Questo vino è già svelato.");
  const x = num(body.x, 0, 10, 1), y = num(body.y, 0, 10, 1), p = num(body.p, 50, 100, 0), e = num(body.e, 0, 10000, 2);
  if ([x, y, p, e].some(v => v === undefined) || (x == null) !== (y == null)) throw bad("invalid_move", "Mossa non valida.");
  if (x == null && p == null && e == null) throw bad("invalid_move", "Metti la tua faccia sul campo, oppure fai un pronostico.");
  await redis.hset(K.gp(t.id, w.id), { [ctx.uid]: JSON.stringify({ x, y, p, e, at: Date.now() }) });
  await redis.del(K.gb(ctx.team));
  return { ok: true };
}

/* reazioni e frecciatine, solo dopo lo svelamento e mai a sé stessi */
async function react(redis, partner, ctx, body) {
  requireGame(partner, ctx);
  const st = await state(redis, partner, ctx, { tasting: body.tasting });
  const wst = st.wines[body.wine];
  if (!wst) throw new HttpError(404, "not_found", "Vino non trovato.");
  if (!wst.revealed) throw new HttpError(409, "not_revealed", "Le reazioni si lasciano dopo lo svelamento.");
  const ppl = await people(redis, ctx);
  const to = ppl[body.to];
  if (!to || to.uid === ctx.uid) throw bad("invalid_target", "Persona non valida.");
  const e = body.e === "" || body.e == null ? "" : (EMOJI.indexOf(body.e) > -1 ? body.e : null);
  const f = body.f === "" || body.f == null ? "" : (/^f([1-9]|10)$/.test(String(body.f)) ? String(body.f) : null);
  if (e === null || f === null) throw bad("invalid_reaction", "Reazione non valida.");
  const key = ctx.uid + "|" + to.uid;
  if (!e && !f) await redis.hdel(K.gx(body.tasting, body.wine), key);
  else await redis.hset(K.gx(body.tasting, body.wine), { [key]: JSON.stringify({ e, f }) });
  return { ok: true };
}

/* l'organizzatore svela un vino (anche se non hanno votato tutti) */
async function reveal(redis, partner, ctx, body) {
  requireGame(partner, ctx);
  if (ctx.role !== "organizer") throw new HttpError(403, "forbidden", "Solo chi organizza può svelare.");
  const { t, w } = await wineOf(redis, ctx, body.tasting, body.wine);
  const m = parse(await redis.hget(K.gw(t.id), w.id)) || {};
  m.revealed = true;
  await redis.hset(K.gw(t.id), { [w.id]: JSON.stringify(m) });
  await redis.del(K.gb(ctx.team));
  return { ok: true };
}

/* il prezzo vero, per il gioco «quanto costa» (lo scrive l'organizzatore; si vede dopo lo svelamento) */
async function setPrice(redis, partner, ctx, body) {
  requireGame(partner, ctx);
  if (ctx.role !== "organizer") throw new HttpError(403, "forbidden", "Solo chi organizza scrive il prezzo.");
  const { t, w } = await wineOf(redis, ctx, body.tasting, body.wine);
  const price = num(body.price, 0.5, 10000, 2);
  if (price === undefined) throw bad("invalid_price", "Prezzo non valido.");
  const m = parse(await redis.hget(K.gw(t.id), w.id)) || {};
  if (price == null) delete m.price; else m.price = price;
  await redis.hset(K.gw(t.id), { [w.id]: JSON.stringify(m) });
  await redis.del(K.gb(ctx.team));
  return { ok: true, price: m.price || null };
}

/* la classifica della stagione (ultime serate): punti e soprannomi bonari, calcolati dai voti e dalle mosse */
async function board(redis, partner, ctx) {
  requireGame(partner, ctx);
  const cached = parse(await redis.get(K.gb(ctx.team)));
  const ppl = await people(redis, ctx);
  let base = cached;
  if (!base) {
    const tl = Object.values(Team.asObject(await redis.hgetall(Team.K.tl(PID, ctx.team)))).map(parse).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt).slice(0, BOARD_TASTINGS);
    const pts = {}, diffs = {}, votesBy = {}, wins = {};
    for (const t of tl) {
      const st = await state(redis, partner, Object.assign({}, ctx, { role: "member" }), { tasting: t.id });
      Object.keys(st.wines).forEach(wid => {
        const w = st.wines[wid];
        if (!w.revealed || !w.results) return;
        const vs = w.results.filter(r => r.vote != null);
        w.results.forEach(r => {
          const p = pts[r.who] = pts[r.who] || { total: 0, pron: 0, price: 0, field: 0, played: 0 };
          p.total += r.pts.total; p.pron += r.pts.pron || 0; p.price += r.pts.price || 0; p.field += r.pts.field || 0; if (r.x != null || r.p != null || r.e != null) p.played++;
          (r.badges || []).forEach(b => { (wins[r.who] = wins[r.who] || {})[b] = ((wins[r.who] || {})[b] || 0) + 1; });
          if (r.vote != null && vs.length >= 2 && w.avg != null) {
            (diffs[r.who] = diffs[r.who] || []).push(r.vote - w.avg);
            (votesBy[r.who] = votesBy[r.who] || {})[t.id + ":" + wid] = r.vote;
          }
        });
      });
    }
    base = { pts, diffs, votesBy, wins };
    await redis.set(K.gb(ctx.team), JSON.stringify(base), { ex: BOARD_TTL });
  }
  /* soprannomi: dal palato (scarti dalla media del gruppo) e dai cartellini vinti */
  const nick = {};
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  Object.keys(base.diffs).forEach(k => {
    const d = base.diffs[k]; if (d.length < 2) return;
    const m = mean(d), abs = mean(d.map(Math.abs));
    if (m >= 3) (nick[k] = nick[k] || []).push("generoso");
    else if (m <= -3) (nick[k] = nick[k] || []).push("spietato");
    if (abs >= 6) (nick[k] = nick[k] || []).push("bastian");
  });
  Object.keys(base.wins || {}).forEach(k => { const w = base.wins[k]; if ((w.prezzo || 0) + (w.pronostico || 0) >= 2) (nick[k] = nick[k] || []).push("naso"); });
  /* il gemello: chi ha votato più vicino a te, su almeno due vini in comune */
  const twins = {};
  const keys = Object.keys(base.votesBy);
  keys.forEach(a => {
    let best = null, bd = null;
    keys.forEach(b => {
      if (a === b) return;
      const common = Object.keys(base.votesBy[a]).filter(x => base.votesBy[b][x] != null);
      if (common.length < 2) return;
      const d = mean(common.map(x => Math.abs(base.votesBy[a][x] - base.votesBy[b][x])));
      if (bd == null || d < bd) { bd = d; best = b; }
    });
    if (best && bd <= 3) twins[a] = best;
  });
  const rows = Object.keys(ppl).map(k => ({ who: k, name: ppl[k].name, pic: ppl[k].pic, me: ppl[k].me, pts: base.pts[k] || { total: 0, pron: 0, price: 0, field: 0, played: 0 }, nick: nick[k] || [], wins: (base.wins || {})[k] || {}, twin: twins[k] && ppl[twins[k]] ? ppl[twins[k]].name : "" }))
    .sort((a, b) => b.pts.total - a.pts.total || a.name.localeCompare(b.name, "it"));
  return { rows };
}

/* per i widget dei siti (api/widget.js): il gioco della cerchia in numeri, senza nomi; la classifica con i
   nomi solo se Proprietario o amministratori l'hanno accesa per il widget (names). In cache due minuti. */
async function widgetStats(redis, cid, names) {
  const cached = parse(await redis.get(K.gq(cid)));
  let base = cached;
  if (!base) {
    const ctx = { team: cid, uid: "", role: "member", game: true };
    const partner = { id: PID };
    const tl = Object.values(Team.asObject(await redis.hgetall(Team.K.tl(PID, cid)))).map(parse).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt).slice(0, BOARD_TASTINGS);
    let moves = 0, wines = 0, pron = 0, pronHit = 0, priceN = 0, priceErr = 0, biasN = 0, bias = 0;
    const comp = AXES.map(() => ({ x: 0, y: 0, n: 0 }));
    let split = null, tight = null, surprise = null, last = null;
    for (const t of tl) {
      const st = await state(redis, partner, ctx, { tasting: t.id });
      const wl = Object.values(Team.asObject(await redis.hgetall(Team.K.wn(PID, t.id)))).map(parse).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
      const hide = !!t.blind && !t.revealed;
      wl.forEach(wn => {
        const w = st.wines[wn.id];
        if (!w || !w.revealed || !w.results) return;
        const res = w.results.filter(r => r.x != null || r.p != null || r.e != null);
        if (!res.length) return;
        const label = { name: hide ? "" : wn.name || "", producer: hide ? "" : wn.producer || "", tastingName: t.name, at: t.createdAt };
        wines++; moves += res.length;
        const guesses = [];
        res.forEach(r => {
          if (r.p != null && w.avg != null) { pron++; if (Math.abs(r.p - w.avg) <= 2) pronHit++; biasN++; bias += r.p - w.avg; }
          if (r.e != null && w.price) { priceN++; priceErr += Math.min(1, Math.abs(r.e - w.price) / w.price); guesses.push(r.e); }
        });
        /* il prezzo che vi ha spiazzato: la media delle ipotesi più lontana dal prezzo vero (almeno due ipotesi) */
        if (guesses.length >= 2) {
          const g = guesses.reduce((a, b) => a + b, 0) / guesses.length, gap = Math.abs(g - w.price) / w.price;
          if (gap >= 0.25 && (!surprise || gap > surprise.gap)) surprise = Object.assign({ guess: r0(g), price: w.price, gap: r1(gap), n: guesses.length }, label);
        }
        if (w.center) { const c = comp[w.axes]; c.x += w.center.x; c.y += w.center.y; c.n++; }
        const pos = res.filter(r => r.x != null);
        if (pos.length >= 3 && w.center) {
          const d = pos.reduce((a, r) => a + Math.hypot(r.x - w.center.x, r.y - w.center.y), 0) / pos.length;
          const row = Object.assign({ spread: r1(d), players: pos.length, axes: w.axes }, label);
          if (!split || d > split.spread) split = row;
          if (!tight || d < tight.spread) tight = row;
        }
        /* il campo dell'ultimo vino svelato con almeno due facce (le serate sono in ordine dalla più recente) */
        if (!last && pos.length >= 2) {
          last = Object.assign({ axes: w.axes, avg: w.avg, center: w.center,
            dots: pos.slice(0, 40).map(r => ({ who: r.who, x: r.x, y: r.y, initials: initials((st.people[r.who] || {}).name), vote: r.vote })) }, label);
        }
      });
    }
    base = { moves, wines, pron, pronHit, priceN, priceErr: priceN ? r1(100 * priceErr / priceN) : null, bias: biasN >= 3 ? r1(bias / biasN) : null,
      compass: comp.map((c, i) => c.n ? { axes: i, x: r1(c.x / c.n), y: r1(c.y / c.n), wines: c.n } : null).filter(Boolean),
      split, tight: tight && split && tight.spread < split.spread ? tight : null, surprise, last };
    await redis.set(K.gq(cid), JSON.stringify(base), { ex: BOARD_TTL });
  }
  const out = Object.assign({}, base, { pronRate: base.pron ? r0(100 * base.pronHit / base.pron) : null });
  /* senza il permesso dei nomi: le facce del campo restano punti anonimi */
  if (out.last) out.last = Object.assign({}, out.last, { dots: out.last.dots.map(d => names ? { x: d.x, y: d.y, initials: d.initials } : { x: d.x, y: d.y }) });
  if (names) {
    const b = await board(redis, { id: PID }, { team: cid, uid: "", role: "member", game: true });
    const rows = b.rows.filter(r => r.pts.played > 0);
    out.board = rows.slice(0, 10).map(r => ({ name: r.name, initials: initials(r.name), total: r.pts.total, played: r.pts.played, nick: r.nick, twin: r.twin }));
    /* i premi della stagione: a chi ha fatto più punti in ciascuna specialità (almeno 2 vini giocati) */
    const award = (key, fn) => { let best = null; rows.forEach(r => { if (r.pts.played < 2) return; const v = fn(r); if (v > 0 && (!best || v > best.v)) best = { name: r.name, initials: initials(r.name), v }; }); return best ? { key, name: best.name, initials: best.initials, value: best.v } : null; };
    out.awards = [
      award("pron", r => r.pts.pron), award("price", r => r.pts.price), award("field", r => r.pts.field),
      award("fuori", r => (r.wins || {}).fuori || 0), award("sintonia", r => (r.wins || {}).sintonia || 0), award("played", r => r.pts.played)
    ].filter(Boolean);
    const seen = new Set();
    out.twins = rows.filter(r => r.twin).map(r => [r.name, r.twin].sort()).filter(p => { const k = p.join("|"); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3);
  }
  return out;
}
function initials(name) {
  const p = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

/* «Cancella i miei voti»: anche le mosse del gioco e le reazioni date o ricevute in questa cerchia */
async function deleteUser(redis, cid, uid) {
  const tids = Object.keys(Team.asObject(await redis.hgetall(Team.K.tl(PID, cid))));
  let n = 0;
  for (const t of tids) {
    const wids = Object.keys(Team.asObject(await redis.hgetall(Team.K.wn(PID, t))));
    for (const w of wids) {
      n += Number(await redis.hdel(K.gp(t, w), uid)) || 0;
      const gx = Team.asObject(await redis.hgetall(K.gx(t, w)));
      const mine = Object.keys(gx).filter(k => k.split("|").indexOf(uid) > -1);
      if (mine.length) await redis.hdel(K.gx(t, w), ...mine);
    }
  }
  await redis.del(K.gb(cid));
  return n;
}

const OPS = { "game.state": state, "game.play": play, "game.react": react, "game.reveal": reveal, "game.price": setPrice, "game.board": board };
const WRITES = new Set(["game.play", "game.react", "game.reveal", "game.price"]);

module.exports = { OPS, WRITES, AXES, EMOJI, K, score, pk, deleteUser, widgetStats };
