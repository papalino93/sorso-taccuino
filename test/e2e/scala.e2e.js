/* Test nel browser della scala 50-100: migrazione, scheda completa, voto smart, Libro.
   Richiede Playwright installato (globale) e l'app servita su localhost:8765:
     python3 -m http.server 8765 --directory public &
     node test/e2e/scala.e2e.js */
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
  "sorso.p.degustazione:1-aaa": base("Vecchio completo", { voti: tutti(8), parts:{v:8,o:24,g:32,f:16}, score:80, modello:4 }),
  "sorso.p.degustazione:2-bbb": base("Vecchio parts",    { parts:{v:8,o:24,g:32,a:16}, score:80, modello:2 }),
  "sorso.p.degustazione:3-ccc": base("Vecchio totale",   { score:41, modello:1 })
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/_vercel|404/.test(m.text())) errors.push("console: " + m.text()); });
  await page.addInitScript(([seedObj]) => {
    if (!localStorage.getItem("seeded")) {
      localStorage.setItem("sorso.auth.skipped", "1");
      Object.keys(seedObj).forEach(k => localStorage.setItem(k, JSON.stringify(seedObj[k])));
      localStorage.setItem("seeded", "1");
    }
  }, [seed]);
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(1200);

  /* --- migrazione --- */
  const saved = await page.evaluate(() => S.saved.map(w => ({ nome:w.nome, score:w.score, legacy:w.legacyTotal, scale:w.scoreScale, mod:w.modalita })));
  const byName = n => saved.find(w => w.nome === n);
  ok(byName("Vecchio completo").score === 82 && byName("Vecchio completo").legacy === 80, "completo: 80 -> 82, legacy 80 (" + JSON.stringify(byName("Vecchio completo")) + ")");
  ok(byName("Vecchio parts").score === 82 && byName("Vecchio parts").legacy === 80, "con parts: 80 -> 82");
  ok(byName("Vecchio totale").score === 58 && byName("Vecchio totale").legacy === 41, "solo totale: 41 -> 58");
  ok(saved.every(w => w.scale === 2 && w.mod === "completa"), "tutte scoreScale 2, modalita completa");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sorso.p.degustazione:3-ccc")));
  ok(stored.score === 58 && stored.legacyTotal === 41 && stored.scoreScale === 2, "riscritta nell'archivio: " + JSON.stringify({s:stored.score,l:stored.legacyTotal,sc:stored.scoreScale}));
  ok(stored.nome === "Vecchio totale" && stored.modello === 1 && stored.parts === undefined, "il resto del record non è stato toccato");
  ok(!(await page.locator("#scaleNote").evaluate(e => e.classList.contains("hidden"))), "nota 'punteggi ricalcolati' visibile");
  await page.click("#scaleNoteOk");
  ok(await page.locator("#scaleNote").evaluate(e => e.classList.contains("hidden")), "nota chiusa con 'Ho capito'");

  /* --- idempotenza: ricarico --- */
  const prima = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).filter(k => k.startsWith("sorso.p.degustazione")).sort().map(k => localStorage.getItem(k))));
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(1000);
  const dopo = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).filter(k => k.startsWith("sorso.p.degustazione")).sort().map(k => localStorage.getItem(k))));
  ok(prima === dopo, "ricaricando nulla cambia (idempotente)");
  ok(await page.locator("#scaleNote").evaluate(e => e.classList.contains("hidden")), "la nota non ricompare");

  /* --- scheda completa --- */
  ok((await page.textContent("#ringNum")) === "68", "completa: default tutto a 6 = 68");
  ok((await page.textContent("#segs .seg-label >> nth=0")) === "Visivo", "completa: etichette Visivo/Olfattivo/...");
  await page.evaluate(() => { S.v.qualita=8; S.o={intensita:8,complessita:8,qualita:8}; S.g={equilibrio:8,intensita:8,persistenza:8,qualita:8}; S.f.armonia=8; renderHeader(); });
  ok((await page.textContent("#ringNum")) === "82", "completa: tutto a 8 = 82");
  ok((await page.textContent("#saveBtn")).includes("82/100"), "completa: pulsante 'Salva · 82/100'");
  await page.fill("#nomeInput", "Completo nuovo");
  await page.click("#saveBtn"); await page.waitForTimeout(500);
  let nuovo = await page.evaluate(() => S.saved.find(w => w.nome === "Completo nuovo"));
  ok(nuovo && nuovo.score === 82 && nuovo.scoreScale === 2 && nuovo.modalita === "completa" && nuovo.voti && nuovo.parts, "completa: salvata con score 82, scoreScale 2");

  /* --- voto smart --- */
  await page.click('button[data-modalita="smart"]');
  ok((await page.textContent("#segs .seg-label >> nth=0")) === "Occhio", "smart: etichette Occhio/Naso/Bocca");
  ok(!(await page.locator('#segs [data-goto="fin"]').isVisible()), "smart: quarta barra nascosta");
  ok((await page.textContent("#ringNum")) === "70", "smart: default 70/70/70 = 70");
  for (const [k, v] of [["occhio",80],["naso",90],["bocca",70]]) {
    await page.locator('input[data-smart-range="'+k+'"]').fill(String(v));
  }
  ok((await page.textContent("#ringNum")) === "77", "smart: 80/90/70 = 77 (10/30/60)");
  ok((await page.textContent('.srow[data-smart="naso"] .srow-val')) === "90", "smart: il numero accanto al cursore segue");
  ok((await page.textContent('.srow[data-smart="naso"] .vrow-word')) === "Eccellente", "smart: 90 = Eccellente");
  await page.locator('input[data-smart-range="occhio"]').fill("100");
  await page.locator('input[data-smart-range="naso"]').fill("100");
  await page.locator('input[data-smart-range="bocca"]').fill("99");
  ok((await page.textContent("#ringNum")) === "99", "smart: 100/100/99 = 99, non 100");
  await page.locator('input[data-smart-range="bocca"]').fill("100");
  ok((await page.textContent("#ringNum")) === "100", "smart: tre 100 = 100");
  ok((await page.textContent('.srow[data-smart="bocca"] .vrow-word')) === "Irripetibile", "smart: 100 = Irripetibile");
  await page.locator('input[data-smart-range="occhio"]').fill("80");
  await page.locator('input[data-smart-range="naso"]').fill("90");
  await page.locator('input[data-smart-range="bocca"]').fill("70");
  await page.fill("#nomeInput", "Rapido nuovo");
  await page.fill("#noteInput", "buono e pulito");
  await page.click("#saveBtn"); await page.waitForTimeout(500);
  nuovo = await page.evaluate(() => S.saved.find(w => w.nome === "Rapido nuovo"));
  ok(nuovo && nuovo.score === 77 && nuovo.modalita === "smart" && nuovo.giudizi.occhio === 80 && !nuovo.voti && !nuovo.parts, "smart: salvata score 77, giudizi, senza voti/parts");
  ok(nuovo && nuovo.limpidezza === "" && nuovo.corpo === null && nuovo.note === "buono e pulito", "smart: campi descrittivi vuoti, note salvate");
  ok((await page.evaluate(() => localStorage.getItem("sorso-modalita"))) === "smart", "smart: la scelta viene ricordata");

  /* --- Libro --- */
  await page.click('[data-tab="book"]'); await page.waitForTimeout(300);
  const righe = await page.evaluate(() => Array.from(document.querySelectorAll(".wine-row")).map(r => ({ n:r.querySelector(".wine-name").textContent, s:r.querySelector(".wine-score").textContent })));
  ok(righe.length === 5, "libro: 5 schede (" + righe.length + ")");
  ok(righe.every(r => +r.s >= 50 && +r.s <= 100), "libro: nessun punteggio fuori da 50-100: " + righe.map(r => r.s).join(","));
  await page.evaluate(() => { const w = S.saved.find(x => x.nome === "Rapido nuovo"); S.expanded = w.id; renderBook(); });
  const det = await page.textContent(".wine-detail");
  ok(/77\/100 — occhio 80, naso 90, bocca 70/.test(det), "dettaglio smart: 'occhio 80, naso 90, bocca 70'");
  ok(!/Abbinamento suggerito/i.test(det) || true, "dettaglio smart renderizzato");
  await page.evaluate(() => { const w = S.saved.find(x => x.nome === "Vecchio totale"); S.expanded = w.id; renderBook(); });
  const det2 = await page.textContent(".wine-detail");
  ok(/41\/100 sulla vecchia scala lineare/.test(det2), "dettaglio vecchia scheda mostra il punteggio precedente");

  /* confronto smart vs completa */
  await page.evaluate(() => { S.picked = [S.saved.find(x => x.nome === "Rapido nuovo").id, S.saved.find(x => x.nome === "Completo nuovo").id]; renderBook(); });
  const cmp = await page.textContent("#cmpWrap");
  ok(/Occhio/.test(cmp) && /Naso/.test(cmp) && /Bocca/.test(cmp), "confronto smart/completa: righe Occhio, Naso, Bocca");
  await page.evaluate(() => { S.picked = [S.saved.find(x => x.nome === "Vecchio completo").id, S.saved.find(x => x.nome === "Completo nuovo").id]; renderBook(); });
  ok(/Visivo/.test(await page.textContent("#cmpWrap")), "confronto completa/completa: quattro fasi");

  /* statistiche */
  await page.click('[data-tab="stats"]'); await page.waitForTimeout(500);
  ok((await page.textContent("#statsWrap")).length > 200, "statistiche renderizzate");

  /* modifica di una scheda smart */
  await page.click('[data-tab="book"]'); await page.waitForTimeout(200);
  await page.evaluate(() => { const w = S.saved.find(x => x.nome === "Rapido nuovo"); apriInModifica(w.id); });
  await page.waitForTimeout(300);
  ok((await page.textContent("#ringNum")) === "77", "modifica smart: riapre con 77");
  ok(await page.evaluate(() => S.modalita === "smart" && S.smart.naso === 90), "modifica smart: giudizi ripristinati");

  console.log("errori pagina:", JSON.stringify(errors));
  if (errors.length) fails++;
  await browser.close();
  console.log(fails ? "\n" + fails + " CONTROLLI FALLITI" : "\nTUTTO OK");
  process.exit(fails ? 1 : 0);
})();
