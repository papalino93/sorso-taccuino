#!/usr/bin/env node
/* Scrive in public/index.html i colori predefiniti (a vino) ricavati da public/js/theme.js,
   così la pagina nasce già con i colori giusti e non c'è nessun lampo prima che parta il JavaScript.
   Uso:  node scripts/theme-css.js          (riscrive il blocco)
         node scripts/theme-css.js --check  (esce con errore se il blocco non è aggiornato) */
const fs = require("fs"), path = require("path");
const Theme = require("../public/js/theme.js");
const FILE = path.join(__dirname, "..", "public", "index.html");
const BEGIN = "/* THEME-DEFAULTS-BEGIN (generato da scripts/theme-css.js: non modificare a mano) */";
const END = "/* THEME-DEFAULTS-END */";

function block() {
  const css = dark => {
    const d = Theme.derive({ dark });
    return Object.keys(d.vars).map(k => k + ":" + d.vars[k]).join(";");
  };
  return BEGIN + "\n  #root{" + css(false) + ";}\n  #root.dark{" + css(true) + ";}\n  " + END;
}
function apply(html) {
  const a = html.indexOf(BEGIN), b = html.indexOf(END);
  if (a >= 0 && b > a) return html.slice(0, a) + block() + html.slice(b + END.length);
  const i = html.indexOf("</style>");
  return html.slice(0, i) + "  " + block() + "\n" + html.slice(i);
}
const html = fs.readFileSync(FILE, "utf8"), out = apply(html);
if (process.argv.includes("--check")) {
  if (out !== html) { console.error("I colori predefiniti in index.html non corrispondono a js/theme.js: esegui node scripts/theme-css.js"); process.exit(1); }
  console.log("colori predefiniti aggiornati");
} else { fs.writeFileSync(FILE, out); console.log("blocco colori scritto"); }
