/* Genera i PDF delle guide: HTML (lib.js + contenuti) stampato con Chromium.
   Prima servono le schermate:  node docs/guide/shots.js  e  node docs/guide/shots-app.js docs/guide/img
   Uso:  node docs/guide/build.js [integrazione|gestore|attivazione ...] */
const fs = require("fs");
const path = require("path");
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const DOCS = { integrazione: ["integrazione.js", "guida-integrazione-sorso.pdf"], gestore: ["gestore.js", "guida-gestione-degustazioni.pdf"], attivazione: ["attivazione.js", "guida-attivazione-api.pdf"], utente: ["utente.js", "guida-uso-sorso.pdf"], cerchie: ["cerchie.js", "guida-cerchie.pdf"] };
(async () => {
  const quali = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(DOCS);
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  /* le schermate PNG (780 px, 110 KB l'una) diventano JPEG da ~520 px: il PDF pesa un quarto e si sfoglia al volo */
  const jdir = path.join(__dirname, "img", "jpg"); fs.mkdirSync(jdir, { recursive: true });
  const conv = await browser.newPage();
  for (const f of fs.readdirSync(path.join(__dirname, "img")).filter(f => f.endsWith(".png"))) {
    const out = path.join(jdir, f.replace(/\.png$/, ".jpg"));
    const src = path.join(__dirname, "img", f);
    if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) continue;
    const b64 = await conv.evaluate(async d => {
      const im = new Image(); im.src = d; await im.decode();
      const w = Math.min(im.naturalWidth > 1500 ? 1100 : 520, im.naturalWidth), h = Math.round(im.naturalHeight * w / im.naturalWidth);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
      return c.toDataURL("image/jpeg", 0.78).split(",")[1];
    }, "data:image/png;base64," + fs.readFileSync(src).toString("base64"));
    fs.writeFileSync(out, Buffer.from(b64, "base64"));
  }
  await conv.close();
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
    /* la guida all'uso si scarica dall'app (Impostazioni → Guida): ne serve una copia servita da /public */
    if (k === "utente") fs.copyFileSync(path.join(__dirname, "..", out), path.join(__dirname, "..", "..", "public", out));
    console.log("scritto", out);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
