const crypto = require("crypto");
const { HttpError, cleanText } = require("./_http");
const limit = require("./_limit");
const WineMatch = require("../public/js/wine-match.js");
const LabelReader = require("../public/js/label-reader.js");

/* Catalogo Taste: i vini confermati da chi li ha assaggiati, per riconoscerli la volta dopo.
   Si salvano solo i dati del vino (nome, produttore, denominazione, tipologia, vitigni, annate,
   codici a barre): niente voti, niente note, niente nomi. Chi conferma è un'impronta anonima.

   Regole:
   - un vino appena confermato serve solo a chi l'ha inserito; diventa di tutti quando lo hanno
     confermato almeno PUBLIC_AT persone diverse (con dati uguali o quasi: si uniscono a somiglianza);
   - con HIDE_AT segnalazioni di persone diverse la voce sparisce dalla ricerca;
   - il codice a barre si cerca prima nel catalogo, poi su Open Food Facts (banca dati libera, ODbL).

   Redis:
     cat:idx          hash  id → {n,p,d,s}   (s: "p" di tutti, "h" nascosto, altrimenti l'impronta di chi l'ha inserito)
     cat:w:<id>       la voce completa
     cat:ean:<codice> id della voce con quel codice a barre
     off:<codice>     risposta di Open Food Facts già ripulita (30 giorni; 3 se non trovato) */

const PUBLIC_AT = 2, HIDE_AT = 2;
const TYPES = ["Rosso", "Bianco", "Rosato", "Spumante", "Passito"];
const K = { idx: "cat:idx", w: id => "cat:w:" + id, ean: e => "cat:ean:" + e, off: e => "off:" + e };
const OFF_TTL = 30 * 86400, OFF_MISS_TTL = 3 * 86400;
const UA = "Taste/2.11 (https://sorso-taccuino.vercel.app)";

function parse(raw) { if (raw == null) return null; if (typeof raw === "object") return raw; try { return JSON.parse(raw); } catch (e) { return null; } }
/* hgetall torna come elenco piatto [campo, valore, …] (client senza deserializzazione) oppure come oggetto */
function asObject(h) {
  const out = Object.create(null);
  if (Array.isArray(h)) { for (let i = 0; i + 1 < h.length; i += 2) out[String(h[i])] = h[i + 1]; }
  else if (h && typeof h === "object") Object.keys(h).forEach(k => { out[k] = h[k]; });
  return out;
}
function who(username) { return crypto.createHash("sha256").update("sorso-cat|" + username).digest("hex").slice(0, 16); }

