/* Schermate per le guide: spazio di team (alla cieca, classifica, statistiche) e app (Impostazioni, vista da PC).
   Richiede Playwright globale e l'app su localhost:8765 (python3 -m http.server 8765 --directory public).
     node docs/guide/shots-nuove.js */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const dev = require("../../test/helpers/dev-server");
const jwt = require("../../api/_jwt");
const OUT = path.join(__dirname, "img");
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "test", "e2e", "desktop-seed.json"), "utf8"));

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const d = await dev.start({ port: 8860, origins: [], partner: { theme: {}, name: "Club Demo" } });
  const now = () => Math.floor(Date.now() / 1000);
  const tok = o => jwt.sign(Object.assign({ iss: "demo", sub: "anna", name: "Anna Rossi", team: "sq", role: "member", jti: "j-" + crypto.randomBytes(6).toString("hex"), exp: now() + 300 }, o), d.secret);
  const api = async (b, s) => (await fetch(d.url + "/api/embed", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, s ? { Authorization: "Bearer " + s } : {}), body: JSON.stringify(b) })).json();
  const sess = async o => (await api({ op: "session", token: tok(o) })).session;
  const smart = (a, b, c) => ({ mode: "smart", giudizi: { occhio: a, naso: b, bocca: c } });
  const VP = { width: 390, height: 844 };

  /* una serata normale chiusa (per classifica e statistiche) e una alla cieca */
  const org = await sess({ sub: "org", name: "Olga Bianchi", role: "organizer" });
  const norm = (await api({ op: "tasting.create", name: "Serata Nebbiolo e dintorni" }, org)).tasting;
  const nv = [];
  for (const [n, p, v, ty] of [["Barbaresco Asili", "Cantina del Pino", "2020", "Rosso"], ["Etna Rosso Rampante", "Tenuta delle Sciare", "2021", "Rosso"], ["Vermentino di Gallura", "Li Cuppulati", "2023", "Bianco"]])
    nv.push((await api({ op: "wine.add", tasting: norm.id, wine: { name: n, producer: p, vintage: v, type: ty } }, org)).wine);
  const voti = [[90, 84, 78], [92, 80, 74], [88, 86, 80], [94, 82, 76]];
  for (const [i, v] of voti.entries()) {
    const s = await sess({ sub: "u" + i, name: "Ospite " + i });
    for (const [k, w] of nv.entries()) await api(Object.assign({ op: "vote", tasting: norm.id, wine: w.id }, smart(v[k], v[k], v[k])), s);
  }
  const anna = await sess({});
  await api(Object.assign({ op: "vote", tasting: norm.id, wine: nv[0].id }, smart(96, 94, 95)), anna);
  await api(Object.assign({ op: "vote", tasting: norm.id, wine: nv[1].id }, smart(80, 78, 82)), anna);
  await api(Object.assign({ op: "vote", tasting: norm.id, wine: nv[2].id }, smart(76, 74, 75)), anna);
  await api({ op: "tasting.status", tasting: norm.id, status: "closed" }, org);

  const bl = (await api({ op: "tasting.create", name: "Alla cieca di giovedì", blind: true }, org)).tasting;
  const bw = [];
  for (const [n, p, v, ty, g] of [["Barolo Cannubi", "Rinaldi", "2018", "Rosso", "Nebbiolo"], ["Verdicchio Classico", "Bucci", "2021", "Bianco", "Verdicchio"], ["Franciacorta Brut", "Ca' del Bosco", "2019", "Spumante", "Chardonnay"]])
    bw.push((await api({ op: "wine.add", tasting: bl.id, wine: { name: n, producer: p, vintage: v, type: ty, grape: g } }, org)).wine);
  for (const [i, v] of [[0, [88, 82, 90]], [1, [90, 79, 92]], [2, [85, 84, 88]]]) {
    const s = await sess({ sub: "b" + i, name: "Ospite " + i });
    for (const [k, w] of bw.entries()) { await api(Object.assign({ op: "vote", tasting: bl.id, wine: w.id }, smart(v[k], v[k], v[k])), s); }
    await api({ op: "guess", tasting: bl.id, wine: bw[0].id, type: "Rosso", grape: i === 0 ? "Nebbiolo" : "Sangiovese", year: String(2018 + (i % 2)) }, s);
    await api({ op: "guess", tasting: bl.id, wine: bw[1].id, type: "Bianco", grape: "Vermentino" }, s);
  }

  const apri = async (user, vp, scheme) => {
    const ctx = await browser.newContext({ viewport: vp || VP, colorScheme: scheme || "light", deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(d.url + "/embed?p=demo#token=" + tok(user || {}));
    await page.locator(".title").waitFor();
    return { ctx, page };
  };
  const out = n => path.join(OUT, n);

  /* partecipante: cieca non svelata, con il modulo dell'ipotesi aperto */
  let c = await apri({ sub: "anna", name: "Anna Rossi" });
  await c.page.locator(".card.link", { hasText: "Alla cieca" }).click();
  await c.page.locator(".wine").first().waitFor();
  await c.page.screenshot({ path: out("team-cieca-1.png") });
  await c.page.locator('[data-act="guess"]').first().click();
  await c.page.locator("#g-type").selectOption("Rosso");
  await c.page.locator("#g-grape").fill("Nebbiolo"); await c.page.locator("#g-year").fill("2018");
  await c.page.locator("#g-title").scrollIntoViewIfNeeded();
  await c.page.evaluate(() => document.querySelector("#g-title").scrollIntoView({ block: "start" }));
  await c.page.screenshot({ path: out("team-cieca-2.png") });
  await c.page.locator('[data-act="submit-guess"]').click();
  await c.page.locator(".guess .chip", { hasText: "Nebbiolo" }).waitFor();
  await c.ctx.close();

  /* organizzatore: pulsante «Svela i vini» */
  c = await apri({ sub: "org", name: "Olga Bianchi", role: "organizer" });
  await c.page.locator(".card.link", { hasText: "Alla cieca" }).click();
  await c.page.locator(".wine").first().waitFor();
  await c.page.screenshot({ path: out("team-cieca-org.png") });
  await c.ctx.close();

  /* svelata */
  await api({ op: "tasting.reveal", tasting: bl.id }, org);
  c = await apri({ sub: "anna", name: "Anna Rossi" });
  await c.page.locator(".card.link", { hasText: "Alla cieca" }).click();
  await c.page.locator(".wine .name", { hasText: "Barolo" }).waitFor();
  await c.page.screenshot({ path: out("team-svelata-1.png") });
  await c.page.evaluate(() => document.querySelector(".wine").scrollIntoView({ block: "start" }));
  await c.page.screenshot({ path: out("team-svelata-2.png") });
  /* classifica e statistiche */
  await c.page.evaluate(() => window.scrollTo(0, 0));
  await c.page.locator('[data-act="back"]').click(); await c.page.locator(".tabs").waitFor();
  await c.page.locator('[data-act="tab"][data-tab="ranking"]').click(); await c.page.locator(".card.link").first().waitFor();
  await c.page.screenshot({ path: out("team-classifica.png") });
  await c.page.locator('[data-act="tab"][data-tab="stats"]').click(); await c.page.locator(".toplist").waitFor();
  await c.page.screenshot({ path: out("team-statistiche-1.png") });
  await c.page.evaluate(() => document.querySelector(".toplist").scrollIntoView({ block: "start" }));
  await c.page.screenshot({ path: out("team-statistiche-2.png") });
  await c.ctx.close();
  await d.stop();

  /* app personale: Impostazioni (telefono) e vista da PC */
  const app = async (vp, scheme, init) => {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme || "light", deviceScaleFactor: vp.width > 900 ? 1.5 : 2 });
    const page = await ctx.newPage();
    await page.addInitScript(o => { if (!localStorage.getItem("seeded")) { localStorage.setItem("sorso.auth.skipped", "1"); Object.keys(o).forEach(k => localStorage.setItem(k, JSON.stringify(o[k]))); localStorage.setItem("seeded", "1"); localStorage.setItem("sorso-nota-scala2", "1"); } }, seed);
    await page.goto("http://localhost:8765/", { waitUntil: "load" }); await page.waitForTimeout(1200);
    return { ctx, page };
  };
  let a = await app(VP);
  await a.page.click("#settingsBtn"); await a.page.waitForTimeout(500);
  await a.page.evaluate(() => { document.querySelectorAll(".coffee-fab").forEach(e => e.style.visibility = "hidden"); window.scrollTo(0, 0); });
  await a.page.screenshot({ path: out("app-impostazioni.png") });
  await a.ctx.close();
  a = await app({ width: 1440, height: 900 });
  await a.page.evaluate(() => document.querySelectorAll(".coffee-fab").forEach(e => e.style.visibility = "hidden"));
  await a.page.screenshot({ path: out("desk-nuova.png") });
  await a.page.click('#nav [data-tab="book"]'); await a.page.waitForTimeout(500);
  await a.page.screenshot({ path: out("desk-taccuino.png") });
  await a.page.click('#nav [data-tab="stats"]'); await a.page.waitForTimeout(600);
  await a.page.screenshot({ path: out("desk-statistiche.png") });
  await a.ctx.close();
  await browser.close();
  console.log("fatto");
})().catch(e => { console.error(e); process.exit(1); });
