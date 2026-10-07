/* Test nel browser dello spazio di team: un finto sito partner (porta diversa)
   firma i token e incorpora l'iframe. Richiede Playwright globale.
     node test/e2e/team.e2e.js */
const http = require("http");
const crypto = require("crypto");
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const dev = require("../helpers/dev-server");
const jwt = require("../../api/_jwt");

let fails = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };

(async () => {
  const HOST_PORT = 8771, OTHER_PORT = 8772;
  const d = await dev.start({ port: 8770, origins: ["http://127.0.0.1:" + HOST_PORT] });
  const now = () => Math.floor(Date.now() / 1000);
  const token = o => jwt.sign(Object.assign({ iss: "demo", sub: "u1", name: "Anna", team: "squadra", role: "member", jti: "j-" + crypto.randomBytes(6).toString("hex"), exp: now() + 300 }, o), d.secret);

  /* il "sito partner": una pagina che incorpora l'iframe col token passato in ?u=... */
  const host = port => http.createServer((req, res) => {
    const q = new URL(req.url, "http://x").searchParams;
    res.setHeader("Content-Type", "text/html");
    const claims = { sub: q.get("sub") || "u1", name: q.get("name") || "Anna", role: q.get("role") || "member", team: q.get("team") || "squadra" };
    res.end('<!doctype html><title>Sito partner</title><h1>Sito del club</h1><iframe id="f" width="420" height="700" src="' + d.url + '/embed?p=demo#token=' + (q.get("bad") ? "xxx.yyy.zzz" : token(claims)) + '"></iframe>' +
      '<script>window.heights=[];window.reauth=[];addEventListener("message",e=>{if(!e.data)return;if(e.data.type==="sorso:height")heights.push(e.data.height);if(e.data.type==="sorso:reauth")reauth.push(e.data.reason)})</script>');
  }).listen(port, "127.0.0.1");
  const hostA = host(HOST_PORT), hostB = host(OTHER_PORT);

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const errs = [];
  async function open(user) {
    const ctx = await browser.newContext({ viewport: { width: 460, height: 800 } });
    const page = await ctx.newPage();
    page.on("pageerror", e => errs.push("pageerror: " + e.message));
    page.on("console", m => { if (m.type() === "error" && !/Refused to frame|chrome-error|Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });
    await page.goto("http://127.0.0.1:" + HOST_PORT + "/?" + new URLSearchParams(user));
    const frame = page.frameLocator("#f");
    await frame.locator(".title, .fatal").first().waitFor();
    return { page, frame, ctx };
  }

  /* --- organizzatore: crea degustazione e vini --- */
  const org = await open({ sub: "org", name: "Olga", role: "organizer" });
  ok(await org.frame.locator(".title").textContent() === "Club Demo", "l'iframe si apre e mostra il titolo del partner");
  const embedFrame = p => p.frames().filter(f => f.url().includes("/embed"))[0];
  ok((await embedFrame(org.page).evaluate(() => location.search + "|" + location.hash)) === "?p=demo|", "il token è stato tolto dall'indirizzo");
  await org.frame.locator('[data-act="new-tasting"]').click();
  await org.frame.locator("#f-name").fill("Serata di prova");
  await org.frame.locator('[data-act="submit-form"]').click();
  await org.frame.locator("h2", { hasText: "Serata di prova" }).waitFor();
  for (const [n, p, v] of [["Barolo", "Rinaldi", "2018"], ["Etna Rosso", "Benanti", "2019"]]) {
    await org.frame.locator('[data-act="new-wine"]').click();
    await org.frame.locator("#f-name").fill(n); await org.frame.locator("#f-prod").fill(p); await org.frame.locator("#f-vint").fill(v);
    await org.frame.locator('[data-act="submit-form"]').click();
    await org.frame.locator(".wine .name", { hasText: n }).waitFor();
    await org.frame.locator("#f-name").waitFor();      // il modulo resta aperto per il vino successivo
    await org.frame.locator('[data-act="cancel-form"]').click();
  }
  ok(await org.frame.locator(".wine").count() === 2, "l'organizzatore aggiunge due vini");

  /* --- partecipante: vota e sblocca la media --- */
  const m1 = await open({ sub: "m1", name: "Marco" });
  ok(await m1.frame.locator('[data-act="new-tasting"]').count() === 0, "il partecipante non vede 'Nuova degustazione'");
  await m1.frame.locator('[data-act="open"]').first().click();
  await m1.frame.locator(".wine").first().waitFor();
  ok(await m1.frame.locator('[data-act="new-wine"]').count() === 0, "il partecipante non può aggiungere vini");
  ok((await m1.frame.locator(".wine").first().textContent()).includes("Vota questo vino per vedere la media"), "prima di votare la media è nascosta");
  await m1.frame.locator('[data-act="vote"]').first().click();
  ok(await m1.frame.locator("#sh-score").textContent() === "70", "voto rapido: anteprima 70 a 70/70/70");
  ok(await m1.frame.locator('[data-act="save-vote"]').isDisabled(), "il voto non si salva finché i cursori non sono stati toccati");
  await m1.frame.locator("#sm-occhio").fill("80"); await m1.frame.locator("#sm-naso").fill("90"); await m1.frame.locator("#sm-bocca").fill("70");
  ok(await m1.frame.locator("#sh-score").textContent() === "77", "voto rapido: 80/90/70 = 77 (come sul server)");
  ok(await m1.frame.locator("#sm-naso-w").textContent() === "Eccellente", "parola della fascia accanto al cursore");
  await m1.frame.locator('[data-act="save-vote"]').click();
  await m1.frame.locator(".big.team").first().waitFor();
  ok(await m1.frame.locator(".saved-note").count() === 1, "conferma visibile: voto salvato");
  const card = await m1.frame.locator(".wine").first().textContent();
  ok(card.includes("77") && /Media del team/.test(card) && /1 voto/.test(card), "dopo il voto: il mio 77 e la media del team");
  ok(!(await m1.frame.locator(".wine").nth(1).textContent()).includes("Media del team"), "sull'altro vino la media resta nascosta");

  /* seconda persona, scheda completa */
  const m2 = await open({ sub: "m2", name: "Sara" });
  await m2.frame.locator('[data-act="open"]').first().click();
  await m2.frame.locator('[data-act="vote"]').first().click();
  await m2.frame.locator('.modes [data-mode="full"]').click();
  ok(await m2.frame.locator("#sh-score").textContent() === "68", "scheda completa: tutto a 6 = 68");
  await m2.frame.locator("#fl-v-qualita").fill("8");
  await m2.frame.locator('[data-act="cancel-vote"]').click();
  await m2.frame.locator('[data-act="vote"]').first().click();
  ok(await m2.frame.locator("#fl-v-qualita").inputValue() === "8", "la scheda a metà si ritrova riaprendo il vino (bozza)");
  for (const id of ["fl-v-qualita", "fl-o-intensita", "fl-o-complessita", "fl-o-qualita", "fl-g-equilibrio", "fl-g-intensita", "fl-g-persistenza", "fl-g-qualita", "fl-f-armonia"]) {
    await m2.frame.locator("#" + id).fill("8");
  }
  ok(await m2.frame.locator("#sh-score").textContent() === "82", "scheda completa: tutto a 8 = 82");
  await m2.frame.locator('[data-act="save-vote"]').click();
  await m2.frame.locator(".big.team").first().waitFor();
  const card2 = await m2.frame.locator(".wine").first().textContent();
  ok(/2 voti/.test(card2) && card2.includes("79,5"), "media di 77 (rapido) e 82 (completa) = 79,5 su 2 voti: " + card2.replace(/\s+/g, " ").slice(0, 120));

  /* --- l'organizzatore vede quanti hanno votato, ma non la media prima di votare --- */
  await org.frame.locator('[data-act="refresh"]').first().click();
  await org.frame.locator(".lock", { hasText: "hanno votato" }).first().waitFor();
  const oc = await org.frame.locator(".wine").first().textContent();
  ok(/2 persone hanno votato/.test(oc) && !/Media del team/.test(oc), "l'organizzatore vede 2 votanti ma non la media");

  /* --- chiusura --- */
  await org.frame.locator('[data-act="ask-status"]').click();
  ok(await org.frame.locator(".confirm").count() === 1, "chiudere chiede conferma");
  await org.frame.locator('[data-act="cancel-confirm"]').click();
  ok(await org.frame.locator(".confirm").count() === 0, "annullando, nulla cambia");
  await org.frame.locator('[data-act="ask-status"]').click();
  await org.frame.locator('[data-act="do-confirm"]').click();
  await org.frame.locator(".notice", { hasText: "Degustazione chiusa" }).waitFor();
  await m1.frame.locator('[data-act="refresh"]').first().click();
  await m1.frame.locator(".notice", { hasText: "Degustazione chiusa" }).waitFor();
  ok(await m1.frame.locator('[data-act="vote"]').count() === 0, "a degustazione chiusa non c'è più il pulsante Vota");
  ok((await m1.frame.locator(".wine").first().textContent()).includes("77"), "il voto dato resta visibile");

  /* --- messaggi d'errore tradotti e richiesta di nuovo accesso --- */
  const cattivo = await open({ bad: "1" });
  const fatalText = await cattivo.frame.locator(".fatal").textContent();
  ok(/non è valido|scaduto/.test(fatalText) && !/malformed|Token non valido/.test(fatalText), "token non valido: messaggio in italiano, senza codici tecnici");
  await cattivo.page.waitForTimeout(300);
  ok((await cattivo.page.evaluate(() => window.reauth.length)) >= 1, "token non valido: il sito riceve sorso:reauth");
  const urlFrame = await embedFrame(cattivo.page).evaluate(() => location.search);
  ok(!urlFrame.includes("token"), "il token non resta nell'indirizzo del frame");

  /* il sito ospite risponde a sorso:reauth con un token nuovo nel frammento: l'iframe rientra da solo */
  await cattivo.page.evaluate(u => { document.getElementById("f").src = u; }, d.url + "/embed?p=demo#token=" + token({ sub: "rita", name: "Rita" }));
  await cattivo.frame.locator(".title").waitFor();
  ok((await cattivo.frame.locator(".who").textContent()).includes("Rita"), "con un token nuovo nel frammento l'iframe rientra senza ricaricare la pagina");

  /* --- partecipante: nessun controllo da organizzatore, nessuna scorciatoia --- */
  ok(await m1.frame.locator('[data-act="ask-delete"]').count() === 0, "il partecipante non vede Elimina");

  /* --- eliminare una degustazione (organizzatore) --- */
  await org.frame.locator('[data-act="back"]').click();
  await org.frame.locator('[data-act="new-tasting"]').click();
  await org.frame.locator("#f-name").fill("   ");
  await org.frame.locator('[data-act="submit-form"]').click();
  ok((await org.frame.locator(".field-error").textContent()).includes("nome"), "nome vuoto: errore vicino al campo");
  await org.frame.locator("#f-name").fill("Da eliminare");
  await org.frame.locator('[data-act="submit-form"]').dblclick();
  await org.frame.locator("h2", { hasText: "Da eliminare" }).waitFor();
  await org.frame.locator('[data-act="back"]').click();
  await org.frame.locator(".card.link").first().waitFor();
  ok(await org.frame.locator(".card.link").count() === 2, "doppio clic su Crea: una sola degustazione, non due");
  await org.frame.locator('.card.link', { hasText: "Da eliminare" }).click();
  await org.frame.locator('[data-act="ask-delete"]').click();
  ok((await org.frame.locator(".confirm").textContent()).includes("Da eliminare"), "eliminare chiede conferma citando il nome");
  await org.frame.locator('[data-act="do-confirm"]').click();
  await org.frame.locator("h2", { hasText: "Degustazioni" }).waitFor();
  ok(await org.frame.locator(".card.link").count() === 1, "degustazione eliminata");
  /* il tasto Indietro del browser resta dentro lo spazio */
  await org.frame.locator('.card.link').first().click();
  await org.frame.locator(".wine").first().waitFor();
  await org.page.evaluate(() => history.back());
  await org.frame.locator("h2", { hasText: "Degustazioni" }).waitFor();
  ok(org.page.url().startsWith("http://127.0.0.1:" + HOST_PORT), "Indietro non esce dalla pagina del sito");

  /* --- team diverso: non vede nulla --- */
  const altro = await open({ sub: "x", name: "Estraneo", team: "altra-squadra" });
  ok(await altro.frame.locator(".card.link").count() === 0, "un altro team non vede le degustazioni");

  /* --- altezza segnalata al sito ospite --- */
  const h = await m1.page.evaluate(() => window.heights.slice(-1)[0]);
  ok(typeof h === "number" && h > 100, "l'iframe segnala la sua altezza al sito (" + h + "px)");

  /* --- token riusato --- */
  const url = await m1.page.locator("#f").getAttribute("src");
  const r = await (await altro.ctx.newPage()).goto(d.url + "/embed?p=demo#token=abc");
  ok(r.status() === 200, "la pagina si apre anche con token non valido (l'errore lo mostra l'interfaccia)");

  /* --- incorporamento da un sito non registrato: bloccato --- */
  const ctx = await browser.newContext(); const pg = await ctx.newPage();
  await pg.goto("http://127.0.0.1:" + OTHER_PORT + "/?sub=z");
  await pg.waitForTimeout(1500);
  const bloccato = pg.frames().filter(f => f !== pg.mainFrame()).every(f => !f.url().includes("/embed") || f.url().startsWith("chrome-error"));
  const titolo = await pg.frames().filter(f => f !== pg.mainFrame())[0]?.locator(".title").count().catch(() => 0);
  ok(bloccato && !titolo, "incorporato da un sito non registrato: la pagina non si carica");

  /* --- API di sola lettura sul risultato vero --- */
  const lista = await (await fetch(d.url + "/api/v1/tastings", { headers: { Authorization: "Bearer " + d.apiKey } })).json();
  ok(lista.tastings.length === 1 && lista.tastings[0].status === "closed", "API v1: elenco con la degustazione chiusa (l'eliminata non c'è)");
  const ris = await (await fetch(d.url + "/api/v1/tastings/" + lista.tastings[0].id + "/results", { headers: { Authorization: "Bearer " + d.apiKey } })).json();
  const b = ris.wines.find(w => w.name === "Barolo");
  ok(b.votes === 2 && b.average === 79.5, "API v1: Barolo, 2 voti, media 79,5");
  const csv = await (await fetch(d.url + "/api/v1/tastings/" + lista.tastings[0].id + "/results?format=csv", { headers: { Authorization: "Bearer " + d.apiKey } })).text();
  ok(csv.split("\r\n")[1].includes("Barolo") && csv.includes(",2,79.5"), "API v1: CSV");
  ok((await fetch(d.url + "/api/v1/tastings")).status === 401, "API v1: senza chiave 401");

  console.log("errori nel browser:", JSON.stringify(errs)); if (errs.length) fails++;
  await browser.close(); hostA.close(); hostB.close(); await d.stop();
  console.log(fails ? "\n" + fails + " CONTROLLI FALLITI" : "\nTUTTO OK");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
