/* Test nel browser delle correzioni UX dell'app personale (v1.3.x).
   Richiede Playwright globale e l'app servita su localhost:8765:
     python3 -m http.server 8765 --directory public &
     node test/e2e/ux-app.e2e.js */
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const URL = "http://localhost:8765/";
let fails = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };

const tutti = n => ({ v:{qualita:n}, o:{intensita:n,complessita:n,qualita:n}, g:{equilibrio:n,intensita:n,persistenza:n,qualita:n}, f:{armonia:n} });
const base = (nome, extra) => Object.assign({ nome, produttore:"", annata:"2020", tipologia:"Rosso", denominazione:"", regione:"",
  prezzo:null, affinamento:"", uvaggi:[], limpidezza:"Limpido", colore:"Rosso rubino", consistenza:"Abbastanza consistente",
  zuccheri:"Secco", stato:"Pronto", durezze:{acidita:3,tannicita:3,sapidita:3}, morbidezze:{alcolicita:3,morbidezza:3},
  intensita:3, corpo:3, desc:[], note:"", abbinamento:"", timestamp: Date.now() }, extra);
const seed = {
  "sorso.p.degustazione:1-aaa": base("Solo totale", { score:41, modello:1, timestamp: 1000 }),
  "sorso.p.degustazione:2-bbb": base("Completo", { voti: tutti(8), parts:{v:8,o:24,g:32,f:16}, score:82, scoreScale:2, modello:4, modalita:"completa", timestamp: 2000 }),
  "sorso.p.cieca:1-ccc": { ipotesi:{tipologia:"Rosso",vitigno:"",regione:"",annata:"",nome:""}, etichetta:"Prova uno", limpidezza:"Limpido", colore:"Rosso rubino",
    consistenza:"Abbastanza consistente", zuccheri:"Secco", stato:"Pronto", durezze:{acidita:3,tannicita:3,sapidita:3}, morbidezze:{alcolicita:3,morbidezza:3},
    intensita:3, corpo:3, desc:[], note:"", voti:tutti(6), parts:{v:6,o:18,g:24,f:12}, score:68, scoreScale:2, modello:4, modalita:"completa", timestamp:3000 }
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], dialogs = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/_vercel|404/.test(m.text())) errors.push("console: " + m.text()); });
  let rispondi = true;
  page.on("dialog", d => { dialogs.push(d.message()); rispondi ? d.accept() : d.dismiss(); });
  await page.addInitScript(([seedObj]) => {
    if (!localStorage.getItem("seeded")) {
      localStorage.setItem("sorso.auth.skipped", "1");
      Object.keys(seedObj).forEach(k => localStorage.setItem(k, JSON.stringify(seedObj[k])));
      localStorage.setItem("seeded", "1");
    }
  }, [seed]);
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const stored = key => page.evaluate(k => JSON.parse(localStorage.getItem("sorso.p." + k)), key);
  const storedKeys = prefix => page.evaluate(p => Object.keys(localStorage).filter(k => k.indexOf("sorso.p." + p) === 0), prefix);

  /* --- nota della scala: resta finché non si preme "Ho capito", anche dopo un ricarico --- */
  ok(await page.locator("#scaleNote").isVisible(), "nota 'punteggi ricalcolati' visibile");
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(900);
  ok(await page.locator("#scaleNote").isVisible(), "ricaricando senza confermare, la nota resta");

  /* --- modifica della scheda con solo il totale --- */
  await page.click('#nav [data-tab="book"]');
  await page.locator(".wine-row", { hasText: "Solo totale" }).locator(".wine-mid").click();
  const dettaglio = await page.locator(".wine-detail").first().textContent();
  ok(!/visivo \d+/i.test(dettaglio) && /dettaglio per fase non è disponibile/.test(dettaglio), "nessuna fase inventata sulla scheda con solo totale: " + dettaglio.replace(/\s+/g, " ").slice(0, 90));
  await page.click('[data-edit]');
  ok(await page.locator("#frozenNote").isVisible(), "avviso: la scheda ha solo il punteggio finale");
  ok((await page.locator("#ringNum").textContent()) === "58", "l'intestazione mostra il punteggio vero (58), non 68");
  await page.click("#saveBtn");
  await page.waitForTimeout(500);
  let r = await stored("degustazione:1-aaa");
  ok(r.score === 58 && r.legacyTotal === 41 && !r.voti, "salvando senza toccare nulla: punteggio 58 e punteggio precedente 41 restano, nessun voto inventato");
  await page.click('[data-edit]');             // dopo il salvataggio la scheda resta aperta nel Taccuino
  await page.click('button[data-rate^="s:v.qualita"][data-n="9"]');
  ok(!(await page.locator("#frozenNote").count()), "toccando un giudizio l'avviso sparisce");
  await page.click("#saveBtn"); await page.waitForTimeout(500);
  r = await stored("degustazione:1-aaa");
  ok(r.legacyTotal === 41 && r.voti && r.voti.v.qualita === 9 && r.score !== 58, "dopo aver toccato un giudizio il punteggio si ricalcola e il precedente resta (" + r.score + ")");

  /* --- cambio di modalità in modifica: chiede conferma --- */
  await page.click('#nav [data-tab="book"]');
  await page.locator(".wine-row", { hasText: "Completo" }).locator(".wine-mid").click();
  await page.click('[data-edit]');
  await page.click('#modeTopWrap button[data-modalita="smart"]');
  dialogs.length = 0; rispondi = false;
  await page.click("#saveBtn"); await page.waitForTimeout(400);
  ok(dialogs.length === 1 && /Voto rapido/.test(dialogs[0]), "passare al voto rapido chiede conferma");
  r = await stored("degustazione:2-bbb");
  ok(r.modalita === "completa" && r.voti, "rifiutando, la scheda completa non cambia");
  rispondi = true;
  await page.click('#modeTopWrap button[data-modalita="completa"]');
  await page.click("#resetBtn");                     // Annulla modifica
  await page.waitForTimeout(300);

  /* --- doppio clic su Salva: una sola scheda --- */
  await page.click('#nav [data-tab="new"]');
  await page.fill("#nomeInput", "Doppio");
  await page.dblclick("#saveBtn");
  await page.waitForTimeout(900);
  ok((await storedKeys("degustazione:")).length === 3, "doppio clic su Salva: una scheda, non due (" + (await storedKeys("degustazione:")).length + " in archivio)");

  /* --- annata non valida --- */
  await page.fill("#nomeInput", "Annata storta");
  await page.fill("#annataInput", "abc2020xx");
  dialogs.length = 0;
  await page.click("#saveBtn"); await page.waitForTimeout(300);
  ok((await storedKeys("degustazione:")).length === 3 && /quattro cifre/.test(await page.locator("#saveStatus").textContent()), "annata non valida: non si salva e lo dice");
  await page.fill("#annataInput", "");

  /* --- Azzera chiede conferma se c'è qualcosa --- */
  dialogs.length = 0; rispondi = false;
  await page.click("#resetBtn"); await page.waitForTimeout(200);
  ok(dialogs.length === 1 && (await page.inputValue("#nomeInput")) === "Annata storta", "Azzera con la scheda compilata chiede conferma, e annullando non cancella");
  rispondi = true;
  await page.click("#resetBtn"); await page.waitForTimeout(200);
  ok((await page.inputValue("#nomeInput")) === "", "confermando, la scheda si azzera");
  dialogs.length = 0;
  await page.click("#resetBtn"); await page.waitForTimeout(200);
  ok(dialogs.length === 0, "Azzera con la scheda vuota non chiede nulla");

  /* --- uvaggio: l'avviso segue la percentuale mentre si digita --- */
  await page.click("#uvAddBtn");
  await page.fill('[data-uv-p="0"]', "70");
  ok(/30/.test(await page.locator("#uvHint").textContent()), "uvaggio: scrivendo 70, l'avviso dice subito 'manca il 30%'");
  await page.fill('[data-uv-p="0"]', "130");
  ok((await page.locator("#uvTotal").textContent()) === "100%" && !/30/.test(await page.locator("#uvHint").textContent()), "uvaggio: 130 diventa 100 e l'avviso si aggiorna");
  await page.click("#resetBtn");

  /* --- eliminare una scheda mentre la si modifica: non risorge --- */
  await page.click('#nav [data-tab="book"]');
  await page.locator(".wine-row", { hasText: "Doppio" }).locator(".wine-mid").click();
  await page.click('[data-edit]');
  await page.click('#nav [data-tab="book"]');
  await page.locator(".wine-row", { hasText: "Doppio" }).locator(".wine-mid").click();
  await page.click('[data-del]');
  await page.waitForTimeout(400);
  await page.click('#nav [data-tab="new"]');
  ok((await page.inputValue("#nomeInput")) === "", "eliminata durante la modifica: il modulo si svuota");
  await page.click("#saveBtn"); await page.waitForTimeout(300);
  ok((await storedKeys("degustazione:")).length === 2, "e non risorge salvando");

  /* --- accessibilità di base --- */
  ok((await page.evaluate(() => document.documentElement.lang)) === "it", "lang italiano");
  await page.click("#langEn"); await page.waitForTimeout(300);
  ok((await page.evaluate(() => document.documentElement.lang)) === "en" && (await page.getAttribute("#langEn", "aria-pressed")) === "true", "cambiando lingua: <html lang> e aria-pressed");
  await page.click("#langIt"); await page.waitForTimeout(200);
  await page.click('#nav [data-tab="book"]');
  const riga = page.locator(".wine-row").first().locator(".wine-mid");
  await riga.focus(); await page.keyboard.press("Enter");
  ok(await page.locator(".wine-detail").count() === 1, "una riga del Taccuino si apre da tastiera");
  ok(!!(await page.locator(".wine-score").first().getAttribute("aria-label")), "il pulsante punteggio ha un'etichetta");
  await page.click('#nav [data-tab="new"]');
  ok((await page.locator('button[data-rate]').first().getAttribute("aria-pressed")) !== null, "i tasti 0-10 dicono se sono premuti");

  /* --- barre dell'intestazione: portano alla fase --- */
  await page.click('#segs [data-goto="gus"]');
  await page.waitForTimeout(400);
  ok(await page.locator('.sec.open:has([data-sec="gus"])').count() === 1, "toccare 'Gusto-olf.' apre quella sezione");

  /* --- barre uguali nelle due modalità: stessa fase, stessa lunghezza --- */
  const larg = id => page.evaluate(i => document.getElementById(i).style.width, id);
  await page.click('#modeTopWrap button[data-modalita="completa"]');
  const wCompleta = await larg("segVis");
  ok(wCompleta === "36%", "completa: tutto a 6 → fase 68 → barra 36% della banda 50-100, come nel voto rapido (" + wCompleta + ")");

  /* --- ripristino da copia: porta con sé anche le prove alla cieca --- */
  await page.click('#nav [data-tab="book"]');
  const dump = await page.evaluate(async () => {
    const schede = Object.keys(localStorage).filter(k => k.indexOf("sorso.p.degustazione:") === 0).map(k => JSON.parse(localStorage.getItem(k)));
    const cieca = Object.keys(localStorage).filter(k => k.indexOf("sorso.p.cieca:") === 0).map(k => JSON.parse(localStorage.getItem(k)));
    return { formato:"sorso-archivio", versione:1, schede, cieca, profilo:{} };
  });
  await page.evaluate(() => { Object.keys(localStorage).filter(k => /^sorso\.p\.(degustazione|cieca):/.test(k)).forEach(k => localStorage.removeItem(k)); });
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(800);
  await page.click('#nav [data-tab="book"]');
  const input = page.locator('input[type="file"]').last();
  await input.setInputFiles({ name: "copia.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(dump)) });
  await page.waitForTimeout(1200);
  ok((await storedKeys("cieca:")).length === 1, "ripristino: la prova alla cieca torna (" + (await storedKeys("cieca:")).length + ")");
  ok((await storedKeys("degustazione:")).length === 2, "ripristino: le schede tornano (2)");
  const salvate = await storedKeys("degustazione:");
  const campiPrivati = await page.evaluate(ks => ks.map(k => Object.keys(JSON.parse(localStorage.getItem(k))).filter(x => x.charAt(0) === "_")), salvate);
  ok(campiPrivati.every(a => a.length === 0), "ripristino: nessun campo interno (_...) nelle schede");

  /* --- statistiche: dice perché mancano i profili --- */
  await page.click('#nav [data-tab="stats"]');
  await page.waitForTimeout(400);
  const testoStats = await page.locator("#statsWrap").textContent();
  ok(/complet/i.test(testoStats), "statistiche: spiega che contano le schede complete");
  ok(!/0, poi da 2 a 7/.test(testoStats), "statistiche: nessun testo sulla vecchia scala");

  ok(errors.length === 0, "nessun errore in console: " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? "\n" + fails + " CONTROLLI FALLITI" : "\nTUTTO OK");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
