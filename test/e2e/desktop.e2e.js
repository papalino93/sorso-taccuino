/* Vista da PC (schermi larghi). App su localhost:8765. */
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const fs = require("fs"), path = require("path");
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "desktop-seed.json"), "utf8"));
let fails = 0; const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };
const TABS = ["new", "blind", "book", "stats", "circles", "settings"];
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const errs = [];
  async function open(w, h, scheme) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme || "light" });
    const page = await ctx.newPage();
    page.on("pageerror", e => errs.push(w + ": " + e.message));
    await page.addInitScript(o => { if (!localStorage.getItem("seeded")) { localStorage.setItem("sorso.auth.skipped", "1"); Object.keys(o).forEach(k => localStorage.setItem(k, JSON.stringify(o[k]))); localStorage.setItem("seeded", "1"); localStorage.setItem("sorso-nota-scala2", "1"); } }, seed);
    await page.goto("http://localhost:8765/", { waitUntil: "load" }); await page.waitForTimeout(800);
    return { ctx, page };
  }
  const go = async (page, t, w) => { if (w < 1100 && t === "settings") await page.click("#settingsBtn"); else await page.click(`#nav [data-tab="${t}"]`); await page.waitForTimeout(350); };

  /* nessun elemento fuori dallo schermo, a nessuna larghezza, in nessuna scheda */
  for (const [w, h] of [[1100, 760], [1280, 720], [1440, 900], [1920, 1080], [2560, 1300]]) {
    const { ctx, page } = await open(w, h);
    for (const t of TABS) {
      await go(page, t, w);
      const r = await page.evaluate(() => {
        const body = document.querySelector(".body").getBoundingClientRect(), bad = [];
        document.querySelectorAll(".body *").forEach(e => { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden") return; const b = e.getBoundingClientRect(); if (b.width && b.height && (b.right > body.right + 1 || b.left < body.left - 1) && !e.closest(".ac-box")) bad.push(e.tagName + "." + e.className); });
        return { x: document.documentElement.scrollWidth > document.documentElement.clientWidth, bad: bad.slice(0, 5) };
      });
      ok(!r.x && r.bad.length === 0, w + "px · " + t + ": niente esce dallo schermo " + JSON.stringify(r.bad));
    }
    await ctx.close();
  }

  /* struttura a 1440 */
  {
    const { ctx, page } = await open(1440, 900);
    const box = s => page.evaluate(s => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; }, s);
    const nav = await box("#nav"), body = await box(".body");
    ok(nav.r <= body.l + 1, "il menù sta a sinistra del contenuto");
    const dsk = await page.evaluate(() => document.querySelectorAll("#nav button").length);
    ok(dsk === 6, "voci del menù: 5 sezioni + Impostazioni");
    const sv = await box("#saveBtn"), score = await box("#ringNum");
    ok(sv.b <= 900 && sv.t >= 0 && score.b <= 900, "«Salva» e il punteggio sono sempre in vista");
    const cols = await page.evaluate(() => { const a = document.querySelector("#labelCard").getBoundingClientRect(), b = document.querySelector("#sectionsWrap").getBoundingClientRect(); return b.left > a.right; });
    ok(cols, "Nuova: scheda a due colonne");
    /* Taccuino: elenco + dettaglio */
    await go(page, "book", 1440);
    const first = await page.evaluate(() => { const r = document.querySelector("#bookList .wine-row").getBoundingClientRect(), d = document.querySelector("#bookList .wine-detail"); return { listRight: r.right, det: d && d.getBoundingClientRect().left, name: d && d.querySelector(".dt-name").textContent }; });
    ok(first.det > first.listRight, "Taccuino: il dettaglio sta a destra dell'elenco (" + first.name + ")");
    await page.locator("#bookList .wine-mid").nth(2).click(); await page.waitForTimeout(200);
    const second = await page.locator("#bookList .wine-detail .dt-name").textContent();
    ok(second !== first.name, "scegliendo un altro vino il dettaglio cambia (" + second + ")");
    ok((await page.locator("#bookList .wine-row.sel").count()) === 1, "una sola riga evidenziata");
    /* confronto tra due vini: testi leggibili (prima erano chiari su fondo chiaro) */
    await page.locator("#bookList .wine-score").nth(0).click(); await page.locator("#bookList .wine-score").nth(1).click(); await page.waitForTimeout(250);
    const lum = c => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
    const cc = await page.evaluate(() => { const cs = e => getComputedStyle(document.querySelector(e)); return [cs(".cmp-lab").color, cs(".cmp-l").color, cs(".cmp-meta").color, cs(".cmp").backgroundColor]; });
    const ct = c => (Math.max(lum(c[0]), lum(c[3])) + .05) / (Math.min(lum(c[0]), lum(c[3])) + .05);
    ok(ct([cc[0], 0, 0, cc[3]]) >= 4.5 && ct([cc[1], 0, 0, cc[3]]) >= 4.5 && ct([cc[2], 0, 0, cc[3]]) >= 4.5, "confronto: testi leggibili sul fondo " + cc.join(" | "));
    await page.locator("#cmpClose").click();
    /* il riquadro dei contenuti torna in cima quando si cambia scheda */
    await go(page, "stats", 1440); await page.evaluate(() => document.querySelector(".body").scrollTo(0, 600)); await go(page, "new", 1440);
    ok((await page.evaluate(() => document.querySelector(".body").scrollTop)) === 0, "cambiando scheda si riparte dall'alto");
    /* punteggio 96+: il rail non diventa illeggibile (marchio e comandi restano scuri sul fondo chiaro) */
    await page.click('#modeTopWrap button[data-modalita="smart"]');
    await page.evaluate(() => document.querySelectorAll("[data-smart-range]").forEach(el => { el.value = 100; el.dispatchEvent(new Event("input", { bubbles: true })); }));
    await page.waitForTimeout(250);
    const fl = await page.evaluate(() => ({ flood: document.querySelector(".hdr").classList.contains("flood"), brand: getComputedStyle(document.querySelector(".brand-name")).color, panel: getComputedStyle(document.querySelector(".panel")).getPropertyValue("--panel").trim() }));
    ok(fl.flood && fl.brand !== "rgb(255, 255, 255)", "punteggio 100: marchio leggibile nel menù (" + fl.brand + ")");
    await page.click("#resetBtn");
    /* Impostazioni */
    await go(page, "settings", 1440);
    ok(await page.locator("#lookCard").isVisible() && await page.locator("#voteModeCard").isVisible() && await page.locator("#accountCard").isVisible(), "Impostazioni: aspetto, voto e account in una pagina");
    /* palette a vino */
    const acc = await page.evaluate(() => getComputedStyle(document.getElementById("root")).getPropertyValue("--accent").trim());
    ok(acc === "#8c1d3f", "chiaro: bordeaux (" + acc + ")");
    await ctx.close();
  }
  /* scuro a vino */
  {
    const { ctx, page } = await open(1440, 900, "dark");
    await page.locator("#themeDark").click();
    const v = await page.evaluate(() => { const g = n => getComputedStyle(document.getElementById("root")).getPropertyValue(n).trim(); return [g("--accent"), g("--panel")]; });
    ok(v[0] === "#c8385c" && v[1] === "#0f080b", "scuro: ciliegia su nero-vino " + v);
    await ctx.close();
  }
  /* sotto i 1100px resta il telefono */
  for (const [w, h] of [[390, 844], [768, 1024], [1099, 800]]) {
    const { ctx, page } = await open(w, h);
    const m = await page.evaluate(() => { const n = [...document.querySelectorAll("#nav button")].filter(b => getComputedStyle(b).display !== "none"); const ys = new Set(n.map(b => Math.round(b.getBoundingClientRect().top))); return { n: n.length, rows: ys.size, gear: getComputedStyle(document.getElementById("settingsBtn")).display !== "none", head: getComputedStyle(document.querySelector(".pane-head")).display }; });
    ok(m.n === 5 && m.rows === 1 && m.gear && m.head === "none", w + "px: barra in alto a 5 voci, ingranaggio visibile, niente titoli di pagina");
    await go(page, "settings", w);
    ok(await page.locator("#lookCard").isVisible(), w + "px: Impostazioni raggiungibile dall'ingranaggio");
    await ctx.close();
  }
  ok(errs.length === 0, "nessun errore JavaScript " + JSON.stringify(errs));
  await browser.close();
  console.log(fails ? "\n" + fails + " CONTROLLI FALLITI" : "\nTUTTO OK");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