/* codice a barre EAN-8, UPC-A (12), EAN-13 o GTIN-14 con la cifra di controllo giusta */
function cleanEan(v) {
  const s = String(v == null ? "" : v).replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(s.length)) return "";
  const d = s.split("").map(Number), check = d.pop();
  let sum = 0;
  d.reverse().forEach((x, i) => { sum += x * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check ? s : "";
}

function cleanWine(w) {
  w = w && typeof w === "object" ? w : {};
  const year = new Date().getUTCFullYear();
  const annata = /^\d{4}$/.test(String(w.annata || "")) && +w.annata >= 1900 && +w.annata <= year + 1 ? String(w.annata) : "";
  const vitigni = (Array.isArray(w.vitigni) ? w.vitigni : String(w.vitigni || "").split(/[,;]+/)).map(x => cleanText(typeof x === "string" ? x : "", 40)).filter(Boolean).slice(0, 8);
  return {
    nome: cleanText(w.nome, 90), produttore: cleanText(w.produttore, 90), denominazione: cleanText(w.denominazione, 90),
    tipologia: TYPES.includes(w.tipologia) ? w.tipologia : "", vitigni, annata
  };
}

/* ---- l'indice, tenuto anche in memoria per un minuto: la ricerca costa un comando ogni tanto, non a ogni foto ---- */
let cache = null;
function resetCache() { cache = null; }
async function loadIndex(redis) {
  if (cache && Date.now() - cache.at < 60000) return cache.list;
  const raw = asObject(await redis.hgetall(K.idx));
  const list = Object.keys(raw).map(id => { const v = parse(raw[id]) || {}; return { id, nome: v.n || "", produttore: v.p || "", denominazione: v.d || "", s: v.s || "", eans: [] }; });
  cache = { at: Date.now(), list };
  return list;
}
async function saveEntry(redis, e) {
  await redis.multi()
    .set(K.w(e.id), JSON.stringify(e))
    .hset(K.idx, { [e.id]: JSON.stringify({ n: e.nome, p: e.produttore, d: e.denominazione, s: e.state }) })
    .exec();
  resetCache();
}
const visible = (e, me) => e.s === "p" || e.state === "p" || (me && (e.s === me || e.state === me));

function view(e, score, me) {
  const annate = Object.keys(e.annate || {}).sort().reverse();
  return { source: "sorso", id: e.id, nome: e.nome, produttore: e.produttore, denominazione: e.denominazione || "", tipologia: e.tipologia || "",
    vitigni: e.vitigni || [], annate, score: Math.round(score * 100) / 100, mine: !!(me && e.state === me), pending: e.state !== "p" };
}

/* ---- Open Food Facts: il codice a barre ---- */
let fetcher = (...a) => fetch(...a);
function setFetch(fn) { fetcher = fn || ((...a) => fetch(...a)); }

function offTipologia(tags) {
  const t = tags.join(" ");
  if (/sparkling|champagne|prosecco|cava|cremant|spumant/.test(t)) return "Spumante";
  if (/rose-wine|rosé|rosato|rose-wines/.test(t)) return "Rosato";
  if (/white-wine|vins-blancs|vini-bianchi/.test(t)) return "Bianco";
  if (/dessert-wine|sweet-wine|passito|fortified/.test(t)) return "Passito";
  if (/red-wine|vins-rouges|vini-rossi/.test(t)) return "Rosso";
  return "";
}
function offClean(p) {
  const tags = (Array.isArray(p.categories_tags) ? p.categories_tags : []).map(String);
  const nomeRaw = cleanText(p.product_name_it || p.product_name || p.generic_name_it || "", 120);
  const parsed = LabelReader.toWineFields(LabelReader.parseLabel(nomeRaw, [], new Date().getUTCFullYear()));
  /* molte schede non hanno categorie: allora basta che il nome sia quello di un vino (una denominazione, un vitigno, «vino») */
  const isWine = tags.length ? tags.some(t => /wine|vin|vino|champagne|prosecco/.test(t)) : !!(parsed.denominazione || (parsed.vitigni && parsed.vitigni.length) || /\b(vino|wine|vin)\b/i.test(nomeRaw));
  if (!isWine) return { found: false, reason: "not_wine" };
  /* tutto minuscolo o tutto maiuscolo (schede scritte di fretta): iniziali maiuscole */
  const tidy = x => x && (x === x.toLowerCase() || x === x.toUpperCase()) ? x.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, c) => a + c.toUpperCase()).replace(/\b(Di|Del|Della|Delle|Dei|E|D)\b/g, w => w.toLowerCase()) : x;
  const produttore = tidy(cleanText(String(p.brands || "").split(",")[0], 90) || parsed.produttore || "");
  /* il nome spesso ripete la marca e l'annata: «Ruffino Rosso di Marte 2022» → «Rosso di Marte» */
  let nome = nomeRaw;
  if (produttore) {
    const pr = produttore.toLowerCase();
    if (nome.toLowerCase().startsWith(pr + " ")) nome = nome.slice(produttore.length).trim();
    else if (nome.toLowerCase().endsWith(" " + pr)) nome = nome.slice(0, -produttore.length).trim();
  }
  if (parsed.annata) nome = nome.replace(new RegExp("\\s*\\b" + parsed.annata + "\\b\\s*"), " ").trim();
  if (produttore && !p.brands) nome = nome.replace(new RegExp("\\s*\\b" + produttore.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b\\s*", "i"), " ").trim();
  /* e la denominazione, che ha già il suo campo: «Rosso di Marte Morellino di Scansano» → «Rosso di Marte» (ma «Chianti Classico» resta) */
  const den = String(parsed.denominazione || "").replace(/\s+(DOCG|DOC|IGT|IGP|DOP)$/i, "");
  if (den) {
    const cut = nome.replace(new RegExp("\\s*\\b" + den.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]?\\s?") + "\\b(\\s+(DOCG|DOC|IGT|IGP|DOP)\\b)?\\s*", "i"), " ").trim();
    if (cut.length >= 3 && !/^((superiore|classico|riserva|gran|selezione|rosso|bianco|rosato)\s*)+$/i.test(cut)) nome = cut.replace(/^(superiore|classico|riserva)\s+(?=\S.{2,})/i, "");
  }
  nome = tidy(nome);
  if (!nome && !produttore) return { found: false, reason: "empty" };
  return { found: true, source: "off", nome: cleanText(nome, 90), produttore, denominazione: parsed.denominazione || "",
    tipologia: offTipologia(tags) || parsed.tipologia || "", vitigni: parsed.vitigni || [], annata: parsed.annata || "" };
}
async function offLookup(redis, ean) {
  const cached = parse(await redis.get(K.off(ean)));
  if (cached) return cached;
  let out;
  try {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 4000);
    const r = await fetcher("https://world.openfoodfacts.org/api/v2/product/" + ean + ".json?fields=product_name,product_name_it,generic_name_it,brands,categories_tags",
      { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctl.signal });
    clearTimeout(timer);
    if (r.status === 404) out = { found: false, reason: "unknown" };
    else if (!r.ok) return { found: false, reason: "unavailable" };       // non si mette in memoria: si riprova la volta dopo
    else { const j = await r.json(); out = j && j.status === 1 && j.product ? offClean(j.product) : { found: false, reason: "unknown" }; }
  } catch (e) { return { found: false, reason: "unavailable" }; }
  await redis.set(K.off(ean), JSON.stringify(out), { ex: out.found ? OFF_TTL : OFF_MISS_TTL });
  return out;
}

/* ---- operazioni ---- */

/* ricerca: dati letti dall'etichetta (campi + testo) e, se c'è, il codice a barre */
async function search(redis, username, body) {
  const me = username ? who(username) : "";
  const q = body.q && typeof body.q === "object" ? body.q : {};
  const query = { nome: cleanText(q.nome, 90), produttore: cleanText(q.produttore, 90), denominazione: cleanText(q.denominazione, 90),
    annata: /^\d{4}$/.test(String(q.annata || "")) ? String(q.annata) : "", text: typeof q.text === "string" ? q.text.slice(0, 2000) : "" };
  const ean = cleanEan(body.ean);
  if (body.ean && !ean) throw new HttpError(400, "bad_ean", "Codice a barre non valido: controlla le cifre.");
  const out = { results: [], strong: false, off: null };
  if (ean) {
    const id = await redis.get(K.ean(ean));
    const e = id ? parse(await redis.get(K.w(String(id)))) : null;
    if (e && visible(e, me)) { out.results = [view(e, 1, me)]; out.strong = true; return out; }
    out.off = await offLookup(redis, ean);
    if (out.off.found) { out.off.ean = ean; return out; }
  }
  if (!query.nome && !query.produttore && !query.text) return out;
  const list = (await loadIndex(redis)).filter(e => e.s !== "h" && visible(e, me));
  const r = WineMatch.rank(list, query, { max: 3 });
  if (!r.list.length) return out;
  const full = await redis.mget(...r.list.map(x => K.w(x.wine.id)));
  out.results = r.list.map((x, i) => { const e = parse(full[i]); return e ? view(e, x.score, me) : null; }).filter(Boolean);
  out.strong = !!r.strong && out.results.length > 0 && out.results[0].id === r.strong.wine.id;
  return out;
}

/* conferma: chi salva una degustazione con nome e produttore aggiunge il vino (o un'altra persona a un vino già noto) */
async function confirm(redis, username, body) {
  const me = who(username);
  const w = cleanWine(body.wine);
  if (w.nome.length < 2 || w.produttore.length < 2) throw new HttpError(400, "incomplete", "Servono almeno nome e produttore.");
  const ean = cleanEan(body.ean);
  const rl = await limit.hit(redis, "catc:" + me, 300, 86400);
  if (!rl.ok) throw new HttpError(429, "rate_limited", "Troppe conferme oggi: riprova domani.");
  /* lo stesso vino c'è già? prima per codice a barre, poi a somiglianza (le voci nascoste non contano) */
  let e = null;
  if (ean) { const id = await redis.get(K.ean(ean)); if (id) e = parse(await redis.get(K.w(String(id)))); if (e && e.state === "h") e = null; }
  if (!e) {
    /* anche le voci in attesa di altri: è così che una seconda persona rende un vino di tutti */
    const list = (await loadIndex(redis)).filter(x => x.s !== "h");
    const same = list.find(x => WineMatch.sameWine(x, w));
    if (same) e = parse(await redis.get(K.w(same.id)));
  }
  const now = Date.now();
  let created = false;
  if (!e) {
    created = true;
    e = { id: crypto.randomBytes(5).toString("hex"), nome: w.nome, produttore: w.produttore, denominazione: w.denominazione, tipologia: w.tipologia,
      vitigni: w.vitigni, annate: {}, eans: [], by: [me], rep: [], state: me, created: now };
  } else {
    if (!e.by.includes(me) && e.by.length < 50) e.by.push(me);
    /* i dati già presenti non si sovrascrivono: si completano solo quelli che mancano */
    if (!e.denominazione && w.denominazione) e.denominazione = w.denominazione;
    if (!e.tipologia && w.tipologia) e.tipologia = w.tipologia;
    if ((!e.vitigni || !e.vitigni.length) && w.vitigni.length) e.vitigni = w.vitigni;
    if (e.state !== "p" && e.by.length >= PUBLIC_AT) e.state = "p";
  }
  if (w.annata) { e.annate = e.annate || {}; if (e.annate[w.annata] || Object.keys(e.annate).length < 60) e.annate[w.annata] = (e.annate[w.annata] || 0) + 1; }
  if (ean && !e.eans.includes(ean) && e.eans.length < 5) {
    const ok = await redis.set(K.ean(ean), e.id, { nx: true });
    if (ok) e.eans.push(ean);
  }
  e.updated = now;
  await saveEntry(redis, e);
  return { ok: true, id: e.id, created, public: e.state === "p", confirmations: e.by.length };
}

/* segnalazione di dati sbagliati: con HIDE_AT persone diverse la voce sparisce (chi l'ha inserita la toglie subito) */
async function report(redis, username, body) {
  const me = who(username);
  const id = typeof body.id === "string" && /^[0-9a-f]{10}$/.test(body.id) ? body.id : "";
  const e = id ? parse(await redis.get(K.w(id))) : null;
  if (!e || e.state === "h" || !visible(e, me)) throw new HttpError(404, "not_found", "Vino non trovato nel catalogo.");
  const rl = await limit.hit(redis, "catr:" + me, 30, 86400);
  if (!rl.ok) throw new HttpError(429, "rate_limited", "Troppe segnalazioni oggi.");
  e.rep = e.rep || [];
  if (!e.rep.includes(me)) e.rep.push(me);
  if (e.rep.length >= HIDE_AT || (e.state === me && e.by.length === 1)) e.state = "h";
  await saveEntry(redis, e);
  return { ok: true, hidden: e.state === "h" };
}

const OPS = { search, confirm, report };
const WRITES = new Set(["confirm", "report"]);
const NEEDS_LOGIN = new Set(["confirm", "report"]);

module.exports = { OPS, WRITES, NEEDS_LOGIN, cleanEan, cleanWine, offClean, offLookup, setFetch, resetCache, who, K, PUBLIC_AT, HIDE_AT };
