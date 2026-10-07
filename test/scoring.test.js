const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../public/js/scoring.js");

/* Stesse voci e pesi di VALUTA in public/index.html: [chiave, titolo, aiuto, peso] */
const VALUTA = {
  v: [["qualita", "", "", 1]],
  o: [["intensita", "", "", 1], ["complessita", "", "", 1], ["qualita", "", "", 1]],
  g: [["equilibrio", "", "", 1], ["intensita", "", "", 1], ["persistenza", "", "", 1], ["qualita", "", "", 1]],
  f: [["armonia", "", "", 2]]
};

/* Scheda con tutti i giudizi uguali a n */
function tutti(n) {
  const T = {};
  Object.keys(VALUTA).forEach(g => { T[g] = {}; VALUTA[g].forEach(d => { T[g][d[0]] = n; }); });
  return T;
}

test("i pesi delle fasi e del voto smart sommano a 100", () => {
  assert.equal(Object.values(S.PHASE_W).reduce((a, b) => a + b, 0), 100);
  assert.equal(Object.values(S.SMART_W).reduce((a, b) => a + b, 0), 100);
});

test("scheda completa: il minimo è 50, mai 30", () => {
  assert.equal(S.fullScore(tutti(0), VALUTA).total, 50);
  assert.equal(S.fullScore(tutti(3), VALUTA).total >= 50, true);
});

test("scheda completa: 100 solo con ogni giudizio a 10", () => {
  assert.equal(S.fullScore(tutti(10), VALUTA).total, 100);
  const T = tutti(10);
  T.v.qualita = 9;
  assert.equal(S.fullScore(T, VALUTA).total < 100, true);
  const U = tutti(10);
  U.f.armonia = 9;
  assert.equal(S.fullScore(U, VALUTA).total < 100, true);
});

test("scheda completa: valori di riferimento con K = 1,8", () => {
  const atteso = { 4: 60, 5: 64, 6: 70, 7: 76, 8: 83, 9: 91, 10: 100 };
  Object.keys(atteso).forEach(n => {
    assert.equal(S.fullScore(tutti(Number(n)), VALUTA).total, atteso[n], "tutti a " + n);
  });
});

test("scheda completa: crescente e sempre nella banda", () => {
  let prec = 0;
  for (let n = 0; n <= 10; n++) {
    const tot = S.fullScore(tutti(n), VALUTA).total;
    assert.ok(tot >= 50 && tot <= 100);
    assert.ok(tot >= prec);
    prec = tot;
  }
});

test("scheda completa: i punteggi di fase sono nella banda e coerenti col totale", () => {
  const r = S.fullScore(tutti(8), VALUTA);
  S.PHASES.forEach(p => assert.ok(r.phases[p] >= 50 && r.phases[p] <= 100));
  const media = S.PHASES.reduce((s, p) => s + S.PHASE_W[p] * r.phases[p] / 100, 0);
  assert.ok(Math.abs(media - r.total) <= 1);
});

test("voto smart: media pesata 10/30/60", () => {
  assert.equal(S.smartScore({ occhio: 100, naso: 100, bocca: 100 }).total, 100);
  assert.equal(S.smartScore({ occhio: 50, naso: 50, bocca: 50 }).total, 50);
  assert.equal(S.smartScore({ occhio: 80, naso: 90, bocca: 70 }).total, 77); // 8 + 27 + 42
  assert.equal(S.smartScore({ occhio: 60, naso: 80, bocca: 100 }).total, 90); // 6 + 24 + 60
});

test("voto smart: i giudizi fuori banda vengono riportati tra 50 e 100", () => {
  assert.equal(S.clampBand(30), 50);
  assert.equal(S.clampBand(0), 50);
  assert.equal(S.clampBand(130), 100);
  assert.equal(S.clampBand("85"), 85);
  assert.equal(S.clampBand("abc"), 50);
  assert.equal(S.smartScore({ occhio: 10, naso: 20, bocca: 30 }).total, 50);
  assert.equal(S.smartScore({}).total, 50);
});

test("voto smart: 100 solo con tre 100", () => {
  assert.equal(S.smartScore({ occhio: 99, naso: 100, bocca: 100 }).total < 100, true);
  assert.equal(S.smartScore({ occhio: 100, naso: 100, bocca: 99 }).total < 100, true);
});

test("legacyLinear riproduce il vecchio totale", () => {
  // tutti 6 → 10·.6 + 30·.6 + 40·.6 + 20·.6 = 60
  assert.equal(S.legacyLinear({ v: .6, o: .6, g: .6, f: .6 }), 60);
  assert.equal(S.legacyLinear({ v: 1, o: 1, g: 1, f: 1 }), 100);
  assert.equal(S.legacyLinear({ v: 0.3, o: 0.3, g: 0.3, f: 0.3 }), 30);
});

