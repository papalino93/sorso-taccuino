/* Schermate per la guida «Le cerchie»: l'app con il finto database, nessun servizio vero.
     node docs/guide/shots-cerchie.js */
const path = require("path");
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const dev = require("../../test/helpers/dev-server");
const OUT = path.join(__dirname, "img");
const out = n => path.join(OUT, n);

(async () => {
  const d = await dev.start({ port: 8862, origins: [] });
  const { getRedis } = require("../../api/_redis");
  const redis = getRedis();
  const P = {};
  const nomi = { mario: ["Mario Rossi", "mario.rossi@example.com"], giulia: ["Giulia Bianchi", "giulia@example.com"], luca: ["Luca Verdi", "luca@example.com"], sara: ["Sara Neri", "sara@example.com"] };
  for (const k of Object.keys(nomi)) {
    const username = "google:" + k, token = "tok-" + k;
    await redis.set("user:" + username, JSON.stringify({ provider: "google", email: nomi[k][1], name: nomi[k][0] }));
    await redis.set("session:" + token, username);
    P[k] = { username, token, name: nomi[k][0] };
  }
  const api = async (who, body) => (await (await fetch(d.url + "/api/circles", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + P[who].token }, body: JSON.stringify(body) })).json());
  const c1 = (await api("mario", { op: "create", name: "Corso del giovedì" })).circle;
  await api("mario", { op: "create", name: "Amici della cantina" });
  const inv = (await api("mario", { op: "invite", circle: c1.id, emails: ["giulia@example.com", "luca@example.com"] })).results;
  await api("giulia", { op: "invite.accept", token: inv[0].token });
  await api("luca", { op: "invite.accept", token: inv[1].token });
  const g = await api("mario", { op: "get", circle: c1.id });
  await api("mario", { op: "member.role", circle: c1.id, member: g.members.find(m => m.name.startsWith("Giulia")).mid, role: "admin" });
  await api("mario", { op: "invite", circle: c1.id, emails: ["sara@example.com"] });
  /* un invito in attesa per Sara, anche in una seconda cerchia */
  /* le serate della cerchia: una serata con tre vini e una degustazione di un solo vino */
  const E = async (who, body) => (await (await fetch(d.url + "/api/embed", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + P[who].token }, body: JSON.stringify(Object.assign({ circle: c1.id }, body)) })).json());
  const sm = (a, b, c) => ({ mode: "smart", giudizi: { occhio: a, naso: b, bocca: c } });
  const sv = (await E("giulia", { op: "tasting.create", name: "Brunello 2018", wine: { name: "Brunello di Montalcino", producer: "Podere Esempio", vintage: "2018", type: "Rosso" } }));
  const ser = (await E("mario", { op: "tasting.create", name: "Serata Toscana" })).tasting;
  const vini = [];
  for (const w of [["Chianti Classico", "Castello Prova", "2020"], ["Vino Nobile", "Fattoria Esempio", "2019"], ["Bolgheri Rosso", "Tenuta Demo", "2021"]]) vini.push((await E("mario", { op: "wine.add", tasting: ser.id, wine: { name: w[0], producer: w[1], vintage: w[2], type: "Rosso" } })).wine);
  for (const [who, vs] of [["mario", [86, 82, 78]], ["giulia", [90, 80, 84]], ["luca", [88, 76, 80]]]) for (let i = 0; i < 3; i++) await E(who, Object.assign({ op: "vote", tasting: ser.id, wine: vini[i].id }, sm(vs[i], vs[i], vs[i])));
  await E("giulia", Object.assign({ op: "vote", tasting: sv.tasting.id, wine: sv.wine.id }, sm(92, 90, 91)));
  await E("luca", Object.assign({ op: "vote", tasting: sv.tasting.id, wine: sv.wine.id }, sm(86, 88, 87)));
  const c2 = (await api("giulia", { op: "create", name: "Cena di fine corso" })).circle;
  await api("giulia", { op: "invite", circle: c2.id, emails: ["luca@example.com"] });

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  async function open(who, vp, path) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: vp.width > 900 ? 1.5 : 2 });
    const page = await ctx.newPage();
    await page.addInitScript(([tok, user, name]) => { localStorage.setItem("sorso.auth.token", tok); localStorage.setItem("sorso.auth.user", user); localStorage.setItem("sorso.auth.name", name); localStorage.setItem("sorso.auth.skipped", "1"); }, [P[who].token, P[who].username, P[who].name]);
    await page.goto(d.url + (path || "/"), { waitUntil: "load" }); await page.waitForTimeout(1000);
    await page.evaluate(() => document.querySelectorAll(".coffee-fab").forEach(e => e.style.visibility = "hidden"));
    return { ctx, page };
  }
  const VP = { width: 390, height: 844 };
  /* Luca: ha due cerchie e un invito in attesa */
  let a = await open("luca", VP);
  await a.page.click('[data-tab="circles"]'); await a.page.waitForTimeout(700);
  await a.page.evaluate(() => window.scrollTo(0, 0));
  await a.page.screenshot({ path: out("cerchie-elenco.png") });
  await a.ctx.close();
  /* Mario (Proprietario): dettaglio con persone e inviti */
  a = await open("mario", VP);
  await a.page.click('[data-tab="circles"]'); await a.page.waitForTimeout(500);
  await a.page.locator('[data-circ="open"]').first().click(); await a.page.waitForTimeout(700);
  await a.page.locator("#circFrame").waitFor(); await a.page.waitForTimeout(1200);
  await a.page.evaluate(() => document.getElementById("circMore").scrollIntoView({ block: "start" })); await a.page.waitForTimeout(300);
  await a.page.screenshot({ path: out("cerchie-persone.png") });
  await a.page.evaluate(() => document.querySelector('form[data-circ-form="invite"]').scrollIntoView({ block: "start" }));
  await a.page.waitForTimeout(300);
  await a.page.screenshot({ path: out("cerchie-invita.png") });
  await a.ctx.close();
  /* Luca (Membro): le serate della cerchia, poi la degustazione di un solo vino dopo il voto */
  a = await open("luca", VP);
  await a.page.click('[data-tab="circles"]'); await a.page.waitForTimeout(500);
  await a.page.locator('[data-circ="open"][data-c="' + c1.id + '"]').first().click();
  const fr = a.page.frameLocator("#circFrame");
  await fr.locator('[data-act="open"]').first().waitFor(); await a.page.waitForTimeout(600);
  await a.page.evaluate(() => document.getElementById("circSerate").scrollIntoView({ block: "start" })); await a.page.waitForTimeout(300);
  await a.page.screenshot({ path: out("cerchie-serate.png") });
  await fr.locator('[data-act="open"]', { hasText: "Brunello" }).click(); await fr.locator(".big.team").first().waitFor(); await a.page.waitForTimeout(500);
  await a.page.evaluate(() => document.getElementById("circSerate").scrollIntoView({ block: "start" })); await a.page.waitForTimeout(300);
  await a.page.screenshot({ path: out("cerchie-unvino.png") });
  await a.ctx.close();
  /* Sara arriva dal link */
  const hv = await redis.hgetall("cv:" + c1.id); const invs = []; for (let i = 0; i < hv.length; i += 2) invs.push(JSON.parse(hv[i + 1]));
  a = await open("sara", VP, "/?invito=" + invs.find(i => i.email === "sara@example.com").token);
  await a.page.waitForTimeout(500);
  await a.page.screenshot({ path: out("cerchie-invito.png") });
  await a.ctx.close();
  await browser.close(); await d.stop();
  console.log("fatto");
})().catch(e => { console.error(e); process.exit(1); });
