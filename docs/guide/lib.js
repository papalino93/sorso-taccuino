/* Componenti e stile condivisi dalle guide PDF di Sorso (A4, HTML stampato con Chromium).
   Stile: editoriale, come una rivista: copertina scura con cornice e ornamenti, titoli in serif con
   una parola in corsivo a colore, schermate vere dentro cornici di telefono, numeri grandi, schede. */
const fs = require("fs");
const path = require("path");
const V = require("../../public/js/version.js");

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const [yy, mm, dd] = V.date.split("-").map(Number);
const DATA = `${dd} ${MESI[mm - 1]} ${yy}`;
const VERSIONE = V.version;
const BASE = "https://sorso-taccuino.vercel.app";

const JPG = path.join(__dirname, "img", "jpg");
const img = n => {
  const j = path.join(JPG, n.replace(/\.png$/, ".jpg"));
  return fs.existsSync(j) ? "data:image/jpeg;base64," + fs.readFileSync(j).toString("base64")
    : "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "img", n)).toString("base64");
};
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MARCHIO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#0B0B10"/><circle cx="32" cy="32" r="22.5" fill="none" stroke="#2c2c36" stroke-width="5.5"/><path d="M32 9.5a22.5 22.5 0 1 1-20.6 13.4" fill="none" stroke="#A58BFF" stroke-width="5.5" stroke-linecap="round"/><circle cx="32" cy="27" r="10" fill="#fff"/><circle cx="32" cy="27" r="7.8" fill="#A58BFF"/><path d="M27.2 24.2a6.2 6.2 0 0 1 5.2-2.9" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.9" stroke-linecap="round"/><path d="M19.4 41Q32 53.4 44.6 41Q32 48.6 19.4 41Z" fill="#fff"/></svg>`;
const ROMBO = `<svg class="rombo" viewBox="0 0 10 10"><path d="M5 0l5 5-5 5-5-5z" fill="currentColor"/></svg>`;

