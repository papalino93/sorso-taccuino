/* Seconda serie di controlli UX dell'app personale (schede con soli punti di fase, arrotondamenti,
   focus da tastiera, prove alla cieca). App su localhost:8765:
     python3 -m http.server 8765 --directory public &   node test/e2e/ux-app2.e2e.js */
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
let fails = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };
const base = (nome, extra) => Object.assign({ nome, produttore:"", annata:"2020", tipologia:"Rosso", denominazione:"Chianti DOCG", regione:"", prezzo:25, affinamento:"", uvaggi:[],
  limpidezza:"Limpido", colore:"Rosso rubino", consistenza:"Abbastanza consistente", zuccheri:"Secco", stato:"Pronto", durezze:{acidita:3,tannicita:3,sapidita:3},
  morbidezze:{alcolicita:3,morbidezza:3}, intensita:3, corpo:3, desc:[], note:"", abbinamento:"", timestamp: Date.now() }, extra);
const seed = {
  "sorso.p.degustazione:1-aaa": base("Solo parts", { parts:{v:8,o:24,g:32,a:16}, score:80, modello:2, timestamp:1000 }),
  "sorso.p.degustazione:2-bbb": base("Solo totale", { score:41, modello:1, timestamp:2000 })
};
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await page.addInitScript(([o]) => { if (!localStorage.getItem("seeded")) { localStorage.setItem("sorso.auth.skipped", "1"); Object.keys(o).forEach(k => localStorage.setItem(k, JSON.stringify(o[k]))); localStorage.setItem("seeded", "1"); } }, [seed]);
  await page.goto("http://localhost:8765/", { waitUntil: "load" }); await page.waitForTimeout(1000);
  const rec = k => page.evaluate(key => JSON.parse(localStorage.getItem("sorso.p." + key)), k);

  /* scheda con soli punti di fase: la modifica non fa scendere il punteggio */
  await page.click('#nav [data-tab="book"]');
  await page.locator(".wine-row", { hasText: "Solo parts" }).locator(".wine-mid").click();
  await page.click("[data-edit]");
  ok(await page.locator("#frozenNote").isVisible() && (await page.locator("#ringNum").textContent()) === "82", "soli punti di fase: la modifica si apre sul punteggio vero (82), con l'avviso");
  await page.click("#saveBtn"); await page.waitForTimeout(500);
  let r = await rec("degustazione:1-aaa");
  ok(r.score === 82 && r.parts && r.parts.a === 16 && r.legacyTotal === 80, "salvando senza toccare i giudizi: 82, punti di fase e precedente 80 intatti (" + JSON.stringify({ s: r.score, p: r.parts }) + ")");

  /* cambiare modalità due volte e tornare: il punteggio non cambia */
  await page.locator(".wine-row", { hasText: "Solo totale" }).locator(".wine-mid").click();
  await page.click("[data-edit]");
  await page.click('#modeTopWrap button[data-modalita="smart"]');
  await page.click('#modeTopWrap button[data-modalita="completa"]');
  await page.click("#saveBtn"); await page.waitForTimeout(500);
  r = await rec("degustazione:2-bbb");
  ok(r.score === 58 && !r.voti, "smart → completa → salva: il punteggio resta 58, nessun voto inventato");

  /* arrotondamenti */
  const f = await page.evaluate(() => ({ e: euro(10.005), e2: euro(49.835), d: dec(-0.04), d2: dec(79.45), j: judge(79.5), j2: judge(89.5) }));
  ok(f.e.indexOf("10,01") === 0 && f.e2.indexOf("49,84") === 0, "euro: 10,005 → 10,01 e 49,835 → 49,84 (" + f.e + ", " + f.e2 + ")");
  ok(f.d === "0,0" && f.d2 === "79,5", "decimali: niente -0,0, 79,45 → 79,5 (" + f.d + ", " + f.d2 + ")");
  ok(f.j === "Discreto" && f.j2 === "Buono", "la parola di fascia segue il valore mostrato: 79,5 discreto, 89,5 buono (" + f.j + ", " + f.j2 + ")");
  const b = await page.evaluate(() => boccaOf(fasiOf({ modello:4, voti:{ v:{qualita:0}, o:{intensita:0,complessita:0,qualita:0}, g:{equilibrio:0,intensita:1,persistenza:0,qualita:0}, f:{armonia:0} } })));
  ok(Number.isInteger(b), "bocca nel confronto: un solo arrotondamento (" + b + ")");

  /* focus da tastiera dopo un voto 0-10 e dopo un filtro */
  await page.click('#nav [data-tab="new"]');
  await page.click('#modeTopWrap button[data-modalita="completa"]');
  if ((await page.getAttribute('[data-sec="vis"]', "aria-expanded")) !== "true") await page.click('[data-sec="vis"]');
  const bt = page.locator('button[data-rate^="s:v.qualita"][data-n="9"]');
  await bt.focus(); await page.keyboard.press("Enter");
  const att = await page.evaluate(() => { const a = document.activeElement; return a && a.dataset && a.dataset.n; });
  ok(att === "9", "dopo Invio su un voto 0-10 il focus resta su quel tasto");
  await page.click('#nav [data-tab="book"]');
  await page.locator('[data-filter="Rosso"]').focus(); await page.keyboard.press("Enter");
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.filter) === "Rosso", "dopo un filtro il focus resta sul filtro");
  ok((await page.getAttribute('[data-filter="Rosso"]', "aria-pressed")) === "true" && (await page.getAttribute('#nav [data-tab="book"]', "aria-current")) === "page", "stato selezionato annunciato (aria-pressed, aria-current)");

  ok(errors.length === 0, "nessun errore JavaScript: " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? "\n" + fails + " CONTROLLI FALLITI" : "\nTUTTO OK");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
