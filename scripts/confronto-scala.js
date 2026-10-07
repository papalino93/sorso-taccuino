#!/usr/bin/env node
/* Confronto prima/dopo della nuova scala di voto 50-100.

   Uso:  node scripts/confronto-scala.js <file-esportato.json> [--k 2] [--csv]

   Il file è quello che l'app produce con "Salva copia" nella scheda Libro.
   Per ogni scheda calcola il punteggio lineare di prima (0-100) e quello della
   scala nuova, con lo stesso modulo dell'app (public/js/scoring.js): la curva
   50 + 50 * q^k si applica a ogni fase e il totale è la media pesata delle fasi.

   I giudizi singoli si usano per le schede del modello attuale (4), i punti di
   fase per quelle con `parts`, il solo totale per le altre. */

const fs = require("fs");
const Scoring = require("../public/js/scoring.js");

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--k");
const kIdx = args.indexOf("--k");
const K = kIdx >= 0 ? Number(args[kIdx + 1]) : Scoring.K;
const CSV = args.includes("--csv");

if (!file || !(K > 0)) {
  console.error("Uso: node scripts/confronto-scala.js <file.json> [--k 2] [--csv]");
  process.exit(1);
}

/* Stesse voci e pesi di VALUTA in public/index.html: [chiave, titolo, aiuto, peso] */
const VALUTA = {
  v: [["qualita", "", "", 1]],
  o: [["intensita", "", "", 1], ["complessita", "", "", 1], ["qualita", "", "", 1]],
  g: [["equilibrio", "", "", 1], ["intensita", "", "", 1], ["persistenza", "", "", 1], ["qualita", "", "", 1]],
  f: [["armonia", "", "", 2]]
};

function statistiche(valori) {
  const v = valori.slice().sort((a, b) => a - b);
  const n = v.length;
  const media = v.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - media) ** 2, 0) / n);
  const q = p => v[Math.min(n - 1, Math.floor(p * (n - 1) + 0.5))];
  return { n, min: v[0], p25: q(0.25), mediana: q(0.5), p75: q(0.75), max: v[n - 1], media, sd };
}

function fasce(valori) {
  const def = [["<50", x => x < 50], ["50-59", x => x >= 50 && x < 60], ["60-69", x => x >= 60 && x < 70],
    ["70-79", x => x >= 70 && x < 80], ["80-89", x => x >= 80 && x < 90], ["90-95", x => x >= 90 && x <= 95],
    ["96-99", x => x >= 96 && x < 100], ["100", x => x === 100]];
  return def.map(([nome, f]) => [nome, valori.filter(f).length]);
}

let dump;
try { dump = JSON.parse(fs.readFileSync(file, "utf8")); }
catch (e) { console.error("File illeggibile: " + e.message); process.exit(1); }
if (!dump || dump.formato !== "sorso-archivio" || !Array.isArray(dump.schede)) {
  console.error("Non sembra un file di \"Salva copia\" di Sorso (manca formato \"sorso-archivio\").");
  process.exit(1);
}

const righe = [];
let saltate = 0;
for (const s of dump.schede) {
  const ricalcolabile = Scoring.canRecompute(s) && s.modalita !== "smart";
  const vecchio = ricalcolabile ? Scoring.legacyLinear(Scoring.qualityOfRecord(s, VALUTA)) : Number(s.score);
  if (!isFinite(vecchio)) { saltate++; continue; }
  const nuovo = s.modalita === "smart" ? s.score
    : ricalcolabile ? Scoring.scoreOfRecord(s, VALUTA, K) : Scoring.fromLegacyTotal(vecchio, K);
  righe.push({
    nome: [s.nome, s.produttore, s.annata].filter(Boolean).join(" — ") || "(senza nome)",
    modello: s.modalita === "smart" ? "smart" : (ricalcolabile ? "completa" : "storica"),
    vecchio,
    nuovo
  });
}
if (!righe.length) { console.error("Nessuna scheda con un punteggio utilizzabile."); process.exit(1); }
righe.sort((a, b) => b.vecchio - a.vecchio);

if (CSV) {
  console.log("nome;modello;prima;dopo");
  for (const r of righe) console.log([r.nome.replace(/;/g, ","), r.modello, r.vecchio, r.nuovo].join(";"));
  process.exit(0);
}

const f1 = x => x.toFixed(1);
console.log("Confronto scala — curva per fase 50 + 50·q^" + K + " — " + righe.length + " schede" + (saltate ? " (" + saltate + " senza punteggio, saltate)" : ""));
console.log("");
console.log("PRIMA".padEnd(8) + "DOPO".padEnd(8) + "TIPO".padEnd(10) + "VINO");
for (const r of righe) console.log(String(r.vecchio).padEnd(8) + String(r.nuovo).padEnd(8) + r.modello.padEnd(10) + r.nome);

const a = statistiche(righe.map(r => r.vecchio)), b = statistiche(righe.map(r => r.nuovo));
console.log("\nStatistiche            prima   dopo");
for (const [et, k] of [["minimo", "min"], ["25° percentile", "p25"], ["mediana", "mediana"], ["75° percentile", "p75"], ["massimo", "max"]])
  console.log(et.padEnd(22) + String(a[k]).padEnd(8) + b[k]);
console.log("media".padEnd(22) + f1(a.media).padEnd(8) + f1(b.media));
console.log("dev. standard".padEnd(22) + f1(a.sd).padEnd(8) + f1(b.sd));

console.log("\nFasce                  prima   dopo");
const fa = fasce(righe.map(r => r.vecchio)), fb = fasce(righe.map(r => r.nuovo));
fa.forEach(([nome, n], i) => console.log(nome.padEnd(22) + String(n).padEnd(8) + fb[i][1]));

console.log("\nTabella di riferimento (giudizi tutti uguali, scheda completa)");
console.log("giudizio".padEnd(10) + "k=1.5".padEnd(8) + "k=1.8".padEnd(8) + "k=2.0".padEnd(8) + "k=" + K);
const tutti = n => { const T = {}; Object.keys(VALUTA).forEach(g => { T[g] = {}; VALUTA[g].forEach(d => { T[g][d[0]] = n; }); }); return T; };
for (let g = 4; g <= 10; g++) {
  console.log(String(g).padEnd(10) + [1.5, 1.8, 2.0, K].map(k => String(Scoring.fullScore(tutti(g), VALUTA, k).total).padEnd(8)).join(""));
}