const CSS = `
@import url("https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap");
/* Geist e Geist Mono statici (cartella fonts/): i font variabili vengono incorporati nel PDF come "Type 3" e rendono lenta la pagina */
@font-face { font-family: 'Geist'; font-weight: 400; src: url("fonts/geist-400.woff") format("woff"); }
@font-face { font-family: 'Geist'; font-weight: 500; src: url("fonts/geist-500.woff") format("woff"); }
@font-face { font-family: 'Geist'; font-weight: 600; src: url("fonts/geist-600.woff") format("woff"); }
@font-face { font-family: 'Geist'; font-weight: 700; src: url("fonts/geist-700.woff") format("woff"); }
@font-face { font-family: 'Geist'; font-weight: 800; src: url("fonts/geist-800.woff") format("woff"); }
@font-face { font-family: 'Geist Mono'; font-weight: 400; src: url("fonts/geistmono-400.woff") format("woff"); }
@font-face { font-family: 'Geist Mono'; font-weight: 500; src: url("fonts/geistmono-500.woff") format("woff"); }
@page { size: A4; margin: 0; }
:root { --ink:#0B0B10; --paper:#FBF4E6; --card:#F1E8D6; --line:#E0D5BD; --violet:#8C1D3F; --lilac:#E7849D; --mute:#5b5b64; --night:#120A0E; --night2:#2A0E19; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font: 450 10pt/1.55 'Geist', system-ui, sans-serif; color: var(--ink); background: #888; }
em { font-family: 'Instrument Serif', serif; font-style: italic; font-weight: 400; }
b, strong { font-weight: 650; }
code, .mono { font-family: 'Geist Mono', ui-monospace, monospace; font-size: .92em; }
code { background: rgba(140,29,63,.09); color: #7A1535; padding: .5pt 3.5pt; border-radius: 3pt; }
.ink code, .cover code { background: rgba(255,255,255,.12); color: #F6D5DE; }

.page { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; break-after: page; background: var(--paper); }
.page.ink { background: radial-gradient(900px 520px at 85% -5%, #3a1322, #120A0E 62%); color: #F4F2FF; }
.frame { position: absolute; inset: 8mm; border: .25mm solid rgba(140,29,63,.45); pointer-events: none; }
.ink .frame, .cover .frame { border-color: rgba(231,132,157,.5); }
.frame .c { position: absolute; width: 3.2mm; height: 3.2mm; color: var(--violet); }
.ink .frame .c, .cover .frame .c { color: var(--lilac); }
.frame .c.a { left: -1.6mm; top: -1.6mm; } .frame .c.b { right: -1.6mm; top: -1.6mm; } .frame .c.c2 { left: -1.6mm; bottom: -1.6mm; } .frame .c.d { right: -1.6mm; bottom: -1.6mm; }
.rombo { width: 100%; height: 100%; display: block; }
.run { position: absolute; left: 18mm; right: 18mm; top: 14mm; display: flex; justify-content: space-between; font-size: 6.6pt; letter-spacing: .22em; text-transform: uppercase; color: var(--mute); }
.ink .run { color: rgba(244,242,255,.62); }
.foot { position: absolute; left: 18mm; right: 18mm; bottom: 13mm; display: flex; justify-content: space-between; align-items: baseline; font-size: 6.6pt; letter-spacing: .22em; text-transform: uppercase; color: var(--mute); }
.ink .foot { color: rgba(244,242,255,.62); }
.foot .n { font-family: 'Instrument Serif', serif; font-style: italic; font-size: 11pt; letter-spacing: 0; color: var(--violet); text-transform: none; }
.ink .foot .n { color: var(--lilac); }
.body { position: absolute; left: 18mm; right: 18mm; top: 26mm; bottom: 21mm; }

.eyebrow { display: flex; align-items: center; gap: 3mm; font-size: 7.4pt; letter-spacing: .26em; text-transform: uppercase; color: var(--violet); margin-bottom: 4mm; }
.eyebrow i { font-family: 'Instrument Serif', serif; font-style: italic; letter-spacing: 0; font-size: 10pt; text-transform: none; }
.eyebrow::after { content: ""; height: .25mm; width: 26mm; background: currentColor; opacity: .5; }
.ink .eyebrow { color: var(--lilac); }
h1.d { font-family: 'Instrument Serif', serif; font-weight: 400; font-size: 36pt; line-height: 1.04; letter-spacing: -.01em; margin-bottom: 4mm; }
h1.d em { color: var(--violet); }
.ink h1.d em { color: var(--lilac); }
h2.s { font-family: 'Instrument Serif', serif; font-weight: 400; font-size: 17pt; line-height: 1.15; margin: 5mm 0 2mm; }
h2.s em { color: var(--violet); }
.ink h2.s em { color: var(--lilac); }
h3.k { font-size: 7.2pt; letter-spacing: .2em; text-transform: uppercase; color: var(--violet); margin: 4mm 0 1.6mm; font-weight: 650; }
.ink h3.k { color: var(--lilac); }
.lead { font-family: 'Instrument Serif', serif; font-size: 13.2pt; line-height: 1.42; color: #2a2a33; max-width: 112mm; }
.ink .lead { color: #F9E4EA; }
p { margin-bottom: 2.4mm; }
.mute { color: var(--mute); }
.ink .mute { color: rgba(244,242,255,.7); }
ul.l { list-style: none; margin: 1mm 0 3mm; }
ul.l li { position: relative; padding-left: 4.6mm; margin-bottom: 1.4mm; }
ul.l li::before { content: ""; position: absolute; left: .6mm; top: 1.9mm; width: 1.6mm; height: 1.6mm; background: var(--violet); transform: rotate(45deg); }
.ink ul.l li::before { background: var(--lilac); }

/* copertina */
.cover { background: radial-gradient(1000px 700px at 80% 8%, #4d1629, #120A0E 62%); color: #fff; }
.cover .big100 { position: absolute; right: -14mm; bottom: 38mm; font-family: 'Geist', sans-serif; font-weight: 800; font-size: 250pt; line-height: .8; letter-spacing: -.08em; color: transparent; -webkit-text-stroke: .35mm #5a2f3d; }
.cover .mk { position: absolute; left: 22mm; top: 24mm; width: 17mm; height: 17mm; }
.cover .brand { position: absolute; left: 43mm; top: 27.5mm; font-size: 8pt; letter-spacing: .3em; text-transform: uppercase; color: rgba(255,255,255,.78); }
.cover .brand b { display: block; font-family: 'Geist', sans-serif; font-weight: 800; letter-spacing: -.02em; font-size: 22pt; text-transform: none; color: #fff; margin-top: .5mm; }
.cover .titolo { position: absolute; left: 22mm; right: 22mm; top: 112mm; }
.cover .orn { display: flex; align-items: center; gap: 3mm; margin-bottom: 7mm; color: var(--lilac); }
.cover .orn span { height: .25mm; width: 34mm; background: currentColor; opacity: .7; } .cover .orn .rombo { width: 3mm; height: 3mm; }
.cover h1 { font-family: 'Instrument Serif', serif; font-weight: 400; font-size: 54pt; line-height: 1; letter-spacing: -.015em; }
.cover h1 em { color: var(--lilac); }
.cover .sot { margin-top: 7mm; font-size: 8pt; letter-spacing: .26em; text-transform: uppercase; color: rgba(255,255,255,.8); line-height: 2; }
.cover .piede { position: absolute; left: 22mm; right: 22mm; bottom: 20mm; font-size: 6.8pt; letter-spacing: .26em; text-transform: uppercase; color: rgba(244,242,255,.72); display: flex; justify-content: space-between; }

/* numeri grandi */
.stats { display: grid; grid-template-columns: repeat(4, 1fr); border-top: .25mm solid var(--line); border-bottom: .25mm solid var(--line); margin: 6mm 0; }
.ink .stats { border-color: rgba(231,132,157,.35); }
.stats div { padding: 5mm 3mm; text-align: center; border-left: .25mm solid var(--line); }
.ink .stats div { border-color: rgba(231,132,157,.35); }
.stats div:first-child { border-left: 0; }
.stats .v { font-family: 'Instrument Serif', serif; font-size: 30pt; line-height: 1; color: var(--violet); display: block; }
.ink .stats .v { color: var(--lilac); }
.stats .t { display: block; margin-top: 2mm; font-size: 6.6pt; letter-spacing: .16em; text-transform: uppercase; color: var(--mute); line-height: 1.5; }
.ink .stats .t { color: rgba(244,242,255,.7); }
.cards3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
.cards2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4mm; }
.card { background: var(--card); border-radius: 5mm; padding: 5mm 5mm 4mm; }
.ink .card { background: rgba(255,255,255,.07); border: .2mm solid rgba(231,132,157,.28); }
.card h4 { font-family: 'Instrument Serif', serif; font-weight: 400; font-size: 14pt; line-height: 1.15; margin-bottom: 1.6mm; color: var(--violet); }
.ink .card h4 { color: var(--lilac); }
.card p { font-size: 9pt; line-height: 1.5; margin: 0; }
.quote { border-left: .8mm solid var(--violet); padding: 1mm 0 1mm 5mm; margin: 5mm 0; font-family: 'Instrument Serif', serif; font-style: italic; font-size: 14.5pt; line-height: 1.35; color: #2a2a33; }
.ink .quote { border-color: var(--lilac); color: #F9E4EA; }
.call { background: #F8E8EC; border-left: .8mm solid var(--violet); border-radius: 0 3mm 3mm 0; padding: 3.4mm 4.4mm; margin: 3.5mm 0; font-size: 8.8pt; }
.call.warn { background: #FFF1E6; border-color: #C2570C; }
.ink .call { background: rgba(255,255,255,.08); border-color: var(--lilac); }

/* telefono */
.phone { position: relative; width: 56mm; border-radius: 8.5mm; background: #0B0B10; padding: 1.7mm; box-shadow: 0 0 0 .3mm #34343d inset; }
.ink .phone { box-shadow: 0 0 0 .3mm #7a4456 inset; }
.phone .scr { border-radius: 6.9mm; overflow: hidden; background: #fff; aspect-ratio: 390 / 800; position: relative; }
.phone .scr img { width: 100%; display: block; }
.phone .scr::before { content: ""; position: absolute; z-index: 2; top: 2mm; left: 50%; transform: translateX(-50%); width: 15mm; height: 4mm; border-radius: 3mm; background: #0B0B10; }
.phone.sm { width: 46mm; border-radius: 7mm; } .phone.sm .scr { border-radius: 5.6mm; } .phone.sm .scr::before { width: 12mm; height: 3.3mm; top: 1.7mm; }
.phone.lg { width: 70mm; border-radius: 10mm; } .phone.lg .scr { border-radius: 7.8mm; }
.phones { display: flex; align-items: flex-start; justify-content: center; gap: 6mm; }
.cap { margin-top: 3.4mm; font-size: 8pt; line-height: 1.45; display: flex; gap: 2.2mm; align-items: flex-start; }
.cap .nb { flex: none; width: 5.2mm; height: 5.2mm; border-radius: 50%; background: var(--violet); color: #fff; font-weight: 700; font-size: 7pt; display: grid; place-items: center; margin-top: .3mm; }
.ink .cap .nb { background: var(--lilac); color: var(--night); }
.fig { display: flex; flex-direction: column; align-items: center; }
.fig .cap { max-width: 56mm; }

/* tabelle */
table.t { width: 100%; border-collapse: collapse; font-size: 8.7pt; margin: 2.5mm 0 4mm; }
table.t th { text-align: left; font-size: 6.6pt; letter-spacing: .18em; text-transform: uppercase; color: var(--violet); padding: 0 3mm 2mm 0; border-bottom: .3mm solid var(--violet); font-weight: 650; }
table.t td { padding: 2.2mm 3mm 2.2mm 0; border-bottom: .2mm solid var(--line); vertical-align: top; line-height: 1.45; }
.ink table.t td { border-color: rgba(231,132,157,.25); } .ink table.t th { color: var(--lilac); border-color: var(--lilac); }
table.t td:first-child { white-space: nowrap; font-weight: 600; }
table.t td.w { white-space: normal; }
/* codice */
pre.code { background: #160B10; color: #F3E8EB; border-radius: 3.6mm; padding: 4mm 4.5mm; font: 400 6.9pt/1.55 'Geist Mono', monospace; margin: 2mm 0 4mm; white-space: pre-wrap; word-break: break-word; position: relative; }
pre.code.big { font-size: 7.7pt; line-height: 1.6; }
pre.code .tag { position: absolute; right: 3.4mm; top: 2.4mm; font: 600 5.8pt 'Geist'; letter-spacing: .18em; text-transform: uppercase; color: var(--lilac); }
pre.code .c { color: #A88F98; } pre.code .k { color: #F2A9BC; } pre.code .s { color: #8FE3B4; } pre.code .n { color: #FFC980; }
/* schema di flusso */
.flow { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2.4mm; margin: 4mm 0; position: relative; }
.flow .st { background: var(--card); border-radius: 4mm; padding: 5mm 3.2mm 4mm; position: relative; min-height: 52mm; }
.ink .flow .st { background: rgba(255,255,255,.07); border: .2mm solid rgba(231,132,157,.28); }
.flow .st .nn { font-family: 'Instrument Serif', serif; font-style: italic; font-size: 20pt; color: var(--violet); line-height: 1; display: block; margin-bottom: 1.4mm; }
.ink .flow .st .nn { color: var(--lilac); }
.flow .st b { display: block; font-size: 9pt; line-height: 1.25; margin-bottom: 1.2mm; }
.flow .st span.d { font-size: 7.9pt; line-height: 1.4; color: var(--mute); display: block; }
.ink .flow .st span.d { color: rgba(244,242,255,.72); }
.flow .st:not(:last-child)::after { content: "→"; position: absolute; right: -2.8mm; top: 50%; transform: translateY(-50%); color: var(--violet); font-weight: 700; z-index: 2; background: var(--paper); border-radius: 50%; width: 4mm; height: 4mm; font-size: 8pt; display: grid; place-items: center; }
.ink .flow .st:not(:last-child)::after { background: var(--night); color: var(--lilac); }
/* pagine con più respiro */
.big .body { font-size: 11.2pt; }
.big p { margin-bottom: 3.4mm; }
.big table.t { font-size: 9.9pt; } .big table.t td { padding: 3.3mm 3mm 3.3mm 0; }
.big ul.l li { margin-bottom: 2.4mm; }
.big .call { font-size: 10.2pt; padding: 4.4mm 5mm; }
.big .card p { font-size: 10pt; } .big .card h4 { font-size: 16pt; }
.big .flow .st b { font-size: 10.6pt; } .big .flow .st span.d { font-size: 9.2pt; }
.big .lead { font-size: 15.5pt; max-width: 135mm; }
.big h2.s { font-size: 21pt; margin-top: 8mm; }
.big h1.d { font-size: 40pt; }
.big .check li { font-size: 11.4pt; }
.big .quote { font-size: 17pt; margin: 8mm 0; }
.big .eyebrow { margin-bottom: 6mm; }
/* anatomia del token */
.anat { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3mm; margin: 3mm 0 4mm; }
.anat div { border-radius: 4mm; padding: 4mm; font-size: 8pt; line-height: 1.45; }
.anat .h { background: #F8E8EC; } .anat .p { background: #E2F4EA; } .anat .f { background: #FFF1E6; }
.anat b { display: block; font-family: 'Instrument Serif', serif; font-weight: 400; font-style: italic; font-size: 14pt; margin-bottom: 1mm; }
.anat .h b { color: var(--violet); } .anat .p b { color: #12804a; } .anat .f b { color: #C2570C; }
.bigword { font-family: 'Instrument Serif', serif; font-size: 60pt; line-height: .95; color: var(--lilac); margin: 8mm 0 2mm; }
/* scala dei voti */
.scale { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1.1fr; gap: 1.2mm; margin: 3mm 0 1mm; }
.scale div { background: var(--card); border-radius: 2.4mm; padding: 2.4mm 2mm; text-align: center; }
.scale .v { display: block; font-family: 'Instrument Serif', serif; font-size: 15pt; line-height: 1; color: var(--violet); }
.scale .t { display: block; font-size: 6.3pt; letter-spacing: .12em; text-transform: uppercase; color: var(--mute); margin-top: 1.2mm; }
.scale .top { background: var(--violet); } .scale .top .v, .scale .top .t { color: #fff; }
.sw { display: inline-block; width: 3.6mm; height: 3.6mm; border-radius: 50%; vertical-align: -.8mm; margin-right: 1.4mm; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; }
.check { list-style: none; margin: 2mm 0; }
.check li { position: relative; padding-left: 8.5mm; margin-bottom: 4.6mm; font-size: 10.4pt; line-height: 1.45; }
.check li::before { content: ""; position: absolute; left: 0; top: .1mm; width: 5mm; height: 5mm; border: .35mm solid var(--violet); border-radius: 1.2mm; }
`;

