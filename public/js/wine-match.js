/* Riconoscere un vino già conosciuto: confronta quello che si è letto sull'etichetta (campi e testo)
   con un elenco di vini (il Taccuino, il catalogo Sorso). Funzione pura, la usano il browser e il server.
   Il testo letto è imperfetto: le parole si confrontano «a somiglianza», come nella lettura dell'etichetta. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WineMatch = factory();
})(typeof self !== "undefined" ? self : this, function () {

/* soglie: sopra STRONG si propone un solo vino («È questo?»), tra WEAK e STRONG due o tre («Forse è uno di questi?») */
const STRONG = 0.85, WEAK = 0.6;

const norm = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[’'`´]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
/* parole che non distinguono un vino da un altro: contano poco */
const FILLER = new Set(["di","del","della","delle","dei","degli","d","da","e","la","le","il","lo","i","gli","in","l","dell","dall","az","azienda","agricola","agr","cantina","cantine","tenuta","tenute","fattoria","podere","vini","vino","winery","societa","soc","srl","spa","ss","sas","s","a","the","de","du","des","et"]);
const GENERIC = new Set(["rosso","bianco","rosato","riserva","superiore","classico","doc","docg","igt","igp","dop","selezione","gran","vigna","vigneto","vigneti","spumante","brut","frizzante","extra","dry","metodo","millesimato","passito","toscana","sicilia","veneto","puglia","italia"]);

function tokens(s){ return norm(s).split(" ").filter(t => t && !FILLER.has(t)); }
/* nel testo letto le cifre in mezzo alle lettere sono lettere lette male («GIOVES0NE») */
function ocrFix(w){
  const letters = (w.match(/[a-z]/g) || []).length, digits = (w.match(/[0-9]/g) || []).length;
  return letters && digits && letters >= digits * 2 ? w.replace(/0/g, "o").replace(/1/g, "i").replace(/5/g, "s").replace(/8/g, "b").replace(/4/g, "a") : w;
}

function lev(a, b, cap){
  if(a === b) return 0;
  const m = a.length, n = b.length; if(!m) return n; if(!n) return m;
  if(Math.abs(m - n) > cap) return cap + 1;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for(let j = 0; j <= n; j++) prev[j] = j;
  for(let i = 1; i <= m; i++){
    cur[0] = i; let low = i;
    for(let j = 1; j <= n; j++){ cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if(cur[j] < low) low = cur[j]; }
    if(low > cap) return cap + 1;
    const t = prev; prev = cur; cur = t;
  }
  return prev[n];
}
/* somiglianza di due parole, 0..1. Le parole corte (fino a 3 lettere) valgono solo se uguali. */
function wordSim(a, b){
  if(a === b) return 1;
  if(a.length <= 3 || b.length <= 3) return 0;
  const L = Math.max(a.length, b.length), cap = Math.floor(L * 0.4);
  const d = lev(a, b, cap);
  return d > cap ? 0 : 1 - d / L;
}

/* L'insieme delle parole lette: tutte le parole dei campi e del testo, più le coppie vicine unite
   (l'OCR spezza: «SAGRAN TINO»). Si prepara una volta e si confronta con tutto l'elenco. */
function pool(q){
  q = q || {};
  const lines = [q.nome, q.produttore, q.denominazione, q.text].filter(Boolean).map(String);
  const set = new Set();
  lines.forEach(l => String(l).split(/\n+/).forEach(row => {
    const t = tokens(row).map(ocrFix);
    t.forEach((w, i) => { set.add(w); if(i + 1 < t.length && w.length + t[i + 1].length <= 16) set.add(w + t[i + 1]); });
  }));
  const words = [...set].slice(0, 400);
  const grams = new Set();
  words.forEach(w => { for(let i = 0; i + 3 <= w.length; i++) grams.add(w.slice(i, i + 3)); });
  return { words, set, grams, denom: new Set(tokens(q.denominazione)), annata: /^\d{4}$/.test(String(q.annata || "")) ? String(q.annata) : "", ean: String(q.ean || "").replace(/\D/g, "") };
}

/* quanto un campo del vino (nome o produttore) si ritrova tra le parole lette: 0..1, null se il campo è vuoto */
function fieldIn(field, P){
  const t = tokens(field);
  if(!t.length) return null;
  let got = 0, tot = 0;
  for(const w of t){
    const weight = (GENERIC.has(w) ? 0.35 : 1) * Math.min(1, 0.4 + w.length / 8);
    tot += weight;
    if(P.set.has(w)){ got += weight; continue; }
    /* filtro veloce: senza un pezzo di tre lettere in comune non serve confrontare */
    let shared = 0;
    for(let i = 0; i + 3 <= w.length; i++) if(P.grams.has(w.slice(i, i + 3))) shared++;
    if(w.length > 3 && shared === 0) continue;
    let best = 0;
    for(const p of P.words){ const s = wordSim(w, p); if(s > best){ best = s; if(best === 1) break; } }
    got += weight * (best >= 0.7 ? best : 0);
  }
  return tot ? got / tot : null;
}

/* il punteggio di un vino dell'elenco rispetto a quello letto: 0..1 */
function score(wine, P){
  if(!wine) return 0;
  if(P.ean && Array.isArray(wine.eans) && wine.eans.indexOf(P.ean) > -1) return 1;
  const n = fieldIn(wine.nome, P), p = fieldIn(wine.produttore, P);
  let s;
  if(n != null && p != null) s = 0.55 * n + 0.45 * p;
  else if(n != null) s = 0.8 * n;
  else if(p != null) s = 0.6 * p;
  else return 0;
  /* il produttore non si legge (è in piccolo, o sul retro) ma il nome sì, ed è un nome proprio: almeno «forse» */
  if(n != null && n >= 0.85 && tokens(wine.nome).some(w => w.length >= 5 && !GENERIC.has(w) && !P.denom.has(w))) s = Math.max(s, 0.75 * n);
  /* un nome fatto solo di parole comuni («Rosso», «Riserva») non basta a riconoscere un vino */
  const distinct = tokens(wine.nome).concat(tokens(wine.produttore)).some(w => !GENERIC.has(w) && w.length > 3);
  if(!distinct) s *= 0.7;
  if(wine.denominazione){
    const d = fieldIn(wine.denominazione, P);
    if(d != null && d < 0.5) s *= 0.9;
  }
  return Math.max(0, Math.min(1, s));
}

/* l'identità di un vino, senza annata: due voci con la stessa chiave sono lo stesso vino */
function identity(w){ return tokens(w && w.nome).join(" ") + "|" + tokens(w && w.produttore).join(" "); }

/* ordina l'elenco; restituisce {strong, list}: strong è il vino da proporre da solo, se c'è */
function rank(list, q, opts){
  const P = q && q.words ? q : pool(q);
  const max = (opts && opts.max) || 3;
  const scored = [];
  for(const w of list || []){
    let s = score(w, P);
    if(s < WEAK) continue;
    if(P.annata && String(w.annata || "") === P.annata) s = Math.min(1, s + 0.02);
    scored.push({ wine: w, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  /* la stessa etichetta in più annate o più assaggi conta una volta sola (la migliore) */
  const seen = new Set(), out = [];
  for(const r of scored){ const k = identity(r.wine); if(seen.has(k)) continue; seen.add(k); out.push(r); if(out.length >= max) break; }
  const strong = out.length && out[0].score >= STRONG && (out.length < 2 || out[0].score - out[1].score >= 0.08) ? out[0] : null;
  return { strong, list: out };
}

/* due descrizioni dello stesso vino scritte in modo un po' diverso («Fontodi Flaccianello» e «Flaccianello della Pieve»)? */
function sameWine(a, b){
  if(identity(a) === identity(b)) return true;
  const P = pool({ nome: b.nome, produttore: b.produttore });
  const n = fieldIn(a.nome, P), Q = pool({ nome: a.nome, produttore: a.produttore }), n2 = fieldIn(b.nome, Q);
  const p = a.produttore && b.produttore ? Math.min(fieldIn(a.produttore, P) || 0, fieldIn(b.produttore, Q) || 0) : null;
  const nm = Math.max(n || 0, n2 || 0);
  return p == null ? false : nm >= 0.85 && p >= 0.8;
}

return { STRONG, WEAK, norm, tokens, pool, score, rank, identity, sameWine, wordSim };
});
