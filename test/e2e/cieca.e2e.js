/* Test nel browser della scheda cieca con la scala 50-100 (migrazione e intestazione).
   Stesse istruzioni di scala.e2e.js. */
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
let fails = 0; const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  const old = { ipotesi:{tipologia:"Rosso",vitigno:"",regione:"",annata:"",nome:""}, etichetta:"A", limpidezza:"Limpido", colore:"Rosso rubino",
    consistenza:"Abbastanza consistente", zuccheri:"Secco", stato:"Pronto", durezze:{acidita:3,tannicita:3,sapidita:3}, morbidezze:{alcolicita:3,morbidezza:3},
    intensita:3, corpo:3, desc:[], note:"", voti:{v:{qualita:6},o:{intensita:6,complessita:6,qualita:6},g:{equilibrio:6,intensita:6,persistenza:6,qualita:6},f:{armonia:6}},
    parts:{v:6,o:18,g:24,f:12}, score:60, modello:4, timestamp:Date.now() };
  await page.addInitScript(o => { if(!localStorage.getItem("s")){ localStorage.setItem("s","1"); localStorage.setItem("sorso.auth.skipped","1");
    localStorage.setItem("sorso.p.cieca:1-aaa", JSON.stringify(o)); } }, old);
  await page.goto("http://localhost:8765/", { waitUntil: "load" }); await page.waitForTimeout(1000);
  const pr = await page.evaluate(() => B.prove.map(p => ({ score:p.score, legacy:p.legacyTotal, scale:p.scoreScale })));
  ok(pr.length === 1 && pr[0].score === 68 && pr[0].legacy === 60 && pr[0].scale === 2, "cieca vecchia: 60 -> 68, legacy 60 " + JSON.stringify(pr));
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem("sorso.p.cieca:1-aaa")));
  ok(st.score === 68 && st.legacyTotal === 60 && st.scoreScale === 2, "cieca riscritta nell'archivio");
  await page.click('[data-tab="blind"]'); await page.waitForTimeout(300);
  ok((await page.textContent("#ringNum")) === "68", "cieca: header 68 con tutto a 6");
  await page.evaluate(() => { B.v.qualita=10; B.o={intensita:10,complessita:10,qualita:10}; B.g={equilibrio:10,intensita:10,persistenza:10,qualita:10}; B.f.armonia=10; renderHeader(); });
  ok((await page.textContent("#ringNum")) === "100", "cieca: tutto a 10 = 100");
  ok((await page.textContent("#segs .seg-label >> nth=0")) === "Visivo", "cieca: etichette a quattro fasi");
  await page.evaluate(() => { B.f.armonia=9; renderHeader(); });
  ok(+(await page.textContent("#ringNum")) < 100, "cieca: un 9 basta a scendere sotto 100");
  console.log("errori:", JSON.stringify(errs)); if (errs.length) fails++;
  await browser.close(); console.log(fails ? fails+" FALLITI" : "TUTTO OK"); process.exit(fails?1:0);
})();