function page(opts, inner) {
  const { cls = "paper", label = "", doc = "", n = 0, big = false } = opts;
  const frame = `<div class="frame"><span class="c a">${ROMBO}</span><span class="c b">${ROMBO}</span><span class="c c2">${ROMBO}</span><span class="c d">${ROMBO}</span></div>`;
  return `<section class="page ${cls}${big ? " big" : ""}">${frame}<div class="run"><span>${esc(doc)}</span><span>${esc(label)}</span></div><div class="body">${inner}</div><div class="foot"><span>${esc(doc)} · v${VERSIONE} · ${esc(DATA)}</span><span class="n">${n}</span></div></section>`;
}
function cover({ titolo, sotto, tipo, doc }) {
  return `<section class="page cover"><div class="frame"><span class="c a">${ROMBO}</span><span class="c b">${ROMBO}</span><span class="c c2">${ROMBO}</span><span class="c d">${ROMBO}</span></div>
  <div class="big100">100</div><div class="mk">${MARCHIO}</div><div class="brand">il taccuino di degustazione<b>Sorso</b></div>
  <div class="titolo"><div class="orn"><span></span>${ROMBO}<span></span></div><h1>${titolo}</h1><div class="sot">${sotto}</div></div>
  <div class="piede"><span>${esc(tipo)}</span><span>Versione ${VERSIONE} · ${esc(DATA)}</span></div></section>`;
}
const eyebrow = (n, t) => `<div class="eyebrow"><i>${n}</i> ${esc(t)}</div>`;
const phone = (file, cls = "") => `<div class="phone ${cls}"><div class="scr"><img src="${img(file)}"></div></div>`;
const fig = (file, nb, testo, cls = "") => `<div class="fig">${phone(file, cls)}<div class="cap"><span class="nb">${nb}</span><span>${testo}</span></div></div>`;
const stats = list => `<div class="stats">${list.map(([v, t]) => `<div><span class="v">${v}</span><span class="t">${t}</span></div>`).join("")}</div>`;
const cards = (list, n = 3) => `<div class="cards${n}">${list.map(([t, p]) => `<div class="card"><h4>${t}</h4><p>${p}</p></div>`).join("")}</div>`;
const table = (head, rows, w) => `<table class="t"><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${w && w.includes(i) ? ' class="w"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const call = (t, warn) => `<div class="call${warn ? " warn" : ""}">${t}</div>`;
const quote = t => `<div class="quote">${t}</div>`;
const ul = list => `<ul class="l">${list.map(x => `<li>${x}</li>`).join("")}</ul>`;
const check = list => `<ul class="check">${list.map(x => `<li>${x}</li>`).join("")}</ul>`;
function code(text, tag, evidenzia = true) {
  /* evidenziazione minima: commenti e stringhe, riconosciuti sul testo vero (non sull'HTML già scritto) */
  let out = "", i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (evidenzia && (ch === '"' || ch === "'") && !(ch === "'" && /\w/.test(text[i - 1] || ""))) {
      let j = i + 1;
      while (j < n && text[j] !== ch && text[j] !== "\n") { if (text[j] === "\\") j++; j++; }
      out += '<span class="s">' + esc(text.slice(i, j + 1)) + "</span>"; i = j + 1; continue;
    }
    const inizioRiga = i === 0 || /[\s]/.test(text[i - 1]);
    if (evidenzia && ((ch === "/" && text[i + 1] === "/" && text[i - 1] !== ":") || (ch === "#" && inizioRiga && text[i + 1] !== "!"))) {
      let j = i; while (j < n && text[j] !== "\n") j++;
      out += '<span class="c">' + esc(text.slice(i, j)) + "</span>"; i = j; continue;
    }
    if (evidenzia && ch === "<" && text.startsWith("<!--", i)) {
      let j = text.indexOf("-->", i); j = j < 0 ? n : j + 3;
      out += '<span class="c">' + esc(text.slice(i, j)) + "</span>"; i = j; continue;
    }
    out += esc(ch); i++;
  }
  return `<pre class="code">${tag ? `<span class="tag">${tag}</span>` : ""}${out}</pre>`;
}
function esempio(nome, tag) { return code(fs.readFileSync(path.join(__dirname, "..", "esempi", nome), "utf8").replace(/DOMINIO-SORSO/g, BASE.replace("https://", "")).trimEnd(), tag); }
function documento(titolo, pagine) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(titolo)}</title><style>${CSS}</style></head><body>${pagine.join("\n")}</body></html>`;
}
const anat = () => `<div class="anat"><div class="h"><b>header</b>L'algoritmo: sempre <code>HS256</code>, tipo <code>JWT</code>.</div><div class="p"><b>payload</b>Chi è l'utente, in che gruppo, con che ruolo, fino a quando vale: i campi qui sopra.</div><div class="f"><b>firma</b>Calcolata con il tuo segreto: solo tu e Sorso potete produrla.</div></div>`;
module.exports = { anat, page, cover, eyebrow, phone, fig, stats, cards, table, call, quote, ul, check, code, esempio, documento, esc, MARCHIO, DATA, VERSIONE, BASE, img };
