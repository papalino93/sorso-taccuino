/* «Leggi l'etichetta»: OCR vero nel browser su un'etichetta disegnata. Serve la rete (la prima volta scarica il motore).
   App su localhost:8765:  node test/e2e/etichetta.e2e.js */
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const fs = require("fs"), os = require("os"), path = require("path");
let fails = 0; const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };
const BASE = process.env.BASE || "http://localhost:8765/";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.addInitScript(() => { localStorage.setItem("sorso.auth.skipped", "1"); localStorage.setItem("sorso-nota-scala2", "1"); localStorage.setItem("sorso-lang", "it"); });
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForTimeout(700);

  /* un'etichetta disegnata: testo nero su carta chiara */
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 1200; c.height = 1600; const x = c.getContext("2d");
    x.fillStyle = "#f4ecd8"; x.fillRect(0, 0, 1200, 1600); x.fillStyle = "#111"; x.textAlign = "center";
    const line = (t, y, px, w) => { x.font = (w || "bold") + " " + px + "px Arial, Helvetica, sans-serif"; x.fillText(t, 600, y); };
    line("FONTODI", 220, 96); line("FLACCIANELLO", 520, 120); line("DELLA PIEVE", 660, 120);
    line("Colli della Toscana Centrale IGT", 800, 56, "normal"); line("2021", 960, 150);
    line("Sangiovese 100%", 1100, 60, "normal"); line("14,5% vol    750 ml", 1200, 56, "normal");
    line("Imbottigliato all'origine da Fontodi - Panzano in Chianti", 1400, 40, "normal");
    return c.toDataURL("image/png").split(",")[1];
  });
  const f = path.join(os.tmpdir(), "etichetta-prova.png"); fs.writeFileSync(f, Buffer.from(png, "base64"));

  await page.setInputFiles("#photoInput", f); await page.waitForTimeout(600);
  ok(await page.locator("#readLabelBtn").isVisible(), "con la foto compare «Leggi l'etichetta»");
  ok(/resta sul tuo dispositivo/.test(await page.locator("#labelRead").innerText()), "avviso: la foto resta sul dispositivo");
  await page.click("#readLabelBtn");
  ok(/Lettura in corso/.test(await page.locator("#readLabelBtn").innerText()), "durante la lettura il pulsante lo dice");
  await page.locator("#lblF_produttore").waitFor({ timeout: 180000 }).then(() => ok(true, "la lettura finisce e propone i campi"), () => ok(false, "la lettura non è finita"));
  const val = async k => (await page.locator("#lblF_" + k).count()) ? page.locator("#lblF_" + k).inputValue() : "";
  const got = { produttore: await val("produttore"), nome: await val("nome"), annata: await val("annata"), denominazione: await val("denominazione"), vitigni: await val("vitigni") };
  console.log("letto:", JSON.stringify(got));
  ok(/fontodi/i.test(got.produttore), "produttore letto: " + got.produttore);
  ok(/flaccianello/i.test(got.nome), "nome letto: " + got.nome);
  ok(got.annata === "2021", "annata letta: " + got.annata);
  ok(/toscana/i.test(got.denominazione), "denominazione letta: " + got.denominazione);
  ok(/sangiovese/i.test(got.vitigni), "vitigno letto: " + got.vitigni);
  ok(/14,5/.test(await page.locator("#labelRead").innerText()), "la gradazione è segnalata (nelle note)");

  /* si può correggere prima di applicare, e non si scrive nulla da soli */
  ok((await page.locator("#nomeInput").inputValue()) === "", "prima di «Compila la scheda» la scheda è ancora vuota");
  await page.fill("#lblF_nome", "Flaccianello della Pieve");
  await page.click('[data-lbl="apply"]');
  ok((await page.locator("#nomeInput").inputValue()) === "Flaccianello della Pieve", "applicato: nome corretto a mano");
  ok(/fontodi/i.test(await page.locator("#produttoreInput").inputValue()), "applicato: produttore");
  ok((await page.locator("#annataInput").inputValue()) === "2021", "applicato: annata");
  ok(/sangiovese/i.test(await page.locator("#uvRows").innerHTML()), "applicato: vitigno nell'uvaggio");
  ok(/Scheda compilata/.test(await page.locator("#labelStatus").innerText()), "messaggio «Scheda compilata»");
  ok(await page.locator("#labelRead").evaluate(e => e.classList.contains("hidden") || !/Compila la scheda/.test(e.innerText)), "il pannello dei risultati si chiude");

  /* un campo già compilato non si sovrascrive senza spuntarlo */
  await page.fill("#produttoreInput", "Altro Produttore");
  await page.click("#readLabelBtn");
  await page.locator("#lblF_produttore").waitFor({ timeout: 120000 });
  ok(!(await page.locator("#lblC_produttore").isChecked()), "voce già compilata: non spuntata di default");
  ok(/Ora nella scheda: Altro Produttore/.test(await page.locator("#labelRead").innerText()), "mostra cosa c'è ora nella scheda");
  await page.click('[data-lbl="apply"]');
  ok((await page.locator("#produttoreInput").inputValue()) === "Altro Produttore", "non sovrascrive il campo");

  /* foto senza testo: messaggio chiaro */
  const bianca = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 600; c.height = 600; const x = c.getContext("2d"); x.fillStyle = "#ccc"; x.fillRect(0, 0, 600, 600); return c.toDataURL("image/png").split(",")[1]; });
  const f2 = path.join(os.tmpdir(), "etichetta-vuota.png"); fs.writeFileSync(f2, Buffer.from(bianca, "base64"));
  await page.click("#removeLabelBtn"); await page.setInputFiles("#photoInput", f2); await page.waitForTimeout(500);
  await page.click("#readLabelBtn");
  await page.locator("#labelRead", { hasText: "Non sono riuscito a leggere" }).waitFor({ timeout: 120000 }).then(() => ok(true, "foto senza testo: «Non sono riuscito a leggere…»"), () => ok(false, "nessun messaggio per la foto vuota"));

  await page.click("#removeLabelBtn");
  ok(!(await page.locator("#readLabelBtn").isVisible()), "tolta la foto sparisce il pulsante");
  ok(errs.length === 0, "nessun errore nella pagina " + errs.join("|"));
  await browser.close();
  console.log(fails ? "\n" + fails + " FALLITI" : "\nTUTTO OK"); process.exit(fails ? 1 : 0);
})();
