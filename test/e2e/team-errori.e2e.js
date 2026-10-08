/* Test nel browser dei percorsi d'errore dello spazio di team: risposte non JSON, sessione scaduta
   a metà voto, degustazione eliminata da un altro, focus, utente che cambia.
     node test/e2e/team-errori.e2e.js */
const crypto = require("crypto");
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const dev = require("../helpers/dev-server");
const jwt = require("../../api/_jwt");
let fails = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };

(async () => {
  const d = await dev.start({ port: 8780, origins: [] });
  const now = () => Math.floor(Date.now() / 1000);
  const token = o => jwt.sign(Object.assign({ iss: "demo", sub: "u1", name: "Anna", team: "sq", role: "member", jti: "j-" + crypto.randomBytes(6).toString("hex"), exp: now() + 300 }, o), d.secret);
  const api = async (body, session) => (await fetch(d.url + "/api/embed", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, session ? { Authorization: "Bearer " + session } : {}), body: JSON.stringify(body) })).json();
  const org = (await api({ op: "session", token: token({ sub: "org", name: "Olga", role: "organizer" }) })).session;
  const t = (await api({ op: "tasting.create", name: "Serata" }, org)).tasting;
  await api({ op: "wine.add", tasting: t.id, wine: { name: "Barolo" } }, org);

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const errs = [];
  async function apri(tk, init) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    page.on("pageerror", e => errs.push(e.message));
    await page.addInitScript(() => { window.msgs = []; addEventListener("message", e => { if (e.data && e.data.type) msgs.push(e.data.type + ":" + (e.data.reason || "")); }); });
    if (init) await init(page);
    await page.goto(d.url + "/embed?p=demo#token=" + tk);
    return page;
  }

  /* risposta 200 che non è JSON (portale di accesso): errore con Riprova, non caricamento infinito */
  let p = await apri(token(), async pg => pg.route("**/api/embed", r => r.fulfill({ status: 200, contentType: "text/html", body: "<html>Accedi al Wi-Fi</html>" })));
  await p.locator(".fatal").waitFor({ timeout: 8000 });
  ok(/connessione|rete/i.test(await p.locator(".fatal").textContent()) && await p.locator('[data-act="retry-login"]').count() === 1, "risposta non JSON: errore di rete con Riprova, non caricamento infinito");
  await p.context().close();

  /* sessione scaduta a metà voto: la bozza resta, il sito riceve sorso:reauth, il nuovo token riporta dentro */
  p = await apri(token({ sub: "m1", name: "Marco" }));
  await p.locator(".card.link").first().click();
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === "h-main").catch(() => {});
  ok(await p.evaluate(() => document.activeElement && document.activeElement.id) === "h-main", "dopo aver aperto una degustazione il focus è sul titolo, non sulla pagina");
  await p.locator('[data-act="vote"]').click();
  await p.locator("#sm-occhio").fill("90"); await p.locator("#sm-naso").fill("85"); await p.locator("#sm-bocca").fill("80");
  await p.route("**/api/embed", r => { const b = r.request().postDataJSON(); if (b.op === "vote") r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "session_expired", message: "x" } }) }); else r.continue(); });
  await p.locator('[data-act="save-vote"]').click();
  await p.locator(".fatal").waitFor();
  ok(/non è stato salvato|rientrare/i.test(await p.locator(".fatal").textContent()) && /non è stato salvato/.test(await p.locator(".fatal").textContent()), "sessione scaduta: dice che il voto non è stato salvato");
  ok((await p.evaluate(() => msgs)).some(m => m.indexOf("sorso:reauth") === 0), "e chiede un nuovo accesso al sito (sorso:reauth)");
  await p.unroute("**/api/embed");
  await p.evaluate(u => { location.hash = "token=" + u; }, token({ sub: "m1", name: "Marco" }));
  await p.locator(".title").waitFor();
  await p.locator('[data-act="vote"]').click();
  ok(await p.locator("#sm-occhio").inputValue() === "90", "con il nuovo token il voto compilato è ancora lì (bozza)");

  /* un altro utente sullo stesso iframe non vede le bozze del precedente */
  await p.evaluate(u => { location.hash = "token=" + u; }, token({ sub: "z9", name: "Zeno" }));
  await p.locator(".who", { hasText: "Zeno" }).waitFor();
  ok(await p.locator('[data-act="vote"]').count() === 0 && await p.locator("#sm-occhio").count() === 0, "cambiando utente, scheda e bozze non passano al nuovo");
  await p.context().close();

  /* degustazione eliminata da un altro mentre la si guarda */
  p = await apri(token({ sub: "m2", name: "Mara" }));
  await p.locator(".card.link").first().click();
  await p.locator(".wine").first().waitFor();
  await api({ op: "tasting.delete", tasting: t.id }, org);
  await p.locator('[data-act="refresh"]').first().click();
  await p.locator("#h-main", { hasText: "Degustazioni" }).waitFor();
  await p.locator(".card.link").first().waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  ok(/non esiste più/.test(await p.locator(".notice.err").textContent()) && await p.locator(".card.link").count() === 0 && await p.locator(".wine").count() === 0, "degustazione eliminata: si torna all'elenco con un avviso, senza vini fantasma");
  await p.context().close();

  ok(errs.length === 0, "nessun errore JavaScript: " + JSON.stringify(errs));
  await browser.close(); await d.stop();
  console.log(fails ? "\n" + fails + " CONTROLLI FALLITI" : "\nTUTTO OK");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
