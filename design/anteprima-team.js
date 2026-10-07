/* Genera le anteprime reali dello spazio di team con il design B: telefono e desktop, chiaro e scuro,
   e due temi partner. Richiede Playwright globale.   node design/anteprima-team.js */
const crypto = require("crypto");
const path = require("path");
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const dev = require("../test/helpers/dev-server");
const jwt = require("../api/_jwt");
const OUT = path.join(__dirname, "anteprime");

const TEMI = {
  base: {},
  vinaccia: { accent: "#8c1d3f", bg: "#fbf6f1", ink: "#2a1a1f", title: "Enoteca Ruggeri", font: "serif" },
  verde: { accent: "#0f7a4d", bg: "#0e1512", ink: "#e9f3ee", title: "Club del Bosco", font: "rounded" }
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const [nome, tema] of Object.entries(TEMI)) {
    const d = await dev.start({ port: 8840 + Object.keys(TEMI).indexOf(nome), origins: [], partner: { theme: tema, name: tema.title || "Club Demo" } });
    const now = () => Math.floor(Date.now() / 1000);
    const tok = o => jwt.sign(Object.assign({ iss: "demo", sub: "u1", name: "Anna", team: "sq", role: "member", jti: "j-" + crypto.randomBytes(6).toString("hex"), exp: now() + 300 }, o), d.secret);
    const api = async (b, s) => (await fetch(d.url + "/api/embed", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, s ? { Authorization: "Bearer " + s } : {}), body: JSON.stringify(b) })).json();
    const org = (await api({ op: "session", token: tok({ sub: "org", name: "Olga", role: "organizer" }) })).session;
    const t = (await api({ op: "tasting.create", name: "Serata Nebbiolo e dintorni" }, org)).tasting;
    const vini = [["Barbaresco Asili", "Cantina del Pino", "2020"], ["Etna Rosso Contrada Rampante", "Tenuta delle Sciare", "2021"], ["Taurasi Riserva", "Terre d'Irpinia", "2017"], ["Vermentino di Gallura", "Cantina Li Cuppulati", "2023"]];
    const w = [];
    for (const [name, producer, vintage] of vini) w.push((await api({ op: "wine.add", tasting: t.id, wine: { name, producer, vintage } }, org)).wine);
    const smart = (a, b, c) => ({ mode: "smart", giudizi: { occhio: a, naso: b, bocca: c } });
    const full = n => ({ mode: "full", voti: { v: { qualita: n }, o: { intensita: n, complessita: n, qualita: n }, g: { equilibrio: n, intensita: n, persistenza: n, qualita: n }, f: { armonia: n } } });
    const altri = [];
    for (let i = 0; i < 4; i++) altri.push((await api({ op: "session", token: tok({ sub: "x" + i, name: "Ospite " + i }) })).session);
    for (const s of altri) { await api(Object.assign({ op: "vote", tasting: t.id, wine: w[0].id }, smart(88, 92, 86)), s); await api(Object.assign({ op: "vote", tasting: t.id, wine: w[1].id }, full(8)), s); }
    const anna = (await api({ op: "session", token: tok({}) })).session;
    await api(Object.assign({ op: "vote", tasting: t.id, wine: w[0].id }, smart(100, 100, 99)), anna);   // 99: tinta piena
    await api(Object.assign({ op: "vote", tasting: t.id, wine: w[1].id }, full(8)), anna);

    for (const scheme of ["light", "dark"]) {
      for (const [dev_, vp] of [["mobile", { width: 390, height: 844 }], ["desktop", { width: 760, height: 900 }]]) {
        const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 2 });
        const page = await ctx.newPage();
        const tag = `team-${nome}-${dev_}-${scheme}`;
        await page.goto(d.url + "/embed?p=demo#token=" + tok({}));
        await page.locator(".title").waitFor();
        await page.screenshot({ path: path.join(OUT, tag + "-1-elenco.png"), fullPage: true });
        await page.locator(".card.link").first().click();
        await page.locator(".wine").first().waitFor();
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(OUT, tag + "-2-vini.png"), fullPage: true });
        if (nome === "base" || scheme === "light") {
          await page.locator('[data-act="vote"]').first().click();    // il vino non votato (Taurasi)
          await page.locator("#sh-title").waitFor();
          await page.locator("#sm-occhio").fill("85"); await page.locator("#sm-naso").fill("92"); await page.locator("#sm-bocca").fill("88");
          await page.screenshot({ path: path.join(OUT, tag + "-3-voto-rapido.png"), fullPage: true });
          await page.locator('.modes [data-mode="full"]').click();
          await page.screenshot({ path: path.join(OUT, tag + "-4-scheda-completa.png"), fullPage: true });
        }
        await ctx.close();
      }
    }
    await d.stop();
  }
  await browser.close();
  console.log("fatto");
})().catch(e => { console.error(e); process.exit(1); });
