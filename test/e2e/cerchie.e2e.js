/* Cerchie nel browser: creare, invitare con il link, accettare, ruoli, uscire, eliminare.
     node test/e2e/cerchie.e2e.js */
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const dev = require("../helpers/dev-server");

let fails = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };

(async () => {
  const d = await dev.start({ port: 8790, origins: [] });
  const { getRedis } = require("../../api/_redis");
  const redis = getRedis();
  const people = {};
  async function account(name, email) {
    const username = "google:" + name, token = "tok-" + name;
    await redis.set("user:" + username, JSON.stringify({ provider: "google", email, name: name[0].toUpperCase() + name.slice(1) + " Rossi" }));
    await redis.set("session:" + token, username);
    people[name] = { username, token };
  }
  await account("anna", "anna@example.com"); await account("bruno", "bruno@example.com"); await account("carla", "carla@example.com");

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const errs = [];
  async function open(who, vp, lang, path) {
    const ctx = await browser.newContext({ viewport: vp || { width: 390, height: 844 } });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: d.url }).catch(() => {});
    const page = await ctx.newPage();
    page.on("pageerror", e => errs.push("pageerror: " + e.message));
    page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });
    page.on("dialog", dlg => dlg.accept(dlg.type() === "prompt" ? (page._promptAnswer || "") : undefined));
    const p = people[who];
    await page.addInitScript(([tok, user, name, lg]) => {
      if (tok) { localStorage.setItem("sorso.auth.token", tok); localStorage.setItem("sorso.auth.user", user); localStorage.setItem("sorso.auth.name", name); }
      localStorage.setItem("sorso.auth.skipped", "1"); if (lg) localStorage.setItem("sorso-lang", lg);
    }, [p && p.token, p && p.username, who, lang || ""]);
    await page.goto(d.url + (path || "/"), { waitUntil: "load" }); await page.waitForTimeout(900);
    return { ctx, page };
  }
  const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const goCircles = async (page, pc) => { await page.click(pc ? '#nav [data-tab="circles"]' : '[data-tab="circles"]'); await page.waitForTimeout(500); };

  /* --- Anna crea una cerchia e invita Bruno e Carla --- */
  const A = await open("anna"); const a = A.page;
  await goCircles(a);
  ok(/Non fai ancora parte di nessuna cerchia/.test(await a.locator("#circWrap").innerText()), "all'inizio nessuna cerchia");
  await a.fill("#circNewName", "Corso del giovedì"); await a.click('[data-circ-form="create"] button[type=submit]');
  await a.locator(".card-head .eyebrow", { hasText: "Corso del giovedì" }).waitFor();
  ok(/Proprietario/.test(await a.locator("#circWrap").innerText()), "Anna è Proprietario");
  await a.fill("#circEmails", "bruno@example.com, carla@example.com, sbagliata");
  await a.click('[data-circ-form="invite"] button[type=submit]');
  await a.locator('[data-circ="copy"]').first().waitFor();
  ok(await a.locator('[data-circ="copy"]').count() === 2, "due inviti in attesa con «Copia il link»");
  ok(/indirizzo non valido/.test(await a.locator("#circWrap").innerText()), "l'indirizzo sbagliato è segnalato");
  ok(!(await overflow(a)), "telefono: nessuno scorrimento orizzontale");
  const tokens = (await redis.keys("cl:*")).map(k => k.slice(3));
  ok(tokens.length === 2, "due link d'invito nel database");

  /* --- il link: il banner compare, il codice sparisce dall'indirizzo --- */
  const B = await open("bruno", null, "", "/?invito=" + tokens[0]); const b = B.page;
  await b.locator("#circWrap .card-head .eyebrow", { hasText: /Invito a/ }).waitFor();
  ok(true, "il link d'invito apre le Cerchie con il banner dell'invito");
  ok(!/\?invito=/.test(b.url()), "il codice sparisce dall'indirizzo");
  await B.ctx.close();

  /* ricostruisco chi è chi: l'invito di Bruno e quello di Carla */
  const cid = (await redis.keys("ci:*"))[0].slice(3);
  const hv = await redis.hgetall("cv:" + cid);
  const invs = []; for (let i = 0; i < hv.length; i += 2) invs.push(JSON.parse(hv[i + 1]));
  const tokOf = email => invs.find(i => i.email === email).token;

  const Bn = await open("bruno", null, "", "/?invito=" + tokOf("carla@example.com")); const bn = Bn.page;
  ok(/è per ca•••@example\.com/.test(await bn.locator("#circWrap").innerText()), "con il link di un altro: «questo invito è per ca•••@…», mail mascherata");
  ok(await bn.locator('[data-circ="accept-link"]').count() === 0, "nessun pulsante «Accetta» per l'account sbagliato");
  await Bn.ctx.close();

  const Bo = await open("bruno", null, "", "/?invito=" + tokOf("bruno@example.com")); const bo = Bo.page;
  await bo.locator('[data-circ="accept-link"]').click();
  await bo.locator(".circ-name", { hasText: "Corso del giovedì" }).waitFor();
  ok(/Membro/.test(await bo.locator("#circWrap").innerText()), "Bruno accetta con il link ed entra come Membro");
  await bo.click('[data-circ="open"]'); await bo.locator(".card-head .eyebrow", { hasText: "Corso del giovedì" }).waitFor();
  ok(await bo.locator('[data-circ="remove"], [data-circ="role"], [data-circ="rename"], form[data-circ-form="invite"]').count() === 0, "il Membro non vede comandi da amministratore");
  ok(!/anna@example\.com/.test(await bo.locator("#circWrap").innerText()), "il Membro non vede le mail degli altri");

  /* --- Carla accetta dall'elenco, senza link --- */
  const C = await open("carla"); const c = C.page;
  await goCircles(c);
  await c.locator('[data-circ="accept"]').click();
  await c.locator(".circ-name", { hasText: "Corso del giovedì" }).waitFor();
  ok(true, "Carla accetta dall'elenco inviti");

  /* --- Anna promuove Bruno ad amministratore, poi gli passa la proprietà? no: lo promuove e lo toglie Carla --- */
  await a.click('[data-circ="back"]'); await a.locator('[data-circ="open"]').first().click();
  await a.locator(".circ-row", { hasText: "Bruno Rossi" }).waitFor();
  await a.locator(".circ-row", { hasText: "Bruno Rossi" }).locator('[data-circ="role"]').click();
  await a.locator(".circ-row", { hasText: "Bruno Rossi" }).locator(".role-badge.admin").waitFor();
  ok(true, "Anna rende Bruno amministratore");
  ok(await a.locator(".circ-row", { hasText: "Bruno Rossi" }).locator('[data-circ="transfer"]').count() === 1, "il Proprietario può passare la proprietà");
  await a.click('[data-circ="back"]'); await a.waitForTimeout(300);

  /* Bruno, ora amministratore, vede l'invito form e le mail ma non può togliere un altro amministratore */
  await bo.reload(); await bo.waitForTimeout(900); await goCircles(bo);
  await bo.locator('[data-circ="open"]').click();
  await bo.locator('form[data-circ-form="invite"]').waitFor();
  ok(await bo.locator('[data-circ="role"]').count() === 0 && await bo.locator('[data-circ="rename"]').count() === 0, "l'amministratore non cambia ruoli né rinomina");
  ok(await bo.locator('.circ-row', { hasText: "Anna Rossi" }).locator('[data-circ="remove"]').count() === 0, "l'amministratore non può togliere il Proprietario");
  ok(await bo.locator('.circ-row', { hasText: "Carla Rossi" }).locator('[data-circ="remove"]').count() === 1, "l'amministratore può togliere un membro");

  /* --- PC e inglese --- */
  const P = await open("anna", { width: 1366, height: 800 }, "en"); const pc = P.page;
  await goCircles(pc, true);
  await pc.locator("#circWrap").getByText("Your circles").waitFor();
  ok(/Owner/.test(await pc.locator("#circWrap").innerText()), "inglese: «Your circles», «Owner»");
  ok(!(await overflow(pc)), "PC: nessuno scorrimento orizzontale");
  await pc.locator('[data-circ="open"]').first().click(); await pc.locator('form[data-circ-form="invite"]').waitFor();
  await pc.fill("#circEmails", "nuovo@example.com"); await pc.click('[data-circ-form="invite"] button[type=submit]');
  await pc.locator('[data-circ="copy"]').first().waitFor();
  await pc.locator('[data-circ="copy"]').first().click(); await pc.waitForTimeout(300);
  ok(/Link copied|I can't copy/.test(await pc.locator("#circWrap").innerText()), "«Copy link» risponde (inglese)");
  const clip = await pc.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  ok(clip === "" || /\/\?invito=[0-9a-f]{48}$/.test(clip), "il link copiato ha la forma giusta");
  await P.ctx.close();

  /* --- uscire ed eliminare --- */
  await c.reload(); await c.waitForTimeout(900); await goCircles(c);
  await c.locator('[data-circ="open"]').click(); await c.locator('[data-circ="leave"]').click();
  await c.locator("#circWrap").getByText("Non fai ancora parte di nessuna cerchia").waitFor();
  ok(true, "Carla esce dalla cerchia");
  a._promptAnswer = "Corso del giovedì";
  await a.click('[data-circ="open"]'); await a.locator('[data-circ="delete"]').click();
  await a.locator("#circWrap").getByText("Non fai ancora parte di nessuna cerchia").waitFor();
  ok((await redis.keys("ci:*")).length === 0, "Anna elimina la cerchia: sparisce dal database");

  ok(errs.length === 0, "nessun errore JavaScript: " + JSON.stringify(errs));
  await browser.close(); await d.stop();
  console.log(fails ? "\n" + fails + " CONTROLLI FALLITI" : "\nTUTTO OK");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
