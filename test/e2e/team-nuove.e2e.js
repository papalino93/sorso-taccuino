/* Alla cieca, classifica e statistiche dello spazio di team, nel browser (pagina /embed aperta da sola).
     node test/e2e/team-nuove.e2e.js */
const crypto = require("crypto");
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const dev = require("../helpers/dev-server");
const jwt = require("../../api/_jwt");

let fails = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };

(async () => {
  const d = await dev.start({ port: 8780, origins: [] });
  const now = () => Math.floor(Date.now() / 1000);
  const token = o => jwt.sign(Object.assign({ iss: "demo", sub: "u1", name: "Anna", team: "squadra", role: "member", jti: "j-" + crypto.randomBytes(6).toString("hex"), exp: now() + 300 }, o), d.secret);
  const api = async (body, sess) => (await fetch(d.url + "/api/embed", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, sess ? { Authorization: "Bearer " + sess } : {}), body: JSON.stringify(body) })).json();
  const sessionOf = async o => (await api({ op: "session", token: token(o) })).session;

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const errs = [];
  async function open(user, vp) {
    const ctx = await browser.newContext({ viewport: vp || { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on("pageerror", e => errs.push("pageerror: " + e.message));
    page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });
    await page.goto(d.url + "/embed?p=demo#token=" + token(user));
    await page.locator(".title, .fatal").first().waitFor();
    return { page, ctx };
  }
  const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

  /* --- l'organizzatore crea una degustazione alla cieca con due vini --- */
  const org = await open({ sub: "org", name: "Olga", role: "organizer" });
  const o = org.page;
  ok(await o.locator(".tab").count() === 3, "tre sezioni: Degustazioni, Classifica, Statistiche");
  await o.locator('[data-act="new-tasting"]').click();
  await o.locator("#f-name").fill("Alla cieca di giovedì");
  await o.locator('input[name="blind"]').check();
  await o.locator('[data-act="submit-form"]').click();
  await o.locator("h2", { hasText: "Alla cieca di giovedì" }).waitFor();
  ok(await o.locator(".badges .badge", { hasText: "alla cieca" }).count() === 1, "il distintivo «alla cieca» c'è");
  for (const [n, p, v, ty, gr] of [["Barolo Cannubi", "Rinaldi", "2018", "Rosso", "Nebbiolo"], ["Vermentino di Gallura", "Li Cuppulati", "2022", "Bianco", "Vermentino"]]) {
    await o.locator('[data-act="new-wine"]').click();
    await o.locator("#f-name").fill(n); await o.locator("#f-prod").fill(p); await o.locator("#f-vint").fill(v);
    await o.locator("#f-type").selectOption(ty); await o.locator("#f-grape").fill(gr);
    await o.locator('[data-act="submit-form"]').click();
    await o.locator(".wine .name", { hasText: n }).waitFor();
    await o.locator("#f-name").waitFor();
    await o.locator('[data-act="cancel-form"]').click();
  }
  ok(await o.locator('[data-act="ask-reveal"]').count() === 1, "l'organizzatore vede «Svela i vini» e vede i nomi veri");

  /* --- un partecipante: vini anonimi, voto e ipotesi --- */
  const mem = await open({ sub: "marco", name: "Marco" });
  const m = mem.page;
  await m.locator('.card.link', { hasText: "Alla cieca di giovedì" }).click();
  await m.locator("h2", { hasText: "Alla cieca di giovedì" }).waitFor();
  const corpo = await m.locator("main").innerText();
  ok(/Vino 1/.test(corpo) && /Vino 2/.test(corpo), "i vini si chiamano «Vino 1» e «Vino 2»");
  ok(!/Barolo|Rinaldi|Nebbiolo|Vermentino|Gallura|Cuppulati|2018|2022/.test(corpo), "nessun nome, produttore, vitigno o annata nella pagina");
  ok(!/Barolo|Nebbiolo/.test(await m.content()), "nemmeno nel codice della pagina");
  await m.locator('[data-act="vote"]').first().click();
  await m.locator("#sh-title").waitFor();
  for (const id of ["sm-occhio", "sm-naso", "sm-bocca"]) { await m.locator("#" + id).focus(); await m.keyboard.press("ArrowRight"); }
  await m.locator('[data-act="save-vote"]').click();
  await m.locator(".just-saved").waitFor();
  await m.locator('[data-act="guess"]').first().click();
  await m.locator("#g-type").selectOption("Rosso");
  await m.locator("#g-grape").fill("Nebbiolo");
  await m.locator("#g-year").fill("2019");
  await m.locator('[data-act="submit-guess"]').click();
  await m.locator(".guess .chip", { hasText: "Nebbiolo" }).waitFor();
  ok(await m.locator(".guess .saved-note").count() === 1, "l'ipotesi si salva e si vede (con conferma)");
  /* ipotesi vuota: errore chiaro, senza chiamare il server */
  await m.locator('[data-act="guess"]').nth(1).click();
  await m.locator('[data-act="submit-guess"]').click();
  ok(await m.locator(".field-error").count() === 1, "ipotesi vuota: messaggio di errore");
  await m.locator('[data-act="cancel-guess"]').click();
  ok(!(await overflow(m)), "nessuno scorrimento orizzontale a 390 px");

  /* altri due voti dei partecipanti (via API) per avere medie visibili */
  const lista = (await api({ op: "state" }, await sessionOf({ sub: "org", role: "organizer" }))).tastings[0];
  const ostate = (await api({ op: "state", tasting: lista.id }, await sessionOf({ sub: "org", role: "organizer" }))).wines;
  for (const [u, a, b] of [["luca", 90, 70], ["sara", 88, 72]]) {
    const s = await sessionOf({ sub: u, name: u });
    await api({ op: "vote", tasting: lista.id, wine: ostate[0].id, mode: "smart", giudizi: { occhio: a, naso: a, bocca: a } }, s);
    await api({ op: "vote", tasting: lista.id, wine: ostate[1].id, mode: "smart", giudizi: { occhio: b, naso: b, bocca: b } }, s);
    await api({ op: "guess", tasting: lista.id, wine: ostate[0].id, type: "Rosso", grape: "Sangiovese" }, s);
  }

  /* --- svelamento --- */
  await o.locator('[data-act="ask-reveal"]').click();
  await o.locator('[data-act="do-confirm"]').click();
  await o.locator(".badges .badge", { hasText: "svelata" }).waitFor();
  ok(await o.locator('[data-act="ask-status"]').count() === 0, "svelata: non si riapre");
  ok(await o.locator("#f-name").count() === 0 && await o.locator('[data-act="vote"]').count() === 0, "svelata: niente più voti");
  await m.locator('[data-act="refresh"]').click();
  await m.locator(".wine .name", { hasText: "Barolo Cannubi" }).waitFor();
  const dopo = await m.locator("main").innerText();
  ok(/Barolo Cannubi/.test(dopo) && /Vermentino di Gallura/.test(dopo), "dopo lo svelamento i nomi compaiono");
  ok(/Ipotesi: \d+ punti su 5/.test(dopo), "si vede il proprio punteggio dell'ipotesi");
  ok(/Il gruppo: tipologia giusta per 3\/3/.test(dopo), "riepilogo anonimo del gruppo");
  ok(/Classifica finale/.test(dopo) && (await m.locator(".toplist li").count()) === 2, "classifica finale dei due vini");
  ok(await m.locator(".toplist li").first().locator(".av").textContent() === "89,0" || /\d\d,\d/.test(await m.locator(".toplist li").first().locator(".av").textContent()), "la classifica mostra la media del team");
  ok(!(await overflow(m)), "nessuno scorrimento orizzontale dopo lo svelamento");
  await m.screenshot({ path: "/tmp/claude-0/team-svelata.png", fullPage: true });

  /* --- classifica delle serate e statistiche --- */
  await m.locator('[data-act="back"]').click();
  await m.locator(".tabs").waitFor();
  await m.locator('[data-act="tab"][data-tab="ranking"]').click();
  await m.locator(".card.link", { hasText: "Alla cieca di giovedì" }).waitFor();
  const ev = await m.locator("main").innerText();
  ok(/Vincitore/.test(ev) && /Barolo Cannubi/.test(ev), "la classifica delle serate mostra il vincitore");
  await m.screenshot({ path: "/tmp/claude-0/team-classifica.png", fullPage: true });
  await m.locator('[data-act="tab"][data-tab="stats"]').click();
  await m.locator(".toplist").waitFor();
  const st = await m.locator("main").innerText();
  ok(/le mie statistiche/i.test(st) && /la mia media/i.test(st) && /il team/i.test(st) && /media del team/i.test(st), "statistiche: personali e del team");
  ok(await m.locator("progress").count() >= 2, "grafici a barre presenti");
  ok(!(await overflow(m)), "statistiche: nessuno scorrimento orizzontale");
  await m.screenshot({ path: "/tmp/claude-0/team-statistiche.png", fullPage: true });
  await m.locator('[data-act="tab"][data-tab="tastings"]').click();
  await m.locator('[data-act="open"]').first().waitFor();
  ok(true, "si torna alle degustazioni");

  /* --- un altro team non vede niente --- */
  const altro = await open({ sub: "z", name: "Zeno", team: "altra" });
  await altro.page.locator('[data-act="tab"][data-tab="stats"]').click();
  await altro.page.locator("main").getByText("Servono degustazioni chiuse").waitFor();
  ok(true, "un altro team non vede le statistiche degli altri");

  /* --- inglese e schermo largo --- */
  const en = await open({ sub: "e", name: "Eve", lang: "en", team: "squadra" }, { width: 900, height: 800 });
  await en.page.locator('[data-act="tab"][data-tab="ranking"]').click();
  await en.page.locator("main").getByText("Ranking by evening").waitFor();
  ok(/Winner/.test(await en.page.locator("main").innerText()), "in inglese: «Winner»");
  /* --- giro di verifica 1.7: nomi lunghi, classifica provvisoria, media a serata chiusa, bozze --- */
  {
    const longName = "X".repeat(100);
    const orgS = await sessionOf({ sub: "org2", name: "Olga", role: "organizer", team: "lungo" });
    const tt = (await api({ op: "tasting.create", name: "S".repeat(80), blind: true }, orgS)).tasting;
    const w1 = (await api({ op: "wine.add", tasting: tt.id, wine: { name: longName, producer: "P".repeat(60), vintage: "2020", type: "Rosso", grape: "Nebbiolo" } }, orgS)).wine;
    const w2 = (await api({ op: "wine.add", tasting: tt.id, wine: { name: "Secondo", vintage: "2021", type: "Bianco" } }, orgS)).wine;
    const v = (a, b, c) => ({ mode: "smart", giudizi: { occhio: a, naso: b, bocca: c } });
    const sA = await sessionOf({ sub: "a1", name: "Anna", team: "lungo" }), sB = await sessionOf({ sub: "b1", name: "Bea", team: "lungo" });
    /* provvisoria: un solo voto (il proprio) non basta per la classifica */
    await api(Object.assign({ op: "vote", tasting: tt.id, wine: w1.id }, v(80, 80, 80)), sA);
    const an = await open({ sub: "a1", name: "Anna", team: "lungo" }, { width: 320, height: 700 });
    await an.page.locator('[data-act="open"]').first().click();
    await an.page.locator("h2").first().waitFor();
    ok(!/1 voto/.test(await an.page.locator(".ranking, .toplist").allInnerTexts().then(a => a.join(" ")).catch(() => "")), "classifica provvisoria: nessun vino con un solo voto");
    ok(/chiusa|Vota e prova/.test(await an.page.locator("main").innerText()) && !(await overflow(an.page)), "cieca aperta a 320 px: nessun overflow");
    /* bozza: scrivo un'ipotesi, apro l'ipotesi di un altro vino, torno: il testo c'è ancora */
    await an.page.locator('[data-act="guess"]').first().click();
    await an.page.locator("#g-grape").fill("Nebbiolo");
    await an.page.locator('[data-act="guess"]').last().click();
    const dopo = await an.page.locator('[data-act="guess"]').first().isVisible().catch(() => false);
    if (dopo) { await an.page.locator('[data-act="guess"]').first().click(); ok(await an.page.locator("#g-grape").inputValue() === "Nebbiolo", "l'ipotesi scritta e lasciata a metà si ritrova"); }
    /* cieca chiusa e non svelata: la nota non invita più a votare */
    await api({ op: "vote", tasting: tt.id, wine: w1.id, ...v(90, 90, 90) }, sB);
    await api({ op: "tasting.status", tasting: tt.id, status: "closed" }, orgS);
    await an.page.locator('[data-act="refresh"]').click();
    await an.page.locator(".notice", { hasText: /svelerà|sapranno/ }).waitFor({ timeout: 4000 }).then(() => ok(true, "cieca chiusa non svelata: nota «in attesa dello svelamento»"), () => ok(false, "nota della cieca chiusa"));
    ok(!(await overflow(an.page)), "nomi lunghi: nessun overflow a 320 px");
    await an.page.locator('[data-act="tab"][data-tab="stats"]').click().catch(() => {});
    await an.ctx.close();
  }
  /* --- un vino assaggiato solo da alcuni: l'organizzatore chiude la sua votazione, la serata resta aperta --- */
  {
    const orgS = await sessionOf({ sub: "org3", name: "Olga", role: "organizer", team: "pochi" });
    const tt = (await api({ op: "tasting.create", name: "Serata a gruppi" }, orgS)).tasting;
    const wA = (await api({ op: "wine.add", tasting: tt.id, wine: { name: "Primo vino" } }, orgS)).wine;
    const wB = (await api({ op: "wine.add", tasting: tt.id, wine: { name: "Secondo vino" } }, orgS)).wine;
    for (const [sub, v] of [["p1", 80], ["p2", 90]]) { const ss = await sessionOf({ sub, name: sub, team: "pochi" }); await api({ op: "vote", tasting: tt.id, wine: wA.id, mode: "smart", giudizi: { occhio: v, naso: v, bocca: v } }, ss); }
    const og = await open({ sub: "org3", name: "Olga", role: "organizer", team: "pochi" });
    await og.page.locator('[data-act="open"]').first().click();
    await og.page.locator(".wine .name", { hasText: "Primo vino" }).waitFor();
    await og.page.locator('[data-act="wine-status"]').first().click();
    await og.page.locator(".notice", { hasText: /Votazione chiusa/ }).waitFor({ timeout: 4000 }).then(() => ok(true, "l'organizzatore chiude la votazione di un vino"), () => ok(false, "avviso di chiusura del vino"));
    const mp = await open({ sub: "p3", name: "Paolo", team: "pochi" });
    await mp.page.locator('[data-act="open"]').first().click();
    await mp.page.locator(".wine .name", { hasText: "Primo vino" }).waitFor();
    const cardA = await mp.page.locator(".wine", { hasText: "Primo vino" }).innerText();
    ok(/votazione chiusa/i.test(cardA) && /85/.test(cardA), "il partecipante vede la media 85 di chi ha votato e «votazione chiusa»");
    ok(await mp.page.locator(".wine", { hasText: "Primo vino" }).locator('[data-act="vote"]').count() === 0, "sul vino chiuso non si può più votare");
    ok(await mp.page.locator(".wine", { hasText: "Secondo vino" }).locator('[data-act="vote"]').count() === 1, "l'altro vino è ancora votabile");
    ok(!(await overflow(mp.page)), "nessun overflow");
  }
  ok(errs.length === 0, "nessun errore JavaScript: " + JSON.stringify(errs));
  await browser.close(); await d.stop();
  console.log(fails ? "\n" + fails + " CONTROLLI FALLITI" : "\nTUTTO OK");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
