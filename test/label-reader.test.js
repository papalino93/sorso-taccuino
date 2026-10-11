/* Lettura dell'etichetta: dal testo dell'OCR ai campi della scheda. */
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../public/js/label-reader.js");

const read = (text, lines) => { const r = L.parseLabel(text, lines || [], 2026); return { r, f: L.toWineFields(r) }; };

test("IGT toscano: produttore, nome, annata, denominazione scritta per esteso, vitigno, gradazione", () => {
  const { f } = read("Fontodi\nFLACCIANELLO DELLA PIEVE\nColli della Toscana Centrale IGT\n2021\nImbottigliato all'origine da Fontodi - Panzano in Chianti\nSangiovese 100%\n14,5% vol 750 ml");
  assert.equal(f.produttore, "Fontodi");
  assert.equal(f.nome, "Flaccianello della Pieve");
  assert.equal(f.annata, "2021");
  assert.equal(f.denominazione, "Colli della Toscana Centrale IGT");
  assert.deepEqual(f.vitigni, ["Sangiovese"]);
  assert.equal(f.gradazione, "14,5% vol");
});

test("l'indirizzo dell'imbottigliatore non diventa la denominazione", () => {
  const { r } = read("Tenuta Prova\nROSSO DEL POGGIO\nVino rosso\nProdotto e imbottigliato da Tenuta Prova, Loc. Podere 1, 53024 Montalcino, Italia\n13% vol");
  assert.ok(!r.denominazione || !/montalcino/i.test(r.denominazione), String(r.denominazione));
  assert.equal(r.produttore, "Tenuta Prova");
});

test("DOCG e menzioni: Barolo Riserva", () => {
  const { r, f } = read("CASCINA ESEMPIO\nBarolo\nDenominazione di Origine Controllata e Garantita\nRiserva\nVendemmia 2016\nNebbiolo\n14% vol");
  assert.equal(r.tipologia, "DOCG");
  assert.match(f.denominazione, /Barolo/);
  assert.equal(f.annata, "2016");
  assert.ok(r.menzioni.includes("Riserva"));
  assert.deepEqual(f.vitigni, ["Nebbiolo"]);
});

test("anno di fondazione non scambiato per annata", () => {
  const { f } = read("Azienda Agricola Esempio dal 1898\nVendemmia 2019\nMontepulciano d'Abruzzo DOC\n13,5% vol");
  assert.equal(f.annata, "2019");
});

test("spumante: la tipologia si propone da sola", () => {
  assert.equal(read("Cantina Bolle\nPROSECCO SUPERIORE DOCG\nBrut\nMillesimato 2024\n11,5% vol").f.tipologia, "Spumante");
  assert.equal(read("Maison Prova\nChampagne\nBrut\n12% vol").f.tipologia, "Spumante");
  assert.equal(read("Cantina X\nPASSITO DI PROVA\nPassito\n2018\n14% vol").f.tipologia, "Passito");
  assert.equal(read("Cantina X\nCerasuolo\nRosato\n2024").f.tipologia, "Rosato");
  assert.equal(read("Cantina X\nChianti Classico DOCG\n2020").f.tipologia, undefined);
});

test("con le misure delle righe il testo più grande è il nome", () => {
  const lines = [{ text: "Podere Piccolo", h: 20, conf: 90 }, { text: "ARIA DI SERA", h: 80, conf: 90 }, { text: "Toscana IGT 2020", h: 18, conf: 90 }];
  const { f } = read(lines.map(l => l.text).join("\n"), lines);
  assert.equal(f.nome, "Aria di Sera");
});

test("testo vuoto o senza senso: nessun campo, nessun errore", () => {
  assert.deepEqual(read("").f, {});
  assert.deepEqual(read("~~ || ..\n!!").f, {});
});

test("gradazione e annata fuori scala sono ignorate", () => {
  const { r } = read("Vino\n1850\n99% vol\n3% vol");
  assert.equal(r.annata, undefined);
  assert.equal(r.gradazione, undefined);
});

test("il nome non ripete il produttore", () => {
  const { f } = read("FONTODI\nFontodi\nToscana IGT 2020");
  assert.notEqual(f.nome && f.nome.toLowerCase(), f.produttore && f.produttore.toLowerCase());
});

test("produttore tutto maiuscolo: maiuscole sensate", () => {
  const { f } = read("TENUTA SAN GUIDO\nSASSICAIA\nBolgheri Sassicaia DOC\n2020");
  assert.equal(f.produttore, "Tenuta San Guido");
});

test("il nome non si porta dietro il produttore (anche con righe di altezza simile)", () => {
  const lines = [{ text: "FONTODI", h: 96, conf: 90 }, { text: "FLACCIANELLO", h: 120, conf: 90 }, { text: "DELLA PIEVE", h: 118, conf: 90 }, { text: "Colli della Toscana Centrale IGT", h: 56, conf: 90 }, { text: "2021", h: 150, conf: 90 }, { text: "Imbottigliato all'origine da Fontodi", h: 40, conf: 90 }];
  const { f } = read(lines.map(l => l.text).join("\n"), lines);
  assert.equal(f.produttore, "Fontodi");
  assert.equal(f.nome, "Flaccianello della Pieve");
});
