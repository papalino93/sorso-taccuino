/* Modalità gioco nelle cerchie, nel browser: si accende, si gioca dal telefono, si svela, tutti vedono tutto.
   node test/e2e/gioco.e2e.js   (SHOTS=cartella per salvare le schermate) */
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const dev = require("../helpers/dev-server");

let fails = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };
const SHOTS = process.env.SHOTS || "";

(async () => {
  const d = await dev.start({ port: 8799, origins: [] });
  const redis = require("../../api/_redis").getRedis();
  const people = {};
  async function account(name) {
    const username = "google:" + name, token = "tok-" + name;
    await redis.set("user:" + username, JSON.stringify({ provider: "google", email: name + "@example.com", name: name[0].toUpperCase() + name.slice(1) + " Rossi" }));
    await redis.set("session:" + token, username);
    people[name] = { username, token };
  }
  for (const n of ["anna", "carla", "bea"]) await account(n);
  const circ = require("../../api/circles"); const { call } = require("../helpers/env");
  let k = 0; const C = async (who, body) => (await call(circ, { method: "POST", headers: { authorization: "Bearer " + people[who].token, "x-forwarded-for": "9.9.9." + (k++ % 200) }, body })).body;
  const { circle } = await C("anna", { op: "create", name: "Team VINO.COM" });
  const inv = (await C("anna", { op: "invite", circle: circle.id, emails: ["carla@example.com", "bea@example.com"] })).results;
  await C("carla", { op: "invite.accept", token: inv[0].token }); await C("bea", { op: "invite.accept", token: inv[1].token });

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const errs = [];
  async function open(who, vp, scheme) {
    const ctx = await browser.newContext({ viewport: vp || { width: 390, height: 844 }, colorScheme: scheme || "light", deviceScaleFactor: SHOTS ? 2 : 1 });
    const page = await ctx.newPage();
    page.on("pageerror", e => errs.push(who + " pageerror: " + e.message));
    page.on("dialog", dlg => dlg.accept());
    const p = people[who];
    await page.addInitScript(([tok, user, name]) => {
      localStorage.setItem("sorso.auth.token", tok); localStorage.setItem("sorso.auth.user", user); localStorage.setItem("sorso.auth.name", name);
      localStorage.setItem("sorso.auth.skipped", "1"); localStorage.setItem("sorso-nota-scala2", "1"); localStorage.setItem("sorso-lang", "it");
    }, [p.token, p.username, who]);
    await page.goto(d.url + "/", { waitUntil: "load" }); await page.waitForTimeout(700);
    await page.click(vp && vp.width >= 1100 ? '#nav [data-tab="circles"]' : '[data-tab="circles"]'); await page.waitForTimeout(400);
    await page.locator('[data-circ="open"]').first().click();
    await page.locator("#circFrame").waitFor();
    return { ctx, page, frame: page.frameLocator("#circFrame") };
  }

  /* --- Anna accende il gioco e crea una serata con un vino --- */
  const A = await open("anna", { width: 1440, height: 900 });
  await A.page.locator('[data-circ="game"]').click();
  await A.page.locator("#circMsg", { hasText: "Gioco attivato" }).waitFor({ timeout: 8000 }).then(() => ok(true, "il Proprietario attiva il gioco"), () => ok(false, "gioco non attivato"));
  await A.frame.locator('[data-act="new-single"]').waitFor({ timeout: 8000 });
  await A.frame.locator('[data-act="new-single"]').click();
  await A.frame.locator("#f-name").fill("Etna Rosso"); await A.frame.locator("#f-prod").fill("Benanti");
  await A.frame.locator('[data-act="submit-form"]').click();
  await A.frame.locator(".game").first().waitFor({ timeout: 8000 });
  ok(await A.frame.locator(".g-field.edit").count() === 1, "nel vino c'è il gioco con il campo");
  ok(/corpo/i.test(await A.frame.locator(".g-field").first().innerText()) && /acidità/i.test(await A.frame.locator(".g-field").first().innerText()), "il primo vino: corpo e acidità");
  await A.frame.locator(".g-price-in").fill("22"); await A.frame.locator('[data-act="g-price"]').click();
  await A.frame.locator(".saved-note", { hasText: "Prezzo salvato" }).waitFor({ timeout: 5000 }).then(() => ok(true, "l'organizzatore scrive il prezzo vero"), () => ok(false, "prezzo non salvato"));

  /* --- Carla gioca dal telefono: tocca il campo, pronostico, prezzo --- */
  const B = await open("carla");
  await B.frame.locator('[data-act="open"]').first().click();
  const field = B.frame.locator(".g-field.edit").first(); await field.waitFor({ timeout: 8000 });
  ok(/Tocca il campo/.test(await field.innerText()), "prima di giocare: «Tocca il campo per metterti»");
  await field.scrollIntoViewIfNeeded(); await B.page.waitForTimeout(150);
  const box = await field.boundingBox();
  await B.page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.3);
  await B.page.waitForTimeout(200);
  const dot = B.frame.locator(".g-dot.me"); ok(await dot.count() === 1, "toccando il campo compare la mia faccia");
  /* trascinata più in là */
  const db = await dot.boundingBox();
  await B.page.mouse.move(db.x + db.width / 2, db.y + db.height / 2); await B.page.mouse.down();
  await B.page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.2, { steps: 6 }); await B.page.mouse.up();
  await B.frame.locator("input[data-g=p]").fill("85"); await B.frame.locator("input[data-g=e]").fill("25");
  await B.frame.locator('[data-act="g-play"]').click();
  await B.frame.locator(".saved-note", { hasText: "Mosse salvate" }).waitFor({ timeout: 5000 }).then(() => ok(true, "Carla salva le mosse"), () => ok(false, "mosse non salvate"));
  ok(/Aggiorna le mosse/.test(await B.frame.locator('[data-act="g-play"]').innerText()), "poi il pulsante diventa «Aggiorna le mosse»");
  /* tastiera: la faccia si sposta con le frecce */
  const before = await B.frame.locator(".g-dot.me").getAttribute("data-gx");
  await B.frame.locator(".g-dot.me").focus(); await B.page.keyboard.press("ArrowLeft");
  ok(Number(await B.frame.locator(".g-dot.me").getAttribute("data-gx")) === Number(before) - 0.5, "con la tastiera: freccia sinistra sposta la faccia di mezzo punto");
  ok(!(await B.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), "telefono: nessuno scorrimento orizzontale");
  if (SHOTS) await B.frame.locator(".game").first().screenshot({ path: SHOTS + "/gioco-prima.png" });

  /* --- Bea gioca e vota, Carla vota: le facce si accendono, nessuno vede le mosse degli altri --- */
  const E = require("../../api/embed");
  let kk = 0; const Em = async (who, b) => (await call(E, { method: "POST", headers: { authorization: "Bearer " + people[who].token, "x-forwarded-for": "7.1.1." + (kk++ % 200) }, body: Object.assign({ circle: circle.id }, b) })).body;
  const st = await Em("bea", { op: "state" }); const tid = st.tastings[0].id; const wid = (await Em("bea", { op: "state", tasting: tid })).wines[0].id;
  await Em("bea", { op: "game.play", tasting: tid, wine: wid, x: 2, y: 8, p: 72, e: 12 });
  await Em("bea", { op: "vote", tasting: tid, wine: wid, mode: "smart", giudizi: { occhio: 72, naso: 72, bocca: 72 } });
  await Em("anna", { op: "game.play", tasting: tid, wine: wid, x: 6, y: 5, p: 80 });
  await B.frame.locator('[data-act="refresh"]').click(); await B.page.waitForTimeout(600);
  ok(await B.frame.locator(".g-wf.on").count() >= 2, "le facce di chi ha già giocato si accendono");
  ok(await B.frame.locator(".g-res").count() === 0, "prima dello svelamento nessuno vede le mosse degli altri");
  /* Carla vota dall'interfaccia */
  await B.frame.locator('[data-act="vote"]').first().click();
  await B.frame.locator("#sm-occhio").fill("88"); await B.frame.locator("#sm-naso").fill("88"); await B.frame.locator("#sm-bocca").fill("88");
  await B.frame.locator('[data-act="save-vote"]').click(); await B.page.waitForTimeout(800);
  /* Anna vota: hanno votato tutti, il vino si svela da solo */
  await Em("anna", { op: "vote", tasting: tid, wine: wid, mode: "smart", giudizi: { occhio: 80, naso: 80, bocca: 80 } });
  await B.page.waitForTimeout(6500);      // la nota «Voto salvato» sparisce da sola: dopo, niente ridisegni a sorpresa
  /* il menù in alto resta fisso: si porta la serata appena sotto, così il tocco arriva al pulsante e non al menù */
  await B.page.evaluate(() => { const f = document.getElementById("circFrame"); scrollTo(0, f.getBoundingClientRect().top + scrollY - 140); }); await B.page.waitForTimeout(200);
  await Promise.all([B.page.waitForResponse(r => r.url().includes("/api/embed") && /"op":"game.state"/.test(r.request().postData() || "")), B.frame.locator('[data-act="refresh"]').click()]);
  await B.frame.locator(".g-res").waitFor({ timeout: 8000 }).then(() => ok(true, "votato tutti: il vino si svela da solo"), () => ok(false, "nessuno svelamento"));
  await B.page.waitForTimeout(1200);
  const res = await B.frame.locator(".g-res").innerText();
  ok(/Carla Rossi \(tu\)/.test(res) && /Bea Rossi/.test(res) && /Anna Rossi/.test(res), "allo svelamento tutti vedono i nomi di tutti");
  ok(/88/.test(res) && /72/.test(res), "e i voti di ognuno");
  ok(await B.frame.locator(".g-field:not(.edit) .g-dot").count() === 3 && await B.frame.locator(".g-center").count() === 1, "sul campo tutte le facce e il centro del gruppo");
  ok(/Fuori dal coro/.test(res), "c'è il cartellino «Fuori dal coro»");
  ok(/Prezzo vero: 22/.test(await B.frame.locator(".game").innerText()), "si vede il prezzo vero");
  if (SHOTS) await B.frame.locator(".game").first().screenshot({ path: SHOTS + "/gioco-svelato.png" });
  /* reazione a Bea: emoji e frecciatina */
  const beaRow = B.frame.locator(".g-row", { hasText: "Bea Rossi" });
  await beaRow.locator('[data-act="g-react"][data-e="😂"]').click(); await B.page.waitForTimeout(500);
  await B.frame.locator(".g-row", { hasText: "Bea Rossi" }).locator("select.g-jabsel").selectOption("f6"); await B.page.waitForTimeout(700);
  const beaTxt = await B.frame.locator(".g-row", { hasText: "Bea Rossi" }).innerText();
  ok(/😂/.test(beaTxt) && /Severo come un professore/.test(beaTxt) && /Carla Rossi/.test(beaTxt), "Carla lascia a Bea un 😂 e «Severo come un professore», firmati");
  ok(await B.frame.locator(".g-row.me .g-react").count() === 0, "a sé stessi non si reagisce");

  /* --- Classifica del gioco --- */
  await B.frame.locator('[data-act="back"]').click();
  await B.frame.locator('[data-act="tab"][data-tab="ranking"]').click();
  await B.frame.locator(".g-board .g-boardlist").waitFor({ timeout: 8000 }).then(() => ok(true, "nella Classifica c'è la classifica del gioco"), () => ok(false, "niente classifica del gioco"));
  ok(await B.frame.locator(".g-boardlist li").count() === 3, "con tutti e tre");
  ok(await B.frame.locator(".g-career .g-prog").count() === 1 && await B.frame.locator(".g-ach li").count() === 10, "2.13: la mia carriera con il livello e i dieci traguardi");
  ok(await B.frame.locator(".g-ach li.on").count() >= 1, "almeno «Primo sorso» sbloccato");
  await B.frame.locator('[data-act="g-bmode"][data-v="month"]').click(); await B.page.waitForTimeout(300);
  ok(await B.frame.locator('[data-act="g-bmode"][data-v="month"][aria-pressed="true"]').count() === 1, "si passa alla classifica del mese");
  if (SHOTS) await B.frame.locator(".g-board").screenshot({ path: SHOTS + "/gioco-classifica.png" });

  /* --- tema scuro: il campo si legge --- */
  if (SHOTS) {
    const D = await open("bea", { width: 390, height: 844 }, "dark");
    await D.frame.locator('[data-act="open"]').first().click(); await D.frame.locator(".g-res").waitFor({ timeout: 8000 }); await D.page.waitForTimeout(1200);
    await D.frame.locator(".game").first().screenshot({ path: SHOTS + "/gioco-scuro.png" });
  }

  /* --- spento il gioco, le serate tornano anonime --- */
  await A.page.locator('[data-circ="game"]').click();
  await A.page.locator("#circMsg", { hasText: "Gioco spento" }).waitFor({ timeout: 8000 });
  await A.frame.locator('[data-act="open"]').first().click(); await A.page.waitForTimeout(800);
  ok(await A.frame.locator(".game").count() === 0, "gioco spento: niente nomi né mosse nelle serate");

  ok(errs.length === 0, "nessun errore nelle pagine " + errs.join(" | "));
  await browser.close(); await d.stop();
  console.log(fails ? "\n" + fails + " CONTROLLI FALLITI" : "\nTUTTO OK");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
