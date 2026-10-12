/* Riconoscere il vino (2.7.0): il tuo Taccuino, il catalogo Sorso, Open Food Facts con il codice a barre (scritto o fotografato),
   e il contributo al catalogo quando si salva. Serve la rete (motore di lettura e lettore dei codici la prima volta).
   node test/e2e/riconosci.e2e.js */
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const fs = require("fs"), os = require("os"), path = require("path");
const dev = require("../helpers/dev-server");

let fails = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };

/* un codice a barre EAN-13 disegnato a regola d'arte */
function eanBits(code) {
  const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
  const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
  const R = L.map(p => p.split("").map(b => b === "1" ? "0" : "1").join(""));
  const PAR = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];
  const d = code.split("").map(Number), par = PAR[d[0]];
  let s = "101";
  for (let i = 1; i <= 6; i++) s += (par[i - 1] === "L" ? L : G)[d[i]];
  s += "01010";
  for (let i = 7; i <= 12; i++) s += R[d[i]];
  return s + "101";
}

(async () => {
  const d = await dev.start({ port: 8793, origins: [] });
  const { getRedis } = require("../../api/_redis");
  const redis = getRedis();
  const Cat = require("../../api/_catalog");
  const offCalls = [];
  Cat.setFetch(async url => {
    offCalls.push(url);
    if (url.includes("8000000000002")) return { ok: true, status: 200, json: async () => ({ status: 1, product: { product_name: "Ruffino Rosso di Marte Morellino di Scansano", brands: "Ruffino", categories_tags: ["en:wines", "en:red-wines"] } }) };
    return { ok: false, status: 404, json: async () => ({ status: 0 }) };
  });
  async function account(name) {
    const username = "google:" + name, token = "tok-" + name;
    await redis.set("user:" + username, JSON.stringify({ provider: "google", email: name + "@example.com", name: name[0].toUpperCase() + name.slice(1) + " Rossi" }));
    await redis.set("session:" + token, username);
    return { username, token };
  }
  const anna = await account("anna"); await account("carla"); await account("bea");
  /* nel Taccuino di Anna c'è già un Flaccianello di un'altra annata */
  await redis.set("u:google:anna:degustazione:1700000000000-abc", JSON.stringify({ nome: "Flaccianello della Pieve", produttore: "Fontodi", annata: "2019", tipologia: "Rosso",
    denominazione: "Colli della Toscana Centrale IGT", uvaggi: [{ v: "Sangiovese", p: 100 }], modalita: "smart", giudizi: { occhio: 92, naso: 92, bocca: 92 }, score: 92, scoreScale: 2, modello: 4, timestamp: Date.UTC(2026, 2, 12, 12) }));
  /* nel catalogo Sorso il Giovesone, confermato da due persone */
  const { call } = require("../helpers/env");
  const catalog = require("../../api/catalog");
  for (const who of ["carla", "bea"]) await call(catalog, { method: "POST", headers: { authorization: "Bearer tok-" + who, "x-forwarded-for": "3.3.3.3" }, body: { op: "confirm", wine: { nome: "Giovesone", produttore: "Fattoria del Colle", denominazione: "Orcia DOC", tipologia: "Rosso", vitigni: ["Sangiovese"], annata: "2019" } } });

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  page.on("dialog", dlg => dlg.accept());
  await page.addInitScript(([tok, user]) => {
    localStorage.setItem("sorso.auth.token", tok); localStorage.setItem("sorso.auth.user", user); localStorage.setItem("sorso.auth.name", "Anna Rossi");
    localStorage.setItem("sorso.auth.skipped", "1"); localStorage.setItem("sorso-nota-scala2", "1"); localStorage.setItem("sorso-lang", "it");
  }, [anna.token, anna.username]);
  await page.goto(d.url + "/", { waitUntil: "load" }); await page.waitForTimeout(900);

  async function label(lines, name) {
    const png = await page.evaluate(lines => {
      const c = document.createElement("canvas"); c.width = 1200; c.height = 1600; const x = c.getContext("2d");
      x.fillStyle = "#f4ecd8"; x.fillRect(0, 0, 1200, 1600); x.fillStyle = "#111"; x.textAlign = "center";
      lines.forEach(([t, y, px, w]) => { x.font = (w || "bold") + " " + px + "px Arial, Helvetica, sans-serif"; x.fillText(t, 600, y); });
      return c.toDataURL("image/png").split(",")[1];
    }, lines);
    const f = path.join(os.tmpdir(), name + ".png"); fs.writeFileSync(f, Buffer.from(png, "base64")); return f;
  }
  async function readPhoto(f) {
    if (await page.locator("#removeLabelBtn").isVisible()) await page.click("#removeLabelBtn");
    await page.setInputFiles("#photoInput", f); await page.waitForTimeout(400);
    await page.click("#readLabelBtn");
    await page.locator("#labelRead .lbl-ean").waitFor({ timeout: 180000 });
    await page.waitForFunction(() => !/Cerco il vino/.test(document.getElementById("labelRead").innerText), null, { timeout: 15000 });
  }
  const panel = () => page.locator("#labelRead").innerText();

  /* --- 1. dal Taccuino: stessa etichetta, annata diversa --- */
  await readPhoto(await label([["FONTODI", 220, 96], ["FLACCIANELLO", 520, 120], ["DELLA PIEVE", 660, 120], ["Colli della Toscana Centrale IGT", 800, 56, "normal"], ["2021", 960, 150]], "flaccianello"));
  let txt = await panel();
  ok(/È questo\?/i.test(txt) && /Flaccianello della Pieve · Fontodi/.test(txt), "Taccuino: «È questo?» con il vino già bevuto");
  ok(/l'hai bevuto il 12 mar 2026 \(92\/100\)/.test(txt), "si vede quando l'hai bevuto e con che voto");
  ok(offCalls.length === 0, "trovato nel Taccuino: non si chiede fuori");
  await page.click('[data-lbl="m-yes"]');
  ok((await page.locator("#lblF_nome").inputValue()) === "Flaccianello della Pieve", "«Sì»: il nome preso dal Taccuino");
  ok((await page.locator("#lblF_annata").inputValue()) === "2021", "l'annata resta quella letta (2021), non quella del Taccuino");
  ok(/Dati presi da: il tuo Taccuino/.test(await panel()), "si dice da dove vengono i dati");
  await page.click('[data-lbl="apply"]');
  ok((await page.locator("#nomeInput").inputValue()) === "Flaccianello della Pieve" && (await page.locator("#annataInput").inputValue()) === "2021", "scheda compilata");

  /* --- 2. dal catalogo Sorso --- */
  await page.fill("#nomeInput", ""); await page.fill("#produttoreInput", ""); await page.fill("#annataInput", "");
  await readPhoto(await label([["GIOVESONE", 420, 130], ["ORCIA", 600, 90], ["DENOMINAZIONE DI ORIGINE CONTROLLATA", 700, 40, "normal"], ["2020", 900, 140], ["FATTORIA DEL COLLE", 1150, 64]], "giovesone"));
  txt = await panel();
  ok(/È questo\?/i.test(txt) && /Giovesone · Fattoria del Colle/.test(txt) && /catalogo Sorso/.test(txt), "catalogo Sorso: «È questo?» con un vino confermato da altri");
  ok(/Annate conosciute: 2019/.test(txt), "si vedono le annate già note");
  ok(await page.locator('[data-lbl="m-report"]').count() === 1, "c'è «Dati sbagliati? Segnala»");
  await page.click('[data-lbl="m-no"]');
  ok(!/È questo\?/i.test(await panel()) && await page.locator("#lblF_nome").count() === 1, "«No»: la proposta sparisce e restano i dati letti");

  /* --- 3. codice a barre scritto: Open Food Facts --- */
  await page.fill("#lblEan", "8000000000003"); await page.click('[data-lbl="ean-go"]');
  ok(/non formano un codice valido/.test(await panel()), "codice sbagliato: lo dice");
  await page.fill("#lblEan", "8000000000002"); await page.click('[data-lbl="ean-go"]');
  await page.locator("#labelRead", { hasText: "Open Food Facts" }).waitFor({ timeout: 8000 });
  txt = await panel();
  ok(/Rosso di Marte Morellino di Scansano · Ruffino/.test(txt) || /Rosso di Marte/.test(txt), "codice a barre: il vino da Open Food Facts");
  ok(/licenza ODbL/.test(txt), "si cita Open Food Facts e la licenza");
  await page.click('[data-lbl="m-yes"]');
  ok(/Ruffino/.test(await page.locator("#lblF_produttore").inputValue()), "«Sì»: produttore da Open Food Facts");
  await page.click('[data-lbl="apply"]');

  /* --- 4. codice a barre fotografato (lettore nel browser) --- */
  const png = await page.evaluate(bits => {
    const c = document.createElement("canvas"); c.width = 900; c.height = 500; const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, 900, 500); x.fillStyle = "#000";
    const m = 7, x0 = (900 - bits.length * m) / 2;
    for (let i = 0; i < bits.length; i++) if (bits[i] === "1") x.fillRect(x0 + i * m, 80, m, 320);
    return c.toDataURL("image/png").split(",")[1];
  }, eanBits("8000000000002"));
  const fb = path.join(os.tmpdir(), "codice.png"); fs.writeFileSync(fb, Buffer.from(png, "base64"));
  await page.fill("#lblEan", "");
  await page.setInputFiles("#lblEanFile", fb);
  await page.locator("#labelRead", { hasText: "Open Food Facts" }).waitFor({ timeout: 30000 }).then(() => ok(true, "codice fotografato: letto e cercato"), () => ok(false, "codice fotografato non letto: " + ""));
  ok((await page.locator("#lblEan").inputValue()) === "8000000000002", "le cifre lette compaiono nel campo");
  ok(offCalls.filter(u => u.includes("8000000000002")).length === 1, "Open Food Facts chiesto una volta sola (poi in memoria)");
  await page.click('[data-lbl="m-yes"]'); await page.click('[data-lbl="apply"]');

  /* --- 5. salvando, il vino entra nel catalogo (con il codice a barre) --- */
  await page.fill("#nomeInput", "Rosso di Marte"); await page.fill("#produttoreInput", "Ruffino");
  await page.click("#saveBtn"); await page.waitForTimeout(1500);
  const idx = await redis.hgetall("cat:idx");
  const flat = JSON.stringify(idx);
  ok(/Rosso di Marte/.test(flat), "salvata la scheda: il vino è nel catalogo Sorso");
  ok((await redis.get("cat:ean:8000000000002")) !== null, "con il suo codice a barre");
  ok(!/\banna\b|google:/i.test(JSON.stringify(await redis.get("cat:w:" + (await redis.get("cat:ean:8000000000002"))))), "senza il nome di chi l'ha salvato");

  /* --- 6. Impostazioni: si può smettere di contribuire --- */
  await page.click("#settingsBtn");
  await page.waitForTimeout(300);
  ok(await page.locator("#catContrib").isChecked(), "Impostazioni: «Contribuisci al catalogo Sorso» attivo");
  ok(/almeno due persone/.test(await page.locator("#catCard").innerText()), "spiega quando un vino diventa di tutti");
  await page.locator("#catContrib").uncheck();
  ok((await page.evaluate(() => localStorage.getItem("sorso-catalogo"))) === "0", "disattivato: lo ricorda");
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), "telefono: nessuno scorrimento orizzontale");

  /* --- 7. senza accesso: la ricerca funziona, contribuire no --- */
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage(); p2.on("pageerror", e => errs.push("ospite: " + e.message));
  await p2.addInitScript(() => { localStorage.setItem("sorso.auth.skipped", "1"); localStorage.setItem("sorso-nota-scala2", "1"); localStorage.setItem("sorso-lang", "it"); });
  await p2.goto(d.url + "/", { waitUntil: "load" }); await p2.waitForTimeout(800);
  await p2.setInputFiles("#photoInput", path.join(os.tmpdir(), "giovesone.png")); await p2.waitForTimeout(300);
  await p2.click("#readLabelBtn");
  await p2.locator("#labelRead", { hasText: "catalogo Sorso" }).waitFor({ timeout: 180000 }).then(() => ok(true, "ospite: riconosce il vino del catalogo"), () => ok(false, "ospite: niente catalogo"));

  ok(errs.length === 0, "nessun errore nelle pagine " + errs.join(" | "));
  await browser.close(); await d.stop();
  console.log(fails ? "\n" + fails + " CONTROLLI FALLITI" : "\nTUTTO OK");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
