/* Schermate dell'app personale per le guide. App su localhost:8765.   node docs/guide/shots-app.js docs/guide/img */
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const out = process.argv[2];
const tutti = n => ({ v:{qualita:n}, o:{intensita:n,complessita:n,qualita:n}, g:{equilibrio:n,intensita:n,persistenza:n,qualita:n}, f:{armonia:n} });
const parts = n => ({v:Math.round(n*1.0),o:Math.round(n*3),g:Math.round(n*4),f:Math.round(n*2)});
const base = (nome, produttore, annata, tip, regione, prezzo, extra) => Object.assign({ nome, produttore, annata, tipologia:tip, denominazione:"", regione, prezzo, affinamento:"", uvaggi:[{v:"Nebbiolo",p:100}],
  limpidezza:"Limpido", colore:"Rosso rubino", consistenza:"Abbastanza consistente", zuccheri:"Secco", stato:"Pronto", durezze:{acidita:4,tannicita:4,sapidita:3},
  morbidezze:{alcolicita:3,morbidezza:3}, intensita:4, corpo:4, desc:["Ciliegia","Rosa","Spezie"], note:"", abbinamento:"", timestamp: Date.now() }, extra);
const seed = {
  "sorso.p.degustazione:1-a": base("Barbaresco Asili","Cantina del Pino","2020","Rosso","Piemonte — Italia",42,{ voti:tutti(9), parts:parts(9), score:91, scoreScale:2, modello:4, modalita:"completa", timestamp:5000 }),
  "sorso.p.degustazione:2-b": base("Etna Rosso Rampante","Tenuta delle Sciare","2021","Rosso","Sicilia — Italia",28,{ voti:tutti(8), parts:parts(8), score:82, scoreScale:2, modello:4, modalita:"completa", timestamp:4000 }),
  "sorso.p.degustazione:3-c": base("Vermentino di Gallura","Li Cuppulati","2023","Bianco","Sardegna — Italia",15,{ modalita:"smart", giudizi:{occhio:80,naso:84,bocca:78}, score:80, scoreScale:2, modello:4, timestamp:3000 }),
  "sorso.p.degustazione:4-d": base("Taurasi Riserva","Terre d'Irpinia","2017","Rosso","Campania — Italia",55,{ modalita:"smart", giudizi:{occhio:100,naso:100,bocca:99}, score:99, scoreScale:2, modello:4, timestamp:2000 }),
  "sorso.p.degustazione:5-e": base("Franciacorta Brut","Cà del Bosco","2019","Spumante","Lombardia — Italia",38,{ voti:tutti(7), parts:parts(7), score:74, scoreScale:2, modello:4, modalita:"completa", timestamp:1000 })
};
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: {width:390,height:844}, colorScheme: "light", deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(([o]) => { if (!localStorage.getItem("seeded")) { localStorage.setItem("sorso.auth.skipped","1"); localStorage.setItem("sorso-theme","light"); Object.keys(o).forEach(k => localStorage.setItem(k, JSON.stringify(o[k]))); localStorage.setItem("seeded","1"); localStorage.setItem("sorso-nota-scala2","1"); } }, [seed]);
  await page.goto("http://localhost:8765/", { waitUntil: "load" }); await page.waitForTimeout(1500);
  const hide = () => page.evaluate(() => document.querySelectorAll(".bottom, .coffee-fab").forEach(e => e.style.visibility = "hidden"));
  await hide();
  await page.click('#modeTopWrap button[data-modalita="smart"]'); await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelectorAll("[data-smart-range]").forEach((el,i) => { el.value = [88,92,86][i]; el.dispatchEvent(new Event("input",{bubbles:true})); }); window.scrollTo(0,0); });
  await page.screenshot({ path: out + "/app-nuova.png" });
  await page.click('#nav [data-tab="book"]'); await page.waitForTimeout(400);
  await page.locator(".wine-row").first().locator(".wine-mid").click(); await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path: out + "/app-taccuino.png" });
  await page.click('#nav [data-tab="stats"]'); await page.waitForTimeout(600); await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path: out + "/app-statistiche.png" });
  await page.click('#nav [data-tab="blind"]'); await page.waitForTimeout(500); await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path: out + "/app-cieca.png" });
  await page.click('#nav [data-tab="event"]'); await page.waitForTimeout(500); await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path: out + "/app-evento.png" });
  await browser.close();
})();
