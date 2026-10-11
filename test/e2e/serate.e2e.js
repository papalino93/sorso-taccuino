/* Serate nelle cerchie, nel browser: la pagina delle serate dentro l'app, «Un solo vino», voto, ruoli,
   «Cancella i miei voti» ed esportazione.      node test/e2e/serate.e2e.js */
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const dev = require("../helpers/dev-server");

let fails = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };

(async () => {
  const d = await dev.start({ port: 8791, origins: [] });
  const { getRedis } = require("../../api/_redis");
  const redis = getRedis();
  const people = {};
  async function account(name, email) {
    const username = "google:" + name, token = "tok-" + name;
    await redis.set("user:" + username, JSON.stringify({ provider: "google", email, name: name[0].toUpperCase() + name.slice(1) + " Rossi" }));
    await redis.set("session:" + token, username);
    people[name] = { username, token };
  }
  await account("anna", "anna@example.com"); await account("carla", "carla@example.com");
  const circ = require("../../api/circles"); const { call } = require("../helpers/env");
  const C = async (who, body) => (await call(circ, { method: "POST", headers: { authorization: "Bearer " + people[who].token, "x-forwarded-for": "9.9.9.9" }, body })).body;
  const { circle } = await C("anna", { op: "create", name: "Corso del giovedì" });
  const inv = (await C("anna", { op: "invite", circle: circle.id, emails: ["carla@example.com"] })).results[0];
  await C("carla", { op: "invite.accept", token: inv.token });

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const errs = [];
  async function open(who, vp, scheme) {
    const ctx = await browser.newContext({ viewport: vp || { width: 390, height: 844 }, colorScheme: scheme || "light", acceptDownloads: true });
    const page = await ctx.newPage();
    page.on("pageerror", e => errs.push(who + " pageerror: " + e.message));
    page.on("dialog", dlg => dlg.accept());
    const p = people[who];
    await page.addInitScript(([tok, user, name]) => {
      localStorage.setItem("sorso.auth.token", tok); localStorage.setItem("sorso.auth.user", user); localStorage.setItem("sorso.auth.name", name);
      localStorage.setItem("sorso.auth.skipped", "1"); localStorage.setItem("sorso-nota-scala2", "1");
    }, [p.token, p.username, who]);
    await page.goto(d.url + "/", { waitUntil: "load" }); await page.waitForTimeout(800);
    await page.click(vp && vp.width >= 1100 ? '#nav [data-tab="circles"]' : '[data-tab="circles"]'); await page.waitForTimeout(400);
    await page.locator('[data-circ="open"]').first().click();
    await page.locator("#circFrame").waitFor();
    const frame = page.frameLocator("#circFrame");
    return { ctx, page, frame };
  }

  /* --- Anna (Proprietario): la pagina delle serate c'è, con «Nuova degustazione» e «Un solo vino» --- */
  const A = await open("anna", { width: 1440, height: 900 });
  await A.frame.locator('[data-act="new-single"]').waitFor({ timeout: 8000 });
  ok(await A.frame.locator('[data-act="new-tasting"]').count() === 1, "Proprietario: «Nuova degustazione» e «Un solo vino»");
  ok(await A.frame.locator("header.top").count() === 0 && await A.frame.locator(".foot").count() === 0, "dentro l'app niente testata né piè di pagina doppi");
  const bg = await A.frame.locator("html").evaluate(e => getComputedStyle(e).getPropertyValue("--accent").trim());
  const appAcc = await A.page.evaluate(() => getComputedStyle(document.getElementById("root")).getPropertyValue("--sel-bg").trim());
  ok(bg === appAcc, "le serate hanno i colori dell'app (" + bg + ")");
  await A.frame.locator('[data-act="new-single"]').click();
  await A.frame.locator("#f-name").fill("Barolo"); await A.frame.locator("#f-prod").fill("Cascina Prova"); await A.frame.locator("#f-vint").fill("2016");
  await A.frame.locator('[data-act="submit-form"]').click();
  await A.frame.locator(".wine").first().waitFor({ timeout: 8000 });
  ok(/Barolo 2016/.test(await A.frame.locator("#h-main").textContent()), "«Un solo vino»: la degustazione prende il nome del vino e dell'annata");
  ok(await A.frame.locator(".wine").count() === 1 && await A.frame.locator('[data-act="new-wine"]').count() === 0, "un solo vino, senza «Aggiungi vino»");
  const hFrame = await A.page.locator("#circFrame").evaluate(e => e.getBoundingClientRect().height);
  ok(hFrame > 300, "il riquadro si adatta all'altezza del contenuto (" + Math.round(hFrame) + "px)");
  /* una serata vera con due vini */
  await A.frame.locator('[data-act="back"]').click();
  await A.frame.locator('[data-act="new-tasting"]').click();
  await A.frame.locator("#f-name").fill("Serata Toscana"); await A.frame.locator('[data-act="submit-form"]').click();
  await A.frame.locator('[data-act="new-wine"]').waitFor();
  for (const n of ["Chianti", "Brunello"]) { await A.frame.locator('[data-act="new-wine"], [data-act="submit-form"]').first().click().catch(() => {}); if (await A.frame.locator("#f-name").count()) { await A.frame.locator("#f-name").fill(n); await A.frame.locator('[data-act="submit-form"]').click(); await A.page.waitForTimeout(500); } }
  await A.frame.locator('[data-act="cancel-form"]').click().catch(() => {});
  ok(await A.frame.locator(".wine").count() === 2, "serata con due vini");
  /* un'azione sulla cerchia non ricarica le serate (si perderebbe una scheda a metà) */
  const before = await A.frame.locator("#h-main").textContent();
  await A.page.fill("#circEmails", "nuova@example.com"); await A.page.click('[data-circ-form="invite"] button[type=submit]'); await A.page.waitForTimeout(800);
  ok((await A.frame.locator("#h-main").textContent()) === before, "invitare qualcuno non ricarica le serate");

  /* --- Carla (Membro): vede le serate, non può crearne, vota --- */
  const B = await open("carla");
  await B.frame.locator('[data-act="open"]').first().waitFor({ timeout: 8000 });
  ok(await B.frame.locator('[data-act="new-tasting"]').count() === 0 && await B.frame.locator('[data-act="new-single"]').count() === 0, "Membro: niente «Nuova degustazione» né «Un solo vino»");
  ok(/un vino/i.test(await B.frame.locator("main").innerText()), "nell'elenco la degustazione di un solo vino ha l'etichetta «un vino»");
  await B.frame.locator('[data-act="open"]', { hasText: "Barolo" }).click();
  await B.frame.locator('[data-act="vote"]').first().click();
  await B.frame.locator("#sm-occhio").fill("80"); await B.frame.locator("#sm-naso").fill("90"); await B.frame.locator("#sm-bocca").fill("70");
  await B.frame.locator('[data-act="save-vote"]').click();
  await B.frame.locator(".big.team").first().waitFor({ timeout: 8000 });
  ok(/77/.test(await B.frame.locator(".wine").first().textContent()), "Carla vota dal telefono dentro l'app: 77");
  ok(!(await B.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), "telefono: nessuno scorrimento orizzontale");
  ok(await B.page.locator('[data-circ="export-csv"]').count() === 0, "il Membro non vede l'esportazione");
  /* Carla cancella i suoi voti */
  await B.page.click('[data-circ="myvotes"]');
  await B.page.locator("#circMsg", { hasText: "Voti cancellati: 1" }).waitFor({ timeout: 5000 }).then(() => ok(true, "«Cancella i miei voti»: 1 voto cancellato"), () => ok(false, "cancellazione voti"));
  await B.page.waitForTimeout(800);
  ok(!/77/.test(await B.frame.locator(".wine").first().textContent()), "dopo la cancellazione il voto non c'è più nelle serate");

  /* --- esportazione per il Proprietario --- */
  const [dl] = await Promise.all([A.page.waitForEvent("download"), A.page.click('[data-circ="export-csv"]')]);
  const csv = require("fs").readFileSync(await dl.path(), "utf8");
  ok(/^﻿tasting_id,tasting,date/.test(csv) && /Barolo/.test(csv) && /Serata Toscana/.test(csv), "esportazione CSV con le serate (" + dl.suggestedFilename() + ")");
  ok(/sorso-corso-del-giovedi-\d{4}-\d{2}-\d{2}\.csv/.test(dl.suggestedFilename()), "nome del file leggibile");

  /* --- tema scuro: le serate lo seguono --- */
  await A.page.click("#themeDark"); await A.page.waitForTimeout(300);
  const darkBg = await A.frame.locator("html").evaluate(e => getComputedStyle(e).getPropertyValue("--bg").trim());
  const appPanel = await A.page.evaluate(() => getComputedStyle(document.getElementById("root")).getPropertyValue("--panel").trim());
  ok(darkBg === appPanel, "cambiando tema le serate lo seguono (" + darkBg + ")");

  /* --- l'Evento è ritirato dalla scheda Nuova --- */
  await A.page.click('#nav [data-tab="new"]'); await A.page.waitForTimeout(300);
  ok(!(await A.page.locator("#pane-new .evt-card").isVisible()), "nella scheda Nuova non c'è più il collegamento all'Evento");

  /* --- chi non fa parte della cerchia non apre le serate --- */
  await account("dario", "dario@example.com");
  const D = await browser.newContext(); const dp = await D.newPage();
  await dp.addInitScript(t => { localStorage.setItem("sorso.auth.token", t); }, people.dario.token);
  await dp.goto(d.url + "/embed?c=" + circle.id, { waitUntil: "load" }); await dp.waitForTimeout(800);
  ok(!/Barolo|Serata Toscana/.test(await dp.locator("body").innerText()), "chi non è nella cerchia non vede le serate");

  ok(errs.length === 0, "nessun errore nelle pagine " + errs.join(" | "));
  await browser.close(); await d.stop();
  console.log(fails ? "\n" + fails + " CONTROLLI FALLITI" : "\nTUTTO OK");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
