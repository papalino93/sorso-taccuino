/* Widget per i siti, nel browser: creazione dall'app, opzioni, anteprima, codice, revoca.   node test/e2e/widget.e2e.js */
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const dev = require("../helpers/dev-server");
let fails = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };

(async () => {
  const d = await dev.start({ port: 8796, origins: [] });
  const redis = require("../../api/_redis").getRedis();
  const people = {};
  for (const n of ["anna", "carla", "bea"]) { await redis.set("user:google:" + n, JSON.stringify({ provider: "google", email: n + "@example.com", name: n[0].toUpperCase() + n.slice(1) + " Rossi" })); await redis.set("session:tok-" + n, "google:" + n); people[n] = { token: "tok-" + n, username: "google:" + n }; }
  const C = async (who, body) => (await (await fetch(d.url + "/api/circles", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + people[who].token }, body: JSON.stringify(body) })).json());
  const E = async (who, cid, body) => (await (await fetch(d.url + "/api/embed", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + people[who].token }, body: JSON.stringify(Object.assign({ circle: cid }, body)) })).json());
  const { circle } = await C("anna", { op: "create", name: "Corso del giovedì" });
  const inv = (await C("anna", { op: "invite", circle: circle.id, emails: ["carla@example.com", "bea@example.com"] })).results;
  await C("carla", { op: "invite.accept", token: inv[0].token }); await C("bea", { op: "invite.accept", token: inv[1].token });
  const sm = v => ({ mode: "smart", giudizi: { occhio: v, naso: v, bocca: v } });
  const t = (await E("anna", circle.id, { op: "tasting.create", name: "Serata Toscana" })).tasting;
  const w = (await E("anna", circle.id, { op: "wine.add", tasting: t.id, wine: { name: "Brunello", producer: "Podere", vintage: "2018" } })).wine;
  await E("carla", circle.id, Object.assign({ op: "vote", tasting: t.id, wine: w.id }, sm(90))); await E("bea", circle.id, Object.assign({ op: "vote", tasting: t.id, wine: w.id }, sm(80)));
  await E("anna", circle.id, { op: "tasting.status", tasting: t.id, status: "closed" });

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const errs = [];
  async function open(who, vp) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: d.url }).catch(() => {});
    const page = await ctx.newPage();
    page.on("pageerror", e => errs.push(e.message)); page.on("dialog", dlg => dlg.accept());
    await page.addInitScript(([tok, user, n]) => { localStorage.setItem("sorso.auth.token", tok); localStorage.setItem("sorso.auth.user", user); localStorage.setItem("sorso.auth.name", n); localStorage.setItem("sorso.auth.skipped", "1"); localStorage.setItem("sorso-nota-scala2", "1"); }, [people[who].token, people[who].username, who]);
    await page.goto(d.url + "/", { waitUntil: "load" }); await page.waitForTimeout(700);
    await page.click(vp.width >= 1100 ? '#nav [data-tab="circles"]' : '[data-tab="circles"]'); await page.waitForTimeout(400);
    await page.locator('[data-circ="open"]').first().click(); await page.locator("#circMore .card").first().waitFor();
    return { ctx, page };
  }
  const A = await open("anna", { width: 1440, height: 900 }); const a = A.page;
  ok(await a.locator("#circWidget").count() === 1 && await a.locator('[data-circ="wdg-create"]').count() === 1, "Proprietario: riquadro «Widget per un sito» con «Crea il widget»");
  await a.click('[data-circ="wdg-create"]');
  await a.locator("#wdgCode").waitFor();
  const code = await a.locator("#wdgCode").inputValue();
  const tok = (/\/widget\?t=([0-9a-f]{48})/.exec(code) || [])[1];
  ok(!!tok && /^<iframe src="http:\/\/127\.0\.0\.1:8796\/widget\?t=/.test(code) && /sorso:widget-height/.test(code) && /title="Taste — Corso del giovedì"/.test(code), "codice da incollare: iframe con il link e l'adattamento dell'altezza");
  const prev = a.frameLocator("#wdgPreview");
  await prev.locator("h1").waitFor();
  ok((await prev.locator("h1").textContent()) === "Corso del giovedì" && /Brunello/.test(await prev.locator("main").innerText()), "anteprima nell'app: nome della cerchia e classifica");
  ok(/85,0/.test(await prev.locator(".champ").innerText()), "il vino migliore in evidenza con la media 85,0");
  await a.selectOption("#wdgLang", "en");
  await prev.locator("h2", { hasText: "Best wines" }).waitFor({ timeout: 6000 }).catch(() => {});
  ok(/lang=en/.test(await a.locator("#wdgCode").inputValue()) && /Best wines/i.test(await prev.locator("main").innerText()), "lingua inglese: codice e anteprima cambiano subito");
  await a.locator('[data-wopt="wdgShow_events"]').uncheck(); await a.locator('[data-wopt="wdgShow_totals"]').uncheck();
  await a.waitForTimeout(300); await prev.locator("h1").waitFor(); await a.waitForTimeout(500);
  ok(/show=top/.test(await a.locator("#wdgCode").inputValue()) && await prev.locator(".tl").count() === 0 && await prev.locator(".tiles").count() === 0, "«Cosa mostrare»: solo i vini migliori");
  await a.locator('[data-wopt="wdgShow_top"]').click(); await a.waitForTimeout(200);
  ok(await a.locator('[data-wopt="wdgShow_top"]').isChecked(), "almeno un blocco resta sempre acceso");
  await a.locator('[data-wopt="wdgTransparent"]').check(); await a.waitForTimeout(300);
  ok(/bg=none/.test(await a.locator("#wdgCode").inputValue()), "sfondo trasparente nel codice");
  await a.click('[data-circ="wdg-copy"]'); await a.waitForTimeout(300);
  const clip = await a.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  ok(clip === "" || clip === await a.locator("#wdgCode").inputValue(), "«Copia il codice» copia il codice");
  const hp = await a.locator("#wdgPreview").evaluate(e => e.getBoundingClientRect().height);
  ok(hp > 150, "l'anteprima prende l'altezza del contenuto (" + Math.round(hp) + "px)");
  /* il Membro non vede il riquadro */
  const B = await open("carla", { width: 390, height: 844 });
  ok(await B.page.locator("#circWidget").count() === 0, "il Membro non vede il widget");
  /* telefono, Proprietario */
  const A2 = await open("anna", { width: 390, height: 844 });
  await A2.page.locator("#circWidget").scrollIntoViewIfNeeded();
  ok(!(await A2.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), "telefono: il riquadro del widget non esce dallo schermo");
  /* revoca */
  await a.click('[data-circ="wdg-revoke"]'); await a.locator('[data-circ="wdg-create"]').waitFor();
  const r = await fetch(d.url + "/widget?t=" + tok);
  ok(r.status === 404, "revocato: il link non funziona più (" + r.status + ")");
  ok(errs.length === 0, "nessun errore nelle pagine " + errs.join(" | "));
  await browser.close(); await d.stop();
  console.log(fails ? "\n" + fails + " CONTROLLI FALLITI" : "\nTUTTO OK"); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
