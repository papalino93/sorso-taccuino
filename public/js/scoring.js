/* Punteggio di Sorso — scala 50-100.

   Funzioni pure, senza accesso al DOM: usate dall'app (script nel browser) e
   dai test (Node). Due modalità di valutazione, stessa scala:

   - Scheda completa: i giudizi restano 0-10. Per ogni fase la qualità
     q (0-1, somma pesata dei giudizi della fase) diventa un punteggio di
     fase  50 + 50 · q^K.  Il totale è la media pesata delle quattro fasi
     (visivo 10, olfattivo 30, gusto-olfattivo 40, finale 20).
   - Voto smart: occhio, naso, bocca sono già giudizi 50-100. Il totale è la
     loro media pesata (10, 30, 60).

   In entrambi i casi il punteggio sta tra 50 e 100, e 100 si ottiene solo
   con ogni giudizio al massimo. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Scoring = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const BAND_MIN = 50;
  const BAND_MAX = 100;
  /* Esponente della curva della scheda completa: più è alto, più è difficile
     arrivare in alto. Con 2 le parole dei giudizi 0-10 coincidono con le fasce
     (6 sufficiente = 68, 7 discreto = 75, 8 buono = 82, 9 ottimo = 91). */
  const K = 2;
  const VAL_MAX = 10;

  /* Le voci della scheda completa: [chiave, titolo, aiuto, peso] come VALUTA in
     public/index.html (titoli e aiuti sono lì, nelle traduzioni). Qui servono
     chiavi e pesi, per calcolare il punteggio anche sul server. Un test
     verifica che i due elenchi coincidano. */
  const ITEMS = {
    v: [["qualita", "", "", 1]],
    o: [["intensita", "", "", 1], ["complessita", "", "", 1], ["qualita", "", "", 1]],
    g: [["equilibrio", "", "", 1], ["intensita", "", "", 1], ["persistenza", "", "", 1], ["qualita", "", "", 1]],
    f: [["armonia", "", "", 2]]
  };

  const PHASES = ["v", "o", "g", "f"];
  const PHASE_W = { v: 10, o: 30, g: 40, f: 20 };
  const SMART_KEYS = ["occhio", "naso", "bocca"];
  const SMART_W = { occhio: 10, naso: 30, bocca: 60 };

  function clamp01(x) { return Math.min(1, Math.max(0, Number(x) || 0)); }

  /* Arrotondamento classico: da 5 in su per eccesso, da 1 a 4 per difetto
     (82,5 diventa 83; 82,4 diventa 82; 79,45 con un decimale diventa 79,5).
     L'arrotondamento predefinito di JavaScript e toFixed sbagliano i casi esatti a metà
     quando il decimale non è rappresentabile in binario (1,005 con due decimali, o
     82,49999999999999 che in realtà è 82,5): il piccolo margine li riporta alla regola. */
  function roundHalfUp(x, decimals) {
    const n = Number(x);
    if (!isFinite(n)) return 0;
    const f = Math.pow(10, decimals || 0);
    const r = Math.floor(Math.abs(n) * f + 0.5 + 1e-9) / f;
    return n < 0 ? -r : r;
  }

  /* 100 è riservato al caso in cui ogni giudizio è al massimo: una media come
     99,9 non deve arrotondarsi a 100. */
  function cap100(total, tuttoAlMassimo) {
    return (total >= BAND_MAX && !tuttoAlMassimo) ? BAND_MAX - 1 : total;
  }

  /* Un giudizio smart è un intero tra 50 e 100. */
  function clampBand(x) {
    if (x === null || x === "" || isNaN(Number(x))) return BAND_MIN;
    const n = roundHalfUp(x);
    return Math.min(BAND_MAX, Math.max(BAND_MIN, n));
  }

  /* qualità 0-1 → punteggio 50-100 (non arrotondato) */
  function band(q, k) {
    return BAND_MIN + (BAND_MAX - BAND_MIN) * Math.pow(clamp01(q), k == null ? K : k);
  }

  /* Qualità 0-1 di una fase. `values` = {chiave: 0-10}, `defs` = elenco di
     voci [chiave, titolo, aiuto, peso] come VALUTA[fase] dell'app. */
  function phaseQuality(values, defs) {
    let raw = 0, max = 0;
    defs.forEach(function (d) {
      raw += (Number(values && values[d[0]]) || 0) * d[3];
      max += VAL_MAX * d[3];
    });
    return max ? clamp01(raw / max) : 0;
  }

  /* Punteggio della scheda completa a partire dalle qualità di fase
     q = {v,o,g,f}. Restituisce il totale e i punteggi di fase (interi). */
  function fullFromQ(q, k) {
    let total = 0, tuttoAlMassimo = true;
    const phases = {};
    PHASES.forEach(function (p) {
      const b = band(q[p], k);
      phases[p] = roundHalfUp(b);
      total += PHASE_W[p] * b / 100;
      if (clamp01(q[p]) < 1) tuttoAlMassimo = false;
    });
    return { total: cap100(roundHalfUp(total), tuttoAlMassimo), phases: phases, q: q };
  }

  /* Dalla scheda in compilazione: T ha i gruppi v, o, g, f con i giudizi. */
  function fullScore(T, valuta, k) {
    const q = {};
    PHASES.forEach(function (p) { q[p] = phaseQuality(T[p], valuta[p]); });
    return fullFromQ(q, k);
  }

  /* Qualità di fase da un record salvato. Con i giudizi singoli (solo il
     modello 4: le schede più vecchie usavano voci diverse) la risoluzione è piena; altrimenti si usano i punti di fase `parts`
     (v,o,g,f oppure v,o,g,a) o, in mancanza, il solo totale lineare. */
  function qualityOfRecord(rec, valuta) {
    if (rec && Number(rec.modello) === 4 && rec.voti && rec.voti.g && valuta) {
      const q = {};
      PHASES.forEach(function (p) { q[p] = phaseQuality(rec.voti[p], valuta[p]); });
      return q;
    }
    const parts = rec && rec.parts;
    if (parts && typeof parts === "object") {
      const f = parts.f != null ? parts.f : parts.a;
      const vals = { v: parts.v, o: parts.o, g: parts.g, f: f };
      if (PHASES.every(function (p) { return isFinite(Number(vals[p])); })) {
        const q = {};
        PHASES.forEach(function (p) { q[p] = clamp01(Number(vals[p]) / PHASE_W[p]); });
        return q;
      }
    }
    const t = clamp01((Number(rec && rec.score) || 0) / 100);
    return { v: t, o: t, g: t, f: t };
  }

  /* Voto smart: g = {occhio, naso, bocca}, ciascuno 50-100. */
  function smartScore(g) {
    /* I giudizi sono interi e i pesi interi: la somma pesata è un intero esatto, e
       l'arrotondamento a metà si fa senza passare dai decimali binari. */
    let num = 0, tuttoAlMassimo = true;
    const phases = {};
    SMART_KEYS.forEach(function (k) {
      const v = clampBand(g && g[k] != null ? g[k] : BAND_MIN);
      phases[k] = v;
      num += SMART_W[k] * v;
      if (v < BAND_MAX) tuttoAlMassimo = false;
    });
    return { total: cap100(Math.floor((num + 50) / 100), tuttoAlMassimo), phases: phases };
  }

  /* Il vecchio totale lineare 0-100 (somma di quattro fasi arrotondate): serve
     a verificare il ricalcolo e a conservare `legacyTotal`. */
  function legacyLinear(q) {
    return PHASES.reduce(function (s, p) { return s + roundHalfUp(clamp01(q[p]) * PHASE_W[p]); }, 0);
  }

  /* Un totale lineare vecchio, senza altro dato, sulla scala nuova. */
  function fromLegacyTotal(total, k) {
    return roundHalfUp(band(clamp01((Number(total) || 0) / 100), k));
  }

  /* Un record si può ricalcolare da dati propri (giudizi smart, giudizi
     singoli del modello 4, punti di fase)? Se ha solo il totale, no: quel
     totale è lineare finché il record non porta scoreScale 2. */
  function canRecompute(rec) {
    if (!rec) return false;
    if (rec.modalita === "smart" && rec.giudizi) return true;
    if (Number(rec.modello) === 4 && rec.voti && rec.voti.g) return true;
    const parts = rec.parts;
    if (parts && typeof parts === "object") {
      const f = parts.f != null ? parts.f : parts.a;
      return [parts.v, parts.o, parts.g, f].every(function (x) { return isFinite(Number(x)) && x !== null && x !== ""; });
    }
    return false;
  }

  /* Punteggio nuovo per un record salvato (qualsiasi modello o modalità). */
  function scoreOfRecord(rec, valuta, k) {
    if (rec && rec.modalita === "smart" && rec.giudizi) return smartScore(rec.giudizi).total;
    return fullFromQ(qualityOfRecord(rec, valuta), k).total;
  }

  /* Fascia descrittiva: chiave per la traduzione. */
  function bandKey(score) {
    const s = Number(score) || 0;
    if (s >= 100) return "perfect";
    if (s >= 96) return "exceptional";
    if (s >= 90) return "excellent";
    if (s >= 80) return "good";
    if (s >= 70) return "fair";
    if (s >= 60) return "sufficient";
    return "faulty";
  }

  return {
    BAND_MIN: BAND_MIN, BAND_MAX: BAND_MAX, K: K, VAL_MAX: VAL_MAX,
    ITEMS: ITEMS, PHASES: PHASES, PHASE_W: PHASE_W, SMART_KEYS: SMART_KEYS, SMART_W: SMART_W,
    clampBand: clampBand, roundHalfUp: roundHalfUp, band: band, phaseQuality: phaseQuality,
    fullFromQ: fullFromQ, fullScore: fullScore, qualityOfRecord: qualityOfRecord,
    smartScore: smartScore, legacyLinear: legacyLinear, fromLegacyTotal: fromLegacyTotal,
    scoreOfRecord: scoreOfRecord, canRecompute: canRecompute, bandKey: bandKey
  };
});
