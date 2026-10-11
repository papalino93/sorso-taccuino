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
  const go = async (page, t, w) => { if (t === "settings") await page.click("#settingsBtn"); else await page.click(`#nav [data-tab="${t}"]`); await page.waitForTimeout(350); };

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
    ok(nav.b <= body.t + 1, "il menù sta in alto, sopra il contenuto");
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
    /* punteggio 96+: la barra in alto si stacca dalla pagina (tinta neutra, bordo) e tutto ciò che ci sta sopra si legge */
    await page.click('#modeTopWrap button[data-modalita="smart"]');
    await page.evaluate(() => document.querySelectorAll("[data-smart-range]").forEach(el => { el.value = 100; el.dispatchEvent(new Event("input", { bubbles: true })); }));
    await page.waitForTimeout(250);
    const fl = await page.evaluate(() => {
      const bar = getComputedStyle(document.querySelector(".panel"), "::after"), cs = e => getComputedStyle(document.querySelector(e));
      const rgb = c => { const k = document.createElement("canvas").getContext("2d"); k.fillStyle = c; k.fillRect(0, 0, 1, 1); const d = k.getImageData(0, 0, 1, 1).data; return "rgb(" + d[0] + ", " + d[1] + ", " + d[2] + ")"; };
      return { flood: document.querySelector(".hdr").classList.contains("flood"), bar: rgb(bar.backgroundColor), border: bar.borderBottomWidth, page: cs(".body").backgroundColor === "rgba(0, 0, 0, 0)" ? cs(".panel").getPropertyValue("--panel").trim() : cs(".body").backgroundColor,
        txt: [".brand-name", "#nav button:not(.on) .lbl", ".hdr-ctrl .lang-switch button:not(.on)", ".hdr-ctrl .gear-btn"].map(e => cs(e).color), on: [cs("#nav button.on .lbl").color, cs("#nav button.on").backgroundColor] };
    });
    ok(fl.flood, "punteggio 100: rail a tutto colore");
    ok(fl.bar !== "rgba(0, 0, 0, 0)" && parseFloat(fl.border) >= 1, "la barra in alto ha una tinta propria e un bordo (" + fl.bar + ")");
    ok(fl.txt.every(c => ct([c, 0, 0, fl.bar]) >= 4.5) && ct([fl.on[0], 0, 0, fl.on[1]]) >= 4.5, "marchio, voci e comandi si leggono sulla barra " + fl.txt.join(" | "));
    await page.click("#resetBtn");
    /* Impostazioni */
    await go(page, "settings", 1440);
    ok(await page.locator("#lookCard").isVisible() && await page.locator("#voteModeCard").isVisible() && await page.locator("#accountCard").isVisible(), "Impostazioni: aspetto, voto e account in una pagina");
    /* barra in alto, come in Team: marchio e sezioni a sinistra, Aspetto/tema/lingua/impostazioni/utente a destra */
    const bar = await page.evaluate(() => {
      const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
      const nav = [...document.querySelectorAll("#nav button")].filter(b => getComputedStyle(b).display !== "none").map(b => b.getBoundingClientRect());
      const ctrl = r(".hdr-ctrl"), last = nav[nav.length - 1], brand = r("#brandBtn"), body = r(".body");
      return { n: nav.length, sameRow: new Set(nav.map(b => Math.round(b.top))).size === 1, navTop: nav[0].top, ctrlLeft: ctrl.left, navRight: last.right, brandTop: brand.top, bodyTop: body.top, look: !!r("#lookBtn") && r("#lookBtn").width > 0, gear: r("#settingsBtn").width > 0, avatar: r("#avatarBtn").width > 0 };
    });
    ok(bar.n === 5 && bar.sameRow && bar.navTop < 64 && bar.brandTop < 64 && bar.bodyTop >= 60, "PC: sezioni in fila nella barra in alto (" + bar.n + " voci)");
    ok(bar.navRight < bar.ctrlLeft && bar.look && bar.gear && bar.avatar, "PC: i comandi a destra (Aspetto, impostazioni, utente) non coprono le sezioni");
    /* tavolozza ≠ ingranaggio: la tavolozza apre il pannello rapido sotto la barra, senza cambiare pagina */
    const tabBefore = await page.evaluate(() => S.tab);
    await page.click("#lookBtn"); await page.waitForTimeout(300);
    ok(await page.locator("#lookPop").isVisible() && (await page.evaluate(() => S.tab)) === tabBefore, "la tavolozza apre i colori rapidi, resto nella stessa scheda");
    ok(await page.locator("#popAccent [data-accent]").count() >= 4 && await page.locator("#popBg [data-bg]").count() >= 3, "nel pannello: colori d'accento e sfondi");
    const lp = await page.evaluate(() => { const r = document.getElementById("lookPop").getBoundingClientRect(); return { r: r.right, b: r.bottom, el: (() => { const e = document.elementFromPoint(r.left + 20, r.top + 30); return !!(e && e.closest("#lookPop")); })() }; });
    ok(lp.r <= 1440 && lp.el, "il pannello sta dentro lo schermo e niente lo copre");
    const accBefore = await page.evaluate(() => getComputedStyle(document.getElementById("root")).getPropertyValue("--sel-bg").trim());
    await page.locator('#popAccent [data-accent]').nth(2).click(); await page.waitForTimeout(200);
    ok((await page.evaluate(() => getComputedStyle(document.getElementById("root")).getPropertyValue("--sel-bg").trim())) !== accBefore && await page.locator("#lookPop").isVisible(), "un colore del pannello si applica subito e il pannello resta aperto");
    await page.keyboard.press("Escape"); await page.waitForTimeout(150);
    ok(!(await page.locator("#lookPop").isVisible()), "Esc chiude il pannello");
    await page.evaluate(() => { localStorage.removeItem("sorso-colori"); }); await page.reload(); await page.waitForTimeout(700);
    await page.click("#lookBtn"); await page.click("#popMoreBtn"); await page.waitForTimeout(500);
    ok(await page.locator("#lookCard").isVisible(), "«Tutte le opzioni dei colori» porta alle Impostazioni");
    await page.click("#settingsBtn"); await page.waitForTimeout(300);
    ok(!(await page.locator("#lookPop").isVisible()), "l'ingranaggio porta alle Impostazioni (il pannello è chiuso)");
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
    ok(await page.evaluate(() => getComputedStyle(document.getElementById("lookBtn")).display === "none"), w + "px: sul telefono il pulsante Aspetto non compare (ci sono le Impostazioni)");
    await go(page, "settings", w);
    ok(await page.locator("#lookCard").isVisible(), w + "px: Impostazioni raggiungibile dall'ingranaggio");
    await ctx.close();
  }
  ok(errs.length === 0, "nessun errore JavaScript " + JSON.stringify(errs));
  await browser.close();
  console.log(fails ? "\n" + fails + " CONTROLLI FALLITI" : "\nTUTTO OK");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
