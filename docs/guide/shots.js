/* Schermate vere per le guide (telefono 390×844, doppia densità). Richiede Playwright globale e l'app su
   localhost:8765 (python3 -m http.server 8765 --directory public).   node docs/guide/shots.js */
const crypto = require("crypto");
const path = require("path");
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const dev = require("../../test/helpers/dev-server");
const jwt = require("../../api/_jwt");
const OUT = path.join(__dirname, "img");

const TEMI = {
  base: {},
  vinaccia: { accent: "#8c1d3f", bg: "#fbf6f1", ink: "#2a1a1f", title: "Enoteca Ruggeri", font: "serif" },
  bosco: { accent: "#0f7a4d", bg: "#0e1512", ink: "#e9f3ee", title: "Club del Bosco", font: "rounded" }
};
const VP = { width: 390, height: 844 };

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  let porta = 8850;
  for (const [nome, tema] of Object.entries(TEMI)) {
    const d = await dev.start({ port: porta++, origins: [], partner: { theme: tema, name: tema.title || "Club Demo" } });
    const now = () => Math.floor(Date.now() / 1000);
    const tok = o => jwt.sign(Object.assign({ iss: "demo", sub: "u1", name: "Anna Rossi", team: "sq", role: "member", jti: "j-" + crypto.randomBytes(6).toString("hex"), exp: now() + 300 }, o), d.secret);
    const api = async (b, s) => (await fetch(d.url + "/api/embed", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, s ? { Authorization: "Bearer " + s } : {}), body: JSON.stringify(b) })).json();
    const sess = async o => (await api({ op: "session", token: tok(o) })).session;
    const org = await sess({ sub: "org", name: "Olga Bianchi", role: "organizer" });
    const t = (await api({ op: "tasting.create", name: "Serata Nebbiolo e dintorni" }, org)).tasting;
    await api({ op: "tasting.create", name: "Cena di fine estate" }, org);
    const w = [];
    for (const [name, producer, vintage] of [["Barbaresco Asili", "Cantina del Pino", "2020"], ["Etna Rosso Contrada Rampante", "Tenuta delle Sciare", "2021"], ["Taurasi Riserva", "Terre d'Irpinia", "2017"], ["Vermentino di Gallura", "Cantina Li Cuppulati", "2023"]]) w.push((await api({ op: "wine.add", tasting: t.id, wine: { name, producer, vintage } }, org)).wine);
    const smart = (a, b, c) => ({ mode: "smart", giudizi: { occhio: a, naso: b, bocca: c } });
    const full = n => ({ mode: "full", voti: { v: { qualita: n }, o: { intensita: n, complessita: n, qualita: n }, g: { equilibrio: n, intensita: n, persistenza: n, qualita: n }, f: { armonia: n } } });
    for (let i = 0; i < 5; i++) { const s = await sess({ sub: "x" + i, name: "Ospite " + i }); await api(Object.assign({ op: "vote", tasting: t.id, wine: w[0].id }, smart(88, 92, 86)), s); await api(Object.assign({ op: "vote", tasting: t.id, wine: w[1].id }, full(8)), s); }
    const anna = await sess({});
    await api(Object.assign({ op: "vote", tasting: t.id, wine: w[0].id }, smart(100, 100, 99)), anna);
    await api(Object.assign({ op: "vote", tasting: t.id, wine: w[1].id }, full(8)), anna);

    const apri = async (user, scheme) => {
      const ctx = await browser.newContext({ viewport: VP, colorScheme: scheme || "light", deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.goto(d.url + "/embed?p=demo#token=" + tok(user || {}));
      await page.locator(".title").waitFor();
      return { ctx, page };
    };
    const shot = (page, name) => page.screenshot({ path: path.join(OUT, `team-${nome}-${name}.png`) });
    const entra = async page => { await page.locator(".card.link", { hasText: "Serata Nebbiolo" }).click(); await page.locator(".wine").first().waitFor(); await page.waitForTimeout(500); };

    /* partecipante, chiaro */
    let c = await apri({});
    await shot(c.page, "1-elenco");
    await entra(c.page);
    await shot(c.page, "2-vini");
    if (nome === "base") {
      await c.page.locator('[data-act="vote"]').first().click();
      await c.page.locator("#sh-title").waitFor();
      await c.page.locator("#sm-occhio").fill("85"); await c.page.locator("#sm-naso").fill("92"); await c.page.locator("#sm-bocca").fill("88");
      await c.page.evaluate(() => window.scrollTo(0, 0));
      await shot(c.page, "3-voto-rapido");
      await c.page.locator('.modes [data-mode="full"]').click();
      await c.page.waitForTimeout(200);
      await shot(c.page, "4-scheda-completa");
    }
    await c.ctx.close();

    if (nome === "base") {
      /* scuro */
      c = await apri({}, "dark"); await entra(c.page); await shot(c.page, "5-vini-scuro"); await c.ctx.close();
      /* organizzatore */
      c = await apri({ sub: "org", name: "Olga Bianchi", role: "organizer" });
      await shot(c.page, "6-org-elenco");
      await c.page.locator('[data-act="new-tasting"]').click(); await c.page.locator("#f-name").fill("Serata di primavera");
      await shot(c.page, "7-org-nuova");
      await c.page.locator('[data-act="cancel-form"]').click();
      await entra(c.page);
      await shot(c.page, "8-org-degustazione");
      await c.page.locator('[data-act="ask-status"]').click(); await c.page.waitForTimeout(200);
      await shot(c.page, "9-org-chiudi");
      await c.page.locator('[data-act="do-confirm"]').click(); await c.page.waitForTimeout(800);
      await shot(c.page, "10-org-chiusa");
      await c.ctx.close();
      /* accesso scaduto */
      const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 }); const page = await ctx.newPage();
      await page.goto(d.url + "/embed?p=demo#token=xxx.yyy.zzz"); await page.locator(".fatal").waitFor();
      await shot(page, "11-accesso"); await ctx.close();
    }
    await d.stop();
  }
  await browser.close();
  console.log("fatto");
})().catch(e => { console.error(e); process.exit(1); });