test("record salvato modello 4: si ricalcola dai giudizi singoli", () => {
  const rec = { modello: 4, score: 86, voti: tutti(8) };
  assert.equal(S.scoreOfRecord(rec, VALUTA), 83);
  assert.equal(S.qualityOfRecord(rec, VALUTA).g, 0.8);
});

test("record storico con soli punti di fase (parts)", () => {
  const rec = { score: 78, parts: { v: 8, o: 24, g: 32, f: 16 } };
  const q = S.qualityOfRecord(rec, VALUTA);
  assert.deepEqual(q, { v: 0.8, o: 0.8, g: 0.8, f: 0.8 });
  assert.equal(S.scoreOfRecord(rec, VALUTA), 83);
});

test("record storico con parts.a al posto di parts.f", () => {
  const rec = { score: 60, parts: { v: 6, o: 18, g: 24, a: 12 } };
  assert.deepEqual(S.qualityOfRecord(rec, VALUTA), { v: 0.6, o: 0.6, g: 0.6, f: 0.6 });
});

test("record storico con il solo totale", () => {
  const rec = { score: 41 };
  assert.equal(S.scoreOfRecord(rec, VALUTA), S.fromLegacyTotal(41));
  assert.equal(S.fromLegacyTotal(41), 60);
  assert.equal(S.fromLegacyTotal(28), 55);
  assert.equal(S.fromLegacyTotal(100), 100);
  assert.equal(S.fromLegacyTotal(0), 50);
  assert.equal(S.fromLegacyTotal("non un numero"), 50);
});

test("record smart: usa i giudizi, non la curva", () => {
  const rec = { modalita: "smart", giudizi: { occhio: 80, naso: 90, bocca: 70 }, score: 77 };
  assert.equal(S.scoreOfRecord(rec, VALUTA), 77);
});

test("il ricalcolo è idempotente", () => {
  const rec = { modello: 4, voti: tutti(7) };
  const a = S.scoreOfRecord(rec, VALUTA);
  rec.score = a;
  assert.equal(S.scoreOfRecord(rec, VALUTA), a);
});

test("fasce descrittive", () => {
  const attese = [[50, "faulty"], [59, "faulty"], [60, "sufficient"], [69, "sufficient"], [70, "fair"],
    [79, "fair"], [80, "good"], [89, "good"], [90, "excellent"], [95, "excellent"],
    [96, "exceptional"], [99, "exceptional"], [100, "perfect"]];
  attese.forEach(([s, k]) => assert.equal(S.bandKey(s), k, String(s)));
});

test("K diverso cambia la curva ma non gli estremi", () => {
  [1.5, 1.8, 2.0, 2.5].forEach(k => {
    assert.equal(S.fullScore(tutti(0), VALUTA, k).total, 50);
    assert.equal(S.fullScore(tutti(10), VALUTA, k).total, 100);
  });
  assert.ok(S.fullScore(tutti(7), VALUTA, 2.5).total < S.fullScore(tutti(7), VALUTA, 1.5).total);
});

test("scheda completa: una media vicina a 100 non si arrotonda a 100", () => {
  assert.equal(S.fullFromQ({ v: 1, o: 1, g: 1, f: 0.9999 }).total, 99);
  assert.equal(S.fullFromQ({ v: 1, o: 1, g: 1, f: 1 }).total, 100);
});

test("record di un modello vecchio: i giudizi singoli non si usano", () => {
  const rec = { modello: 2, score: 60, voti: tutti(10), parts: { v: 6, o: 18, g: 24, f: 12 } };
  assert.deepEqual(S.qualityOfRecord(rec, VALUTA), { v: 0.6, o: 0.6, g: 0.6, f: 0.6 });
});

test("canRecompute: solo se il record ha dati propri", () => {
  assert.equal(S.canRecompute({ score: 41 }), false);
  assert.equal(S.canRecompute({ modello: 1, score: 41 }), false);
  assert.equal(S.canRecompute({ modello: 4, score: 80, voti: tutti(8) }), true);
  assert.equal(S.canRecompute({ modello: 2, voti: tutti(8), score: 80 }), false);
  assert.equal(S.canRecompute({ parts: { v: 8, o: 24, g: 32, f: 16 } }), true);
  assert.equal(S.canRecompute({ parts: { v: 8, o: 24, g: 32, a: 16 } }), true);
  assert.equal(S.canRecompute({ parts: { v: 8, o: 24, g: 32 } }), false);
  assert.equal(S.canRecompute({ modalita: "smart", giudizi: { occhio: 80, naso: 80, bocca: 80 } }), true);
  assert.equal(S.canRecompute(null), false);
});
