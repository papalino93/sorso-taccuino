/* Banco di prova della lettura delle etichette: legge le foto di una cartella con la stessa pipeline dell'app
   (LabelOCR + LabelReader) e stampa riquadro trovato, righe lette e campi proposti.
   Serve l'app su localhost:8765 e la rete (motore OCR).   node scripts/label-bench.js <cartella-con-le-foto> */
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const fs = require("fs"), path = require("path");
const dir = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await (await b.newContext()).newPage();
  await p.goto("http://localhost:8765/", { waitUntil: "load" }); await p.waitForTimeout(500);
  for (const f of fs.readdirSync(dir).filter(x => /\.jpe?g$/i.test(x)).sort()) {
    const data = "data:image/jpeg;base64," + fs.readFileSync(path.join(dir, f)).toString("base64");
    const t0 = Date.now();
    const r = await p.evaluate(async src => {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const o = await LabelOCR.read(img, {});
      const parsed = LabelReader.parseLabel(o.text, o.lines);
      return { conf: Math.round(o.conf), text: o.text, crop: o.crop, lines: o.lines, fields: LabelReader.toWineFields(parsed) };
    }, data);
    console.log("=== " + f + " (" + ((Date.now() - t0) / 1000).toFixed(1) + "s, affidabilità " + r.conf + ")");
    console.log("TESTO: " + r.text.replace(/\n+/g, " | ").slice(0, 400));
    console.log("RITAGLIO: " + JSON.stringify(r.crop)); console.log("CAMPI: " + JSON.stringify(r.fields)); console.log("RIGHE: " + JSON.stringify((r.lines||[]).map(l => l.text + " h" + Math.round(l.h) + " c" + Math.round(l.conf) + " x" + (l.hits||1))));
  }
  await b.close();
})();
