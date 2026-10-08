/* Genera i PDF delle guide: HTML (lib.js + contenuti) stampato con Chromium.
   Prima servono le schermate:  node docs/guide/shots.js  e  node docs/guide/shots-app.js docs/guide/img
   Uso:  node docs/guide/build.js [integrazione|gestore|attivazione ...] */
const fs = require("fs");
const path = require("path");
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const DOCS = { integrazione: ["integrazione.js", "guida-integrazione-sorso.pdf"], gestore: ["gestore.js", "guida-gestione-degustazioni.pdf"], attivazione: ["attivazione.js", "guida-attivazione-api.pdf"] };
(async () => {
  const quali = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(DOCS);
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const k of quali) {
    const [mod, out] = DOCS[k];
    const html = require("./" + mod).build();
    const tmp = path.join(__dirname, "_" + k + ".html");
    fs.writeFileSync(tmp, html);
    const page = await browser.newPage();
    await page.goto("file://" + tmp, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    /* controllo: nessun contenuto deve uscire dal riquadro della pagina */
    const fuori = await page.evaluate(() => [...document.querySelectorAll(".page")].map((pg, i) => {
      const b = pg.querySelector(".body"); if (!b) return null;
      const lim = b.getBoundingClientRect().bottom; let max = 0;
      b.querySelectorAll("*").forEach(e => { const r = e.getBoundingClientRect(); if (r.height && r.bottom > max) max = r.bottom; });
      return max > lim + 2 ? { pagina: i + 1, eccesso_mm: Math.round((max - lim) / 3.78 * 10) / 10 } : null;
    }).filter(Boolean));
    if (fuori.length) console.log("ATTENZIONE contenuto oltre il riquadro in " + k + ":", JSON.stringify(fuori));
    await page.pdf({ path: path.join(__dirname, "..", out), preferCSSPageSize: true, printBackground: true });
    await page.close();
    fs.unlinkSync(tmp);
    console.log("scritto", out);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
