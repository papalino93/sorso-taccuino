/* Colori scelti dall'utente nell'app personale. App su localhost:8765. */
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
let fails = 0; const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" })).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.addInitScript(() => { if (!localStorage.getItem("s")) { localStorage.setItem("s", "1"); localStorage.setItem("sorso.auth.skipped", "1"); localStorage.setItem("sorso-theme", "light"); localStorage.setItem("sorso-nota-scala2", "1"); } });
  await page.goto("http://localhost:8765/", { waitUntil: "load" }); await page.waitForTimeout(800);
  const v = name => page.evaluate(n => document.getElementById("root").style.getPropertyValue(n) || getComputedStyle(document.getElementById("root")).getPropertyValue(n), name);
  ok((await v("--sel-bg")).trim().toLowerCase() === "#8c1d3f", "predefinito: bordeaux");
  const foot = await page.locator("#appVersion").textContent();
  ok(/v1\.\d+\.\d+/.test(foot) && /2026/.test(foot) && /aggiornamento/.test(foot), "versione e data nel piè di pagina: " + foot);
  await page.click("#settingsBtn");
  await page.locator('#accentSwatches [data-accent="#0f7a4d"]').click();
  ok((await v("--sel-bg")).trim().toLowerCase() === "#0f7a4d", "scegliendo Bosco il colore cambia subito");
  ok((await page.locator('#accentSwatches [data-accent="#0f7a4d"]').getAttribute("aria-pressed")) === "true", "la scelta è annunciata (aria-pressed)");
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(600);
  ok((await v("--sel-bg")).trim().toLowerCase() === "#0f7a4d", "la scelta resta dopo il ricarico");
  /* un giallo su fondo bianco viene corretto e lo dice */
  await page.click("#settingsBtn");
  await page.locator('#bgSwatches [data-bg="#ffffff"]').click();
  await page.evaluate(() => { const i = document.getElementById("accentCustom"); i.value = "#ffeb3b"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  ok(!(await page.locator("#lookAdjusted").getAttribute("class")).includes("hidden"), "colore poco leggibile: avviso di correzione");
  const c = await page.evaluate(() => { const r = document.getElementById("root"); const g = n => getComputedStyle(r).getPropertyValue(n).trim(); return [g("--sel-bg"), g("--sel-fg"), g("--panel")]; });
  ok(c[0] !== "#ffeb3b", "il giallo è stato scurito (" + c[0] + ")");
  /* tema scuro: sfondi propri e scelta separata */
  await page.click("#themeDark"); await page.waitForTimeout(300);
  ok((await page.locator("#bgSwatches [data-bg]").first().getAttribute("data-bg")) === "#0f080b", "in tema scuro si propongono gli sfondi scuri");
  ok((await v("--panel")).trim() !== "#ffffff", "lo sfondo chiaro scelto non finisce nel tema scuro");
  /* ripristino */
  await page.locator("#lookReset").click();
  ok((await v("--sel-bg")).trim().toLowerCase() === "#c8385c", "ripristino: torna l'accento predefinito del tema scuro");
  await page.click("#themeLight"); await page.waitForTimeout(200);
  ok((await v("--sel-bg")).trim().toLowerCase() === "#8c1d3f", "e quello del tema chiaro");
  /* tema: chiaro / scuro / automatico (segue il dispositivo) */
  await page.locator('#themePrefSwitch [data-themepref="auto"]').click(); await page.waitForTimeout(200);
  ok((await page.locator('#themePrefSwitch [data-themepref="auto"]').getAttribute("aria-pressed")) === "true", "tema automatico selezionato");
  await page.emulateMedia({ colorScheme: "dark" }); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById("root").classList.contains("dark")), "automatico: il dispositivo diventa scuro, l'app lo segue");
  await page.emulateMedia({ colorScheme: "light" }); await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => document.getElementById("root").classList.contains("dark"))), "automatico: il dispositivo torna chiaro, l'app lo segue");
  await page.locator('#themePrefSwitch [data-themepref="dark"]').click(); await page.emulateMedia({ colorScheme: "light" }); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.getElementById("root").classList.contains("dark")), "scuro fisso: ignora il dispositivo");
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(600);
  ok(await page.evaluate(() => document.getElementById("root").classList.contains("dark")), "la scelta del tema resta dopo il ricarico");
  await page.locator("#settingsBtn").click(); await page.locator('#themePrefSwitch [data-themepref="light"]').click(); await page.waitForTimeout(200);
  /* modalità di voto predefinita nel profilo */
  await page.click("#settingsBtn");
  await page.locator('#vmodeSwitch [data-defmode="smart"]').click(); await page.waitForTimeout(300);
  ok((await page.locator('#modeTopWrap button[data-modalita="smart"]').getAttribute("aria-pressed")) === "true", "predefinito Voto rapido: la schermata Nuova si apre in rapido");
  await page.click('#nav [data-tab="new"]');
  await page.click('#modeTopWrap button[data-modalita="completa"]');
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(700);
  ok((await page.locator('#modeTopWrap button[data-modalita="smart"]').getAttribute("aria-pressed")) === "true", "col predefinito fisso, cambiare modalità vale solo per quella scheda");
  await page.click("#settingsBtn");
  await page.locator('#vmodeSwitch [data-defmode=""]').click();
  await page.click('#nav [data-tab="new"]');
  await page.click('#modeTopWrap button[data-modalita="completa"]');
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(700);
  ok((await page.locator('#modeTopWrap button[data-modalita="completa"]').getAttribute("aria-pressed")) === "true", "«Ricorda l'ultima»: si riparte dall'ultima modalità usata");
  /* inglese */
  await page.click("#langEn"); await page.waitForTimeout(300);
  ok(/last updated/.test(await page.locator("#appVersion").textContent()), "in inglese: updated");
  ok(errs.length === 0, "nessun errore: " + JSON.stringify(errs));
  await browser.close();
  console.log(fails ? "\n" + fails + " CONTROLLI FALLITI" : "\nTUTTO OK");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
