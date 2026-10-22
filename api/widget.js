const crypto = require("crypto");
const { getRedis } = require("./_redis");
const { clientIp } = require("./_http");
const Quota = require("./_quota");
const limit = require("./_limit");
const Team = require("./_team");
const Circles = require("./_circles");
const Theme = require("../public/js/theme.js");
const Game = require("./_game");

/* Widget per i siti: la pagina pubblica, di sola lettura, con le statistiche di una cerchia.
     /widget?t=<codice>[&view=classifica|palato|striscia|sfida|campo|podio][&lang=it|en][&theme=auto|light|dark][&accent=rrggbb][&bg=rrggbb|none][&rows=1-10][&show=top,events,totals]
   Fatta tutta sul server (niente codice da scaricare), incorporabile da qualunque sito, in cache per due minuti.
   Solo aggregati, gli stessi delle statistiche della cerchia: serate chiuse, una media dal secondo voto in su,
   vini alla cieca nascosti finché non vengono svelati. Nessun nome di chi ha votato. Si spegne revocando il link. */

const VIEWS = ["classifica", "palato", "striscia", "sfida", "campo", "podio"];
const PER_IP = 120;                 // al minuto, per le richieste che non arrivano dalla cache
const TOKEN = /^[0-9a-f]{48}$/;

const TXT = {
  it: {
    eyebrow: "Classifica della cerchia", top: "I vini migliori", events: "Ultime serate", winner: "Il preferito", noWinner: "nessuna media ancora",
    votes1: "1 voto", votesN: "{n} voti", wines1: "1 vino", winesN: "{n} vini", blind: "Vino {n} (alla cieca)", tie: "pari merito",
    tEvenings: "Serate", tWines: "Vini", tVotes: "Voti", tAvg: "Media", scale: "su 100",
    empty: "La classifica compare quando si chiude la prima serata con almeno due voti per vino.",
    foot: "Medie anonime delle serate chiuse", brand: "Taste · taccuino di degustazione", gone: "Questo widget non è disponibile: il link è stato revocato o non è corretto.", busy: "Troppe richieste: riprova fra poco.",
    rankLabel: "Classifica dei vini", evLabel: "Serate chiuse", in: "in",
    pEyebrow: "Il palato del team", pOpen: "Cosa aprite", pRegions: "Regioni preferite", pGrapes: "Vitigni preferiti", pTop: "I più votati",
    pDiv: "Il più divisivo", pAgree: "Tutti d'accordo", pBand: "dal voto più basso al più alto · media", pBandNote: "La fascia dei voti si vede solo per i vini con almeno 5 voti.",
    pNoBand: "Il più divisivo e quello su cui siete d'accordo compaiono dai vini con almeno 5 voti.", pNoRegion: "Aggiungete regione e vitigno ai vini delle serate per vederli qui.",
    avgOf: "media {a}", sEyebrow: "Il gioco della cerchia", sMoves: "Mosse", sWines: "Vini svelati", sPron: "Pronostici centrati", sPrice: "Errore sul prezzo",
    sCompass: "La bussola del gruppo", sCompassNote: "Dove mettete in media le vostre facce sul campo.", sSplit: "Vi ha diviso", sTight: "Tutti sullo stesso punto",
    sPlayers: "{n} giocatori", sOff: "Il gioco non è attivo in questa cerchia.", sEmpty: "La sfida compare dopo il primo vino svelato con il gioco.",
    sFoot: "Numeri del gioco, senza nomi", gEyebrow: "Podio del gioco", gPts: "punti", gPlayed1: "1 vino giocato", gPlayedN: "{n} vini giocati",
    gOff: "Il podio con i nomi non è attivo: lo accendono il Proprietario o gli amministratori dall'app.", gEmpty: "Il podio compare dopo il primo vino svelato con il gioco.", gFoot: "Punti del gioco sui vini svelati",
    stLast: "Il preferito dell'ultima serata", stAvg: "media",
    sBias: "Il termometro dei pronostici", sBiasUp: "Vi aspettate {n} punti in più di quelli che date davvero", sBiasDown: "Siete più generosi dei vostri pronostici: {n} punti in più", sBiasEven: "Pronostici in perfetta sintonia con i voti",
    sNose: "Il naso del gruppo", sWord: "La parola del team", sSurprise: "Il prezzo che vi ha spiazzato", sSurpriseTxt: "Pensavate {g} €, costava {p} €", cEyebrow: "Il campo dell'ultimo vino", cAvg: "Media del gruppo", cCenter: "il centro del gruppo", cEmpty: "Il campo compare dopo il primo vino svelato con almeno due facce.",
    cFoot: "Le facce del gioco sul campo", aTitle: "I premi della stagione", tTwins: "Gemelli di palato",
    a_pron: "Re del pronostico", a_price: "Naso per i prezzi", a_field: "Bussola d'oro", a_fuori: "Fuori dal coro", a_sintonia: "Sempre in sintonia", a_played: "Instancabile", a_mese: "In testa alla sfida del mese", a_duel: "Pistolero",
    u_pron: "{n} punti di pronostico", u_price: "{n} punti sui prezzi", u_field: "{n} punti sul campo", u_fuori: "{n} volte il più lontano", u_sintonia: "{n} volte il più vicino", u_played: "{n} vini giocati", u_mese: "{n} punti nella sfida del mese", u_duel: "{n} duelli vinti",
    ax_corpo: "Corpo", ax_acidita: "Acidità", ax_tannino: "Tannino", ax_morbidezza: "Morbidezza", ax_frutto: "Frutto", ax_legno: "Legno", ax_intensita: "Intensità", ax_persistenza: "Persistenza", ax_dolcezza: "Dolcezza", ax_freschezza: "Freschezza",
    lo_corpo: "esile", hi_corpo: "pieno", lo_acidita: "piatta", hi_acidita: "tagliente", lo_tannino: "vellutato", hi_tannino: "ruvido", lo_morbidezza: "secco", hi_morbidezza: "rotondo", lo_frutto: "poco", hi_frutto: "tanto", lo_legno: "niente", hi_legno: "tanto", lo_intensita: "lieve", hi_intensita: "potente", lo_persistenza: "corto", hi_persistenza: "lunghissimo", lo_dolcezza: "secco", hi_dolcezza: "dolce", lo_freschezza: "stanco", hi_freschezza: "vivace",
    n_generoso: "Il generoso", n_spietato: "Lo spietato", n_bastian: "Il bastian contrario", n_naso: "Naso d'oro", n_fifone: "Il fifone 🐔", n_pistolero: "Il pistolero",
    ty_Rosso: "Rossi", ty_Bianco: "Bianchi", ty_Rosato: "Rosati", ty_Spumante: "Bollicine", ty_Passito: "Passiti"
  },
  en: {
    eyebrow: "Circle ranking", top: "Best wines", events: "Latest evenings", winner: "Favourite", noWinner: "no average yet",
    votes1: "1 vote", votesN: "{n} votes", wines1: "1 wine", winesN: "{n} wines", blind: "Wine {n} (blind)", tie: "tie",
    tEvenings: "Evenings", tWines: "Wines", tVotes: "Votes", tAvg: "Average", scale: "out of 100",
    empty: "The ranking appears once the first evening is closed with at least two votes per wine.",
    foot: "Anonymous averages of closed evenings", brand: "Taste · tasting notebook", gone: "This widget is not available: the link was revoked or is wrong.", busy: "Too many requests: try again shortly.",
    rankLabel: "Wine ranking", evLabel: "Closed evenings", in: "at",
    pEyebrow: "The team's palate", pOpen: "What you open", pRegions: "Favourite regions", pGrapes: "Favourite grapes", pTop: "Top rated",
    pDiv: "Most divisive", pAgree: "Everyone agrees", pBand: "lowest to highest score · average", pBandNote: "The score range only shows for wines with at least 5 votes.",
    pNoBand: "The most divisive wine and the one you agree on appear from wines with at least 5 votes.", pNoRegion: "Add region and grape to the evening's wines to see them here.",
    avgOf: "avg {a}", sEyebrow: "The circle's game", sMoves: "Moves", sWines: "Wines revealed", sPron: "Predictions on target", sPrice: "Price error",
    sCompass: "The group's compass", sCompassNote: "Where you put your faces on the field, on average.", sSplit: "Split you apart", sTight: "All on the same spot",
    sPlayers: "{n} players", sOff: "The game is not on in this circle.", sEmpty: "The challenge appears after the first wine revealed with the game.",
    sFoot: "Game numbers, no names", gEyebrow: "Game podium", gPts: "points", gPlayed1: "1 wine played", gPlayedN: "{n} wines played",
    gOff: "The podium with names is off: the Owner or the admins turn it on from the app.", gEmpty: "The podium appears after the first wine revealed with the game.", gFoot: "Game points on revealed wines",
    stLast: "Favourite of the last evening", stAvg: "avg",
    sBias: "Prediction thermometer", sBiasUp: "You expect {n} points more than you actually give", sBiasDown: "You're more generous than your predictions: {n} points more", sBiasEven: "Predictions perfectly in tune with the scores",
    sNose: "The group's nose", sWord: "The team's word", sSurprise: "The price that caught you out", sSurpriseTxt: "You guessed €{g}, it cost €{p}", cEyebrow: "The last wine's field", cAvg: "Group average", cCenter: "the group's centre", cEmpty: "The field appears after the first wine revealed with at least two faces.",
    cFoot: "The game's faces on the field", aTitle: "Season awards", tTwins: "Palate twins",
    a_pron: "Prediction king", a_price: "Nose for prices", a_field: "Golden compass", a_fuori: "Odd one out", a_sintonia: "Always in tune", a_played: "Tireless", a_mese: "Leading the monthly challenge", a_duel: "Gunslinger",
    u_pron: "{n} prediction points", u_price: "{n} price points", u_field: "{n} field points", u_fuori: "farthest {n} times", u_sintonia: "closest {n} times", u_played: "{n} wines played", u_mese: "{n} points in the monthly challenge", u_duel: "{n} duels won",
    ax_corpo: "Body", ax_acidita: "Acidity", ax_tannino: "Tannin", ax_morbidezza: "Softness", ax_frutto: "Fruit", ax_legno: "Oak", ax_intensita: "Intensity", ax_persistenza: "Length", ax_dolcezza: "Sweetness", ax_freschezza: "Freshness",
    lo_corpo: "light", hi_corpo: "full", lo_acidita: "flat", hi_acidita: "sharp", lo_tannino: "silky", hi_tannino: "rough", lo_morbidezza: "dry", hi_morbidezza: "round", lo_frutto: "little", hi_frutto: "lots", lo_legno: "none", hi_legno: "lots", lo_intensita: "faint", hi_intensita: "powerful", lo_persistenza: "short", hi_persistenza: "endless", lo_dolcezza: "dry", hi_dolcezza: "sweet", lo_freschezza: "tired", hi_freschezza: "lively",
    n_generoso: "The generous one", n_spietato: "The ruthless one", n_bastian: "The contrarian", n_naso: "Golden nose", n_fifone: "The chicken 🐔", n_pistolero: "The gunslinger",
    ty_Rosso: "Reds", ty_Bianco: "Whites", ty_Rosato: "Rosés", ty_Spumante: "Sparkling", ty_Passito: "Sweet wines"
  }
};
const tf = (L, k, v) => { let s = TXT[L][k]; Object.keys(v || {}).forEach(x => { s = s.split("{" + x + "}").join(String(v[x])); }); return s; };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (x, L) => x == null ? "–" : (L === "en" ? Number(x).toFixed(1) : Number(x).toFixed(1).replace(".", ","));
const day = (ms, L) => { try { return new Date(ms).toLocaleDateString(L === "en" ? "en-GB" : "it-IT", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } };
const hex = s => /^[0-9a-fA-F]{6}$/.test(String(s || "")) ? "#" + String(s).toLowerCase() : null;
/* larghezza della barra: la scala va da 50 a 100 */
const pct = avg => Math.max(2, Math.min(100, Math.round((Number(avg) - 50) * 2)));

function options(q) {
  const lang = q.get("lang") === "en" ? "en" : "it";
  const theme = ["light", "dark"].indexOf(q.get("theme")) >= 0 ? q.get("theme") : "auto";
  const rows = Math.max(1, Math.min(10, parseInt(q.get("rows"), 10) || 5));
  const show = new Set(String(q.get("show") || "top,events,totals").split(",").map(x => x.trim()).filter(x => ["top", "events", "totals"].indexOf(x) >= 0));
  if (!show.size) ["top", "events", "totals"].forEach(x => show.add(x));
  const bgRaw = q.get("bg");
  const view = VIEWS.indexOf(q.get("view")) >= 0 ? q.get("view") : "classifica";
  return { lang, theme, rows, show, view, accent: hex(q.get("accent")), bg: hex(bgRaw), transparent: bgRaw === "none" };
}

/* i colori: la stessa tavolozza dell'app, con il contrasto garantito qualunque colore si scelga */
function palette(o, dark) {
  const v = Theme.derive({ accent: o.accent || undefined, bg: o.bg || undefined, dark }).vars;
  return ["--bg:" + (o.transparent ? "transparent" : v["--panel"]), "--card:" + v["--card"], "--card2:" + v["--card-alt"], "--ink:" + v["--ink"], "--ink2:" + v["--ink-2"], "--muted:" + v["--ink-3"],
    "--line:" + v["--line"], "--accent:" + v["--sel-bg"], "--on:" + v["--sel-fg"], "--acc-text:" + v["--accent-text"], "--track:" + v["--line"]].join(";");
}
function css(o, widths) {
  const light = ":root{" + palette(o, false) + ";color-scheme:light}", dark = ":root{" + palette(o, true) + ";color-scheme:dark}";
  const base = o.theme === "dark" ? dark : o.theme === "light" ? light : light + "@media (prefers-color-scheme: dark){" + dark + "}";
  /* niente stili in linea (la CSP li blocca): una regola per ogni larghezza di barra usata */
  const bars = [...widths].map(w => typeof w === "number" ? ".b" + w + "{width:" + w + "%}" : w[0] === "l" ? "." + w + "{left:" + w.slice(1) + "%}" : w[0] === "u" ? "." + w + "{bottom:" + w.slice(1) + "%}" : w[0] === "h" ? "." + w + "{height:" + w.slice(1) + "px}" : "").join("");
  return base + bars + `
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font:450 15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.w{container-type:inline-size;padding:16px}
.eb{margin:0;font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--acc-text)}
h1{margin:3px 0 0;font-size:22px;line-height:1.15;font-weight:780;letter-spacing:-.02em;overflow-wrap:anywhere}
h2{margin:0 0 8px;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
ol,ul{list-style:none;margin:0;padding:0}
.tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:14px 0 4px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:9px 10px 8px}.tile.acc{border-color:transparent}
.tile b{display:block;font-size:20px;font-weight:800;line-height:1.05;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.tile span{display:block;font-size:11px;color:var(--muted);margin-top:2px}
.tile.acc{background:var(--accent);color:var(--on)}.tile.acc span{color:inherit;opacity:.82}
.cols{display:grid;gap:18px;margin-top:16px}
@container (min-width:600px){.cols.two{grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:22px}.w{padding:20px}h1{font-size:26px}}
@container (max-width:340px){.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
.champ{position:relative;background:var(--accent);color:var(--on);border-radius:20px;padding:14px 16px 13px;margin-bottom:8px;overflow:hidden}
.champ .k{font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.85}
.champ .row1{display:flex;gap:12px;align-items:flex-end;justify-content:space-between;margin-top:4px}
.champ .nm{min-width:0}.champ .nm b{display:block;font-size:18px;font-weight:760;line-height:1.2;overflow-wrap:anywhere}
.champ .nm span{display:block;font-size:12.5px;opacity:.86;overflow-wrap:anywhere}
.champ .sc{text-align:right;flex:none}.champ .sc b{display:block;font-size:40px;font-weight:820;line-height:.9;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.champ .sc span{font-size:11.5px;opacity:.86}
.champ .bar{margin-top:10px;height:5px;border-radius:5px;background:rgba(255,255,255,.22);overflow:hidden}.champ .bar i{display:block;height:100%;border-radius:5px;background:var(--on);opacity:.9}
.rk{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:4px 10px;align-items:center;padding:9px 12px 10px;border-radius:14px;background:var(--card);border:1px solid var(--line);margin-bottom:6px}
.rk .pos{font-weight:800;color:var(--acc-text);font-variant-numeric:tabular-nums;font-size:15px}
.rk .nm b{display:block;font-weight:650;line-height:1.25;overflow-wrap:anywhere}.rk .nm span{display:block;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
.rk .sc{text-align:right}.rk .sc b{display:block;font-size:18px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}.rk .sc span{color:var(--muted);font-size:11px}
.rk .bar{grid-column:2 / 4;height:4px;border-radius:4px;background:var(--track);overflow:hidden}.rk .bar i{display:block;height:100%;border-radius:4px;background:var(--accent)}
.tl{position:relative;padding-left:16px}
.tl:before{content:"";position:absolute;left:6px;top:8px;bottom:14px;width:2px;border-radius:2px;background:var(--line)}
.ev{position:relative;padding:0 0 12px}
.ev:before{content:"";position:absolute;left:-15px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--bg);border:2px solid var(--accent);box-sizing:border-box}
.ev:first-child:before{background:var(--accent)}
.ev .d{display:block;font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.ev b{display:block;font-weight:680;line-height:1.25;overflow-wrap:anywhere}
.ev .m{display:block;font-size:12px;color:var(--muted)}
.ev .win{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:5px;padding:7px 10px;border-radius:12px;background:var(--card);border:1px solid var(--line)}
.ev .win span{min-width:0;font-size:13px;overflow-wrap:anywhere}.ev .win em{font-style:normal;color:var(--muted);font-size:11.5px;display:block}
.chip{flex:none;display:inline-block;padding:2px 9px;border-radius:999px;background:var(--accent);color:var(--on);font-weight:750;font-size:12.5px;font-variant-numeric:tabular-nums}
.none{font-size:12.5px;color:var(--muted);font-style:italic;margin-top:3px;display:block}
.empty{margin-top:14px;padding:16px;border-radius:16px;background:var(--card);border:1px solid var(--line);color:var(--ink2);font-size:14px}
footer{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 10px;margin-top:14px;padding-top:10px;border-top:1px solid var(--line);font-size:11.5px;color:var(--muted)}
footer a{color:inherit;font-weight:650;text-decoration:none;border-bottom:1px solid var(--line)}footer a:hover{color:var(--acc-text)}
.sec{margin-top:16px}
.list2 li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)}
.list2 li:last-child{border-bottom:0}.list2 b{font-weight:650;overflow-wrap:anywhere}.list2 em{font-style:normal;color:var(--muted);font-size:12px}
.list2 .bar{grid-column:1 / 3;height:5px;border-radius:5px;background:var(--track);overflow:hidden}.list2 .bar i{display:block;height:100%;border-radius:5px;background:var(--accent)}
.chips{display:flex;flex-wrap:wrap;gap:6px}.card .chips{margin-top:6px}.chips span{display:inline-flex;gap:6px;align-items:baseline;padding:5px 10px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:13px;font-weight:620}
.chips em{font-style:normal;color:var(--muted);font-weight:500;font-size:12px}
.hint{font-size:12.5px;color:var(--muted);margin:2px 0 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 14px;margin-bottom:8px}
.card .k{display:block;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--acc-text)}
.card b.n{display:block;font-weight:700;margin-top:3px;overflow-wrap:anywhere}.card .s{display:block;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
.band{position:relative;height:22px;margin-top:10px}.band .tr{position:absolute;left:0;right:0;top:9px;height:4px;border-radius:4px;background:var(--track)}
.band .rg{position:absolute;top:6px;height:10px;border-radius:10px;background:var(--accent);opacity:.35}
.band .mk{position:absolute;top:2px;width:4px;height:18px;margin-left:-2px;border-radius:3px;background:var(--accent)}
.band .lo,.band .hi{position:absolute;top:-14px;font-size:10.5px;color:var(--muted);font-variant-numeric:tabular-nums;transform:translateX(-50%)}
.bandk{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:2px}
.strip{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;padding:10px 14px;border-radius:16px;background:var(--card);border:1px solid var(--line)}
.strip .nm{font-weight:780;letter-spacing:-.01em;overflow-wrap:anywhere}.strip .eb{margin:0}
.strip .st{display:flex;gap:14px;flex-wrap:wrap}.strip .st span{font-size:12px;color:var(--muted)}.strip .st b{display:block;font-size:17px;color:var(--ink);font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1}
.strip .lw{margin-left:auto;display:flex;gap:8px;align-items:center;min-width:0}.strip .lw span{font-size:12.5px;min-width:0;overflow-wrap:anywhere}.strip .lw em{display:block;font-style:normal;font-size:11px;color:var(--muted)}
.w.thin{padding:8px}
.cmp{display:grid;gap:10px}.cmp .ax{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;font-size:12px;color:var(--muted)}
.cmp .ax b{grid-column:1 / 4;font-size:12.5px;color:var(--ink);font-weight:700}
.cmp .ln{position:relative;height:10px}.cmp .ln:before{content:"";position:absolute;left:0;right:0;top:4px;height:2px;border-radius:2px;background:var(--track)}
.cmp .ln i{position:absolute;top:0;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--card)}
.field{position:relative;aspect-ratio:1/1;max-width:360px;margin:8px auto 0;border-radius:16px;border:1px solid var(--line);background:var(--card);overflow:hidden}
.field .gx,.field .gy{position:absolute;background:var(--line)}.field .gx{left:0;right:0;top:50%;height:1px}.field .gy{top:0;bottom:0;left:50%;width:1px}
.field .lb{position:absolute;font-size:10.5px;color:var(--muted)}.field .lb.t{top:6px;left:50%;transform:translateX(-50%)}.field .lb.b{bottom:6px;left:50%;transform:translateX(-50%)}
.field .lb.l{left:8px;top:50%;transform:translateY(-130%)}.field .lb.r{right:8px;top:50%;transform:translateY(-130%)}
.field .an{position:absolute;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ink2)}.field .an.y{top:9px;left:10px}.field .an.x{right:10px;bottom:9px}
.field .d{position:absolute;width:28px;height:28px;margin:0 0 -14px -14px;border-radius:50%;background:var(--accent);color:var(--on);display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:800;box-shadow:0 0 0 2px var(--card)}
.field .d.a{width:14px;height:14px;margin:0 0 -7px -7px;opacity:.85}
.field .c{position:absolute;width:24px;height:24px;margin:0 0 -12px -12px;border-radius:50%;border:2px dashed var(--acc-text)}
.legend{display:flex;justify-content:center;gap:14px;font-size:11.5px;color:var(--muted);margin-top:8px}
.pod{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;align-items:end;margin-top:14px}
.pod .p{display:flex;flex-direction:column;align-items:center;text-align:center;min-width:0}
.pod .av{width:46px;height:46px;border-radius:50%;background:var(--card2);border:2px solid var(--line);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;color:var(--ink)}
.pod .p1 .av{width:58px;height:58px;font-size:18px;background:var(--accent);color:var(--on);border-color:transparent}
.pod .nm{font-weight:700;font-size:13px;margin-top:6px;overflow-wrap:anywhere;line-height:1.2}.pod .pt{font-size:12px;color:var(--muted)}
.pod .st{width:100%;margin-top:6px;border-radius:12px 12px 4px 4px;background:var(--card);border:1px solid var(--line);display:flex;align-items:flex-start;justify-content:center;padding-top:6px;font-weight:800;font-size:20px;color:var(--acc-text)}
.pod .p1 .st{background:var(--accent);color:var(--on);border-color:transparent}
.aw{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}@container (min-width:560px){.aw{grid-template-columns:repeat(3,minmax(0,1fr))}}
.aw li{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:9px 11px}.aw .k{display:block;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--acc-text)}
.aw b{display:block;font-weight:700;margin-top:2px;overflow-wrap:anywhere}.aw span{display:block;font-size:11.5px;color:var(--muted)}
.nk{display:inline-block;margin:2px 4px 0 0;padding:1px 8px;border-radius:999px;background:var(--card2);font-size:11px;font-weight:650;color:var(--ink2)}
@media (prefers-reduced-motion:no-preference){.field .d{animation:pop .5s ease-out both}@keyframes pop{from{transform:scale(0)}to{transform:scale(1)}}}
@media (prefers-reduced-motion:no-preference){.bar i{transform-origin:left;animation:g .7s ease-out both}@keyframes g{from{transform:scaleX(0)}to{transform:scaleX(1)}}}`;
}

function page(o, nonce, title, body, widths) {
  return `<!doctype html>
<html lang="${o.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<style nonce="${nonce}">${css(o, widths || new Set())}</style>
</head>
<body>
<main class="w${o.view === "striscia" ? " thin" : ""}">${body}</main>
<script nonce="${nonce}">(function(){var last=0;function h(){var v=Math.ceil(document.documentElement.scrollHeight);if(v===last)return;last=v;try{parent.postMessage({type:"sorso:widget-height",height:v},"*")}catch(e){}}h();addEventListener("load",h);addEventListener("resize",h);if(window.ResizeObserver)new ResizeObserver(h).observe(document.body);})();</script>
</body>
</html>`;
}

function wineName(w, L) {
  if (w.hidden) return { name: tf(L, "blind", { n: w.index }), sub: "" };
  return { name: w.name || "", sub: [w.producer, w.vintage].filter(Boolean).join(" · ") };
}
const votesTxt = (n, L) => n === 1 ? TXT[L].votes1 : tf(L, "votesN", { n });

function render(o, circle, st, widths) {
  const L = o.lang, T = TXT[L];
  let h = '<header><p class="eb">Taste · ' + esc(T.eyebrow) + '</p><h1 dir="auto">' + esc(circle.name) + "</h1></header>";
  const t = st.totals || {};
  const top = (st.top || []).slice(0, o.rows), events = (st.events || []).slice(0, o.rows);
  if (!top.length && !events.some(e => e.winner)) return h + '<p class="empty">' + esc(T.empty) + "</p>";
  if (o.show.has("totals")) {
    h += '<div class="tiles" role="list">' +
      '<div class="tile" role="listitem"><b>' + (t.closed || 0) + "</b><span>" + esc(T.tEvenings) + "</span></div>" +
      '<div class="tile" role="listitem"><b>' + (t.wines || 0) + "</b><span>" + esc(T.tWines) + "</span></div>" +
      '<div class="tile" role="listitem"><b>' + (t.votes || 0) + "</b><span>" + esc(T.tVotes) + "</span></div>" +
      '<div class="tile acc" role="listitem"><b>' + num(st.average, L) + "</b><span>" + esc(T.tAvg) + "</span></div></div>";
  }
  const showTop = o.show.has("top") && top.length, showEv = o.show.has("events") && events.length;
  h += '<div class="cols' + (showTop && showEv ? " two" : "") + '">';
  if (showTop) {
    const [first, ...rest] = top, n1 = wineName(first, L), w1 = pct(first.avg); widths.add(w1);
    h += '<section aria-label="' + esc(T.rankLabel) + '"><h2>' + esc(T.top) + "</h2>" +
      '<div class="champ"><span class="k">1 · ' + esc(T.winner) + '</span><div class="row1"><div class="nm"><b dir="auto">' + esc(n1.name) + "</b>" +
      (n1.sub ? '<span dir="auto">' + esc(n1.sub) + "</span>" : "") + '<span dir="auto">' + esc(T.in + " " + (first.tastingName || "")) + '</span></div>' +
      '<div class="sc"><b>' + num(first.avg, L) + "</b><span>" + esc(votesTxt(first.votes, L)) + '</span></div></div><div class="bar"><i class="b' + w1 + '"></i></div></div>';
    if (rest.length) h += "<ol start=\"2\">" + rest.map((w, i) => {
      const n = wineName(w, L), wd = pct(w.avg); widths.add(wd);
      return '<li class="rk"><span class="pos">' + (i + 2) + '</span><span class="nm"><b dir="auto">' + esc(n.name) + "</b>" +
        '<span dir="auto">' + esc([n.sub, w.tastingName].filter(Boolean).join(" · ")) + '</span></span><span class="sc"><b>' + num(w.avg, L) + "</b><span>" + esc(votesTxt(w.votes, L)) + "</span></span>" +
        '<span class="bar" aria-hidden="true"><i class="b' + wd + '"></i></span></li>';
    }).join("") + "</ol>";
    h += "</section>";
  }
  if (showEv) {
    h += '<section aria-label="' + esc(T.evLabel) + '"><h2>' + esc(T.events) + '</h2><ol class="tl">' + events.map(e => {
      let w = '<span class="none">' + esc(T.noWinner) + "</span>";
      if (e.winner) { const n = wineName(e.winner, L); w = '<div class="win"><span><em>' + esc(T.winner) + (e.winner.tie ? " · " + esc(T.tie) : "") + '</em><span dir="auto">' + esc(n.name) + '</span></span><span class="chip">' + num(e.winner.average, L) + "</span></div>"; }
      return '<li class="ev"><span class="d">' + esc(day(e.createdAt, L)) + '</span><b dir="auto">' + esc(e.name) + '</b><span class="m">' + esc((e.wines === 1 ? T.wines1 : tf(L, "winesN", { n: e.wines })) + " · " + votesTxt(e.votes, L)) + "</span>" + w + "</li>";
    }).join("") + "</ol></section>";
  }
  return h + "</div>";
}

const AX = Game.AXES;
const AR = { it: { rossi: "🍓 Frutti rossi", neri: "🫐 Frutti neri", agrumi: "🍋 Agrumi", mela: "🍏 Mela e pera", pesca: "🍑 Pesca e albicocca", tropicale: "🍍 Tropicale", fiori: "🌸 Fiori", erbe: "🌿 Erbe", spezie: "🌶️ Spezie", vaniglia: "🍦 Vaniglia", tostato: "☕ Tostato", miele: "🍯 Miele", burro: "🧈 Burro", minerale: "🪨 Minerale", cuoio: "🚬 Cuoio e tabacco", terra: "🍄 Terra e sottobosco" },
  en: { rossi: "🍓 Red fruit", neri: "🫐 Black fruit", agrumi: "🍋 Citrus", mela: "🍏 Apple & pear", pesca: "🍑 Peach & apricot", tropicale: "🍍 Tropical", fiori: "🌸 Flowers", erbe: "🌿 Herbs", spezie: "🌶️ Spice", vaniglia: "🍦 Vanilla", tostato: "☕ Toasty", miele: "🍯 Honey", burro: "🧈 Butter", minerale: "🪨 Mineral", cuoio: "🚬 Leather & tobacco", terra: "🍄 Earth & undergrowth" } };
const PW = { it: { elegante: "🎩 Elegante", potente: "💪 Potente", allegro: "🎉 Allegro", timido: "🙈 Timido", ruffiano: "😏 Ruffiano", austero: "🧐 Austero", seducente: "💋 Seducente", rustico: "🌾 Rustico", fresco: "🧊 Fresco", morbido: "☁️ Morbido", spigoloso: "🔺 Spigoloso", meditazione: "🧘 Da meditazione" },
  en: { elegante: "🎩 Elegant", potente: "💪 Powerful", allegro: "🎉 Cheerful", timido: "🙈 Shy", ruffiano: "😏 Crowd-pleaser", austero: "🧐 Austere", seducente: "💋 Seductive", rustico: "🌾 Rustic", fresco: "🧊 Fresh", morbido: "☁️ Soft", spigoloso: "🔺 Angular", meditazione: "🧘 For meditation" } };
const pos10 = v => Math.max(0, Math.min(100, Math.round(Number(v) * 10)));
const header = (L, eb, circle) => '<header><p class="eb">Taste · ' + esc(TXT[L][eb]) + '</p><h1 dir="auto">' + esc(circle.name) + "</h1></header>";
const empty = msg => '<p class="empty">' + esc(msg) + "</p>";

/* fascia dei voti: dal più basso al più alto, con la media (classi per le posizioni: la CSP vieta gli stili in linea) */
function band(x, L, cls) {
  const lo = pct(x.min), hi = pct(x.max), av = pct(x.avg), wd = Math.max(1, hi - lo);
  cls.add("l" + lo); cls.add("l" + hi); cls.add("l" + av); cls.add(wd);
  return '<div class="band" aria-hidden="true"><span class="tr"></span><span class="rg l' + lo + " b" + wd + '"></span><span class="mk l' + av + '"></span>' +
    '<span class="lo l' + lo + '">' + x.min + '</span><span class="hi l' + hi + '">' + x.max + "</span></div>";
}
function spreadCard(x, k, L, cls) {
  const T = TXT[L];
  return '<div class="card"><span class="k">' + esc(T[k]) + '</span><b class="n" dir="auto">' + esc(x.name) + '</b><span class="s" dir="auto">' + esc([x.producer, x.tastingName].filter(Boolean).join(" · ")) + "</span>" +
    band(x, L, cls) + '<div class="bandk"><span>' + esc(T.pBand) + " " + num(x.avg, L) + '</span><span>' + esc(votesTxt(x.votes, L)) + "</span></div></div>";
}

function renderPalato(o, circle, st, cls) {
  const L = o.lang, T = TXT[L];
  let h = header(L, "pEyebrow", circle);
  const top = (st.top || []).slice(0, o.rows);
  if (!top.length) return h + empty(T.empty);
  const types = (st.byType || []).slice().sort((a, b) => b.wines - a.wines), totT = types.reduce((a, x) => a + x.wines, 0);
  let left = "";
  if (types.length) {
    left += '<section><h2>' + esc(T.pOpen) + '</h2><ul class="list2">' + types.map(x => {
      const share = Math.round(100 * x.wines / totT); cls.add(Math.max(2, share));
      return '<li><b>' + esc(T["ty_" + x.type] || x.type) + ' <em>' + share + '%</em></b><em>' + esc(x.wines === 1 ? T.wines1 : tf(L, "winesN", { n: x.wines })) + " · " + esc(tf(L, "avgOf", { a: num(x.average, L) })) + '</em><span class="bar"><i class="b' + Math.max(2, share) + '"></i></span></li>';
    }).join("") + "</ul></section>";
  }
  const chips = (arr, key) => '<div class="chips">' + arr.slice(0, 4).map(x => '<span dir="auto">' + esc(x[key]) + " <em>" + num(x.average, L) + "</em></span>").join("") + "</div>";
  const reg = st.byRegion || [], gr = st.byGrape || [];
  if (reg.length) left += '<section class="sec"><h2>' + esc(T.pRegions) + "</h2>" + chips(reg, "region") + "</section>";
  if (gr.length) left += '<section class="sec"><h2>' + esc(T.pGrapes) + "</h2>" + chips(gr, "grape") + "</section>";
  if (!reg.length && !gr.length) left += '<p class="hint sec">' + esc(T.pNoRegion) + "</p>";
  if (st.divisive || st.agreed) {
    left += '<section class="sec">' + (st.divisive ? spreadCard(st.divisive, "pDiv", L, cls) : "") + (st.agreed && (!st.divisive || st.agreed.name !== st.divisive.name) ? spreadCard(st.agreed, "pAgree", L, cls) : "") + '<p class="hint">' + esc(T.pBandNote) + "</p></section>";
  } else left += '<p class="hint sec">' + esc(T.pNoBand) + "</p>";
  const [first, ...rest] = top, n1 = wineName(first, L), w1 = pct(first.avg); cls.add(w1);
  let right = '<section aria-label="' + esc(T.rankLabel) + '"><h2>' + esc(T.pTop) + "</h2>" +
    '<div class="champ"><span class="k">1</span><div class="row1"><div class="nm"><b dir="auto">' + esc(n1.name) + "</b>" + (n1.sub ? '<span dir="auto">' + esc(n1.sub) + "</span>" : "") +
    '</div><div class="sc"><b>' + num(first.avg, L) + "</b><span>" + esc(votesTxt(first.votes, L)) + '</span></div></div><div class="bar"><i class="b' + w1 + '"></i></div></div>';
  if (rest.length) right += '<ol start="2">' + rest.map((w, i) => { const n = wineName(w, L), wd = pct(w.avg); cls.add(wd);
    return '<li class="rk"><span class="pos">' + (i + 2) + '</span><span class="nm"><b dir="auto">' + esc(n.name) + '</b><span dir="auto">' + esc(n.sub) + '</span></span><span class="sc"><b>' + num(w.avg, L) + "</b><span>" + esc(votesTxt(w.votes, L)) + '</span></span><span class="bar" aria-hidden="true"><i class="b' + wd + '"></i></span></li>'; }).join("") + "</ol>";
  right += "</section>";
  return h + '<div class="cols two"><div>' + left + "</div>" + right + "</div>";
}

function renderStriscia(o, circle, st) {
  const L = o.lang, T = TXT[L], t = st.totals || {};
  const ev = (st.events || []).find(e => e.winner);
  return '<div class="strip"><div><p class="eb">Taste</p><span class="nm" dir="auto">' + esc(circle.name) + '</span></div><div class="st">' +
    "<span><b>" + (t.closed || 0) + "</b>" + esc(T.tEvenings) + "</span><span><b>" + (t.wines || 0) + "</b>" + esc(T.tWines) + "</span><span><b>" + num(st.average, L) + "</b>" + esc(T.tAvg) + "</span></div>" +
    (ev ? '<div class="lw"><span><em>' + esc(T.stLast) + '</em><span dir="auto">' + esc(wineName(ev.winner, L).name) + '</span></span><span class="chip">' + num(ev.winner.average, L) + "</span></div>" : "") + "</div>";
}

function compassHTML(g, L, cls) {
  const T = TXT[L];
  return '<div class="cmp">' + g.compass.slice(0, 5).map(c => [0, 1].map(k => {
    const ax = AX[c.axes][k], v = k ? c.y : c.x, p = pos10(v); cls.add("l" + p);
    return '<div class="ax"><b>' + esc(T["ax_" + ax]) + " · " + num(v, L) + '/10</b><span>' + esc(T["lo_" + ax]) + '</span><span class="ln"><i class="l' + p + '"></i></span><span>' + esc(T["hi_" + ax]) + "</span></div>";
  }).join("")).join("") + "</div>";
}

function renderSfida(o, circle, g, cls) {
  const L = o.lang, T = TXT[L];
  let h = header(L, "sEyebrow", circle);
  if (!g.wines) return h + empty(circle.game ? T.sEmpty : T.sOff);
  h += '<div class="tiles" role="list"><div class="tile" role="listitem"><b>' + g.moves + "</b><span>" + esc(T.sMoves) + '</span></div><div class="tile" role="listitem"><b>' + g.wines + "</b><span>" + esc(T.sWines) + "</span></div>" +
    '<div class="tile acc" role="listitem"><b>' + (g.pronRate == null ? "–" : g.pronRate + "%") + "</b><span>" + esc(T.sPron) + '</span></div><div class="tile" role="listitem"><b>' + (g.priceErr == null ? "–" : Math.round(g.priceErr) + "%") + "</b><span>" + esc(T.sPrice) + "</span></div></div>";
  let left = "", right = "";
  if (g.compass.length) left += '<section><h2>' + esc(T.sCompass) + '</h2><p class="hint">' + esc(T.sCompassNote) + "</p>" + compassHTML(g, L, cls) + "</section>";
  if (g.bias != null) {
    const n = num(Math.abs(g.bias), L), txt = Math.abs(g.bias) < 1 ? T.sBiasEven : g.bias > 0 ? tf(L, "sBiasUp", { n }) : tf(L, "sBiasDown", { n });
    right += '<div class="card"><span class="k">' + esc(T.sBias) + '</span><b class="n">' + esc(txt) + "</b></div>";
  }
  if ((g.aromas || []).length) right += '<div class="card"><span class="k">' + esc(T.sNose) + '</span><div class="chips sec0">' + g.aromas.map(x => "<span>" + esc(AR[L][x.k] || x.k) + " <em>" + x.n + "</em></span>").join("") + "</div></div>";
  if ((g.words || []).length) right += '<div class="card"><span class="k">' + esc(T.sWord) + '</span><b class="n">' + esc(PW[L][g.words[0].k] || g.words[0].k) + '</b><span class="s">' + esc(g.words.slice(1).map(x => (PW[L][x.k] || x.k) + " " + x.n).join(" · ")) + "</span></div>";
  if (g.surprise) right += '<div class="card"><span class="k">' + esc(T.sSurprise) + '</span><b class="n" dir="auto">' + esc(g.surprise.name || g.surprise.tastingName) + '</b><span class="s">' + esc(tf(L, "sSurpriseTxt", { g: g.surprise.guess, p: g.surprise.price })) + "</span></div>";
  const sc = (x, k) => '<div class="card"><span class="k">' + esc(T[k]) + '</span><b class="n" dir="auto">' + esc(x.name || x.tastingName) + '</b><span class="s" dir="auto">' + esc([x.producer, tf(L, "sPlayers", { n: x.players })].filter(Boolean).join(" · ")) + "</span></div>";
  if (g.split) right += sc(g.split, "sSplit");
  if (g.tight) right += sc(g.tight, "sTight");
  return h + '<div class="cols' + (left && right ? " two" : "") + '">' + (left ? "<div>" + left + "</div>" : "") + (right ? "<section>" + right + "</section>" : "") + "</div>";
}

function renderCampo(o, circle, g, cls) {
  const L = o.lang, T = TXT[L];
  let h = header(L, "cEyebrow", circle);
  const f = g.last;
  if (!f) return h + empty(circle.game || g.wines ? T.cEmpty : T.sOff);
  const [ax, ay] = AX[f.axes];
  const dot = (x, y, c, inner) => { const px = pos10(x), py = pos10(y); cls.add("l" + px); cls.add("u" + py); return '<span class="' + c + " l" + px + " u" + py + '">' + (inner || "") + "</span>"; };
  h += '<p class="hint" dir="auto">' + esc([f.name, f.producer, f.tastingName].filter(Boolean).join(" · ")) + "</p>";
  h += '<div class="field" role="img" aria-label="' + esc(T["ax_" + ax] + " / " + T["ax_" + ay]) + '"><span class="gx"></span><span class="gy"></span>' +
    '<span class="an y">' + esc(T["ax_" + ay]) + ' ↑</span><span class="an x">' + esc(T["ax_" + ax]) + ' →</span>' +
    '<span class="lb t">' + esc(T["hi_" + ay]) + '</span><span class="lb b">' + esc(T["lo_" + ay]) + '</span><span class="lb l">' + esc(T["lo_" + ax]) + '</span><span class="lb r">' + esc(T["hi_" + ax]) + "</span>" +
    (f.center ? dot(f.center.x, f.center.y, "c") : "") + f.dots.map(d => dot(d.x, d.y, d.initials ? "d" : "d a", d.initials ? esc(d.initials) : "")).join("") + "</div>";
  h += '<div class="legend"><span>' + esc(T.cAvg) + ": " + num(f.avg, L) + "</span><span>◌ " + esc(T.cCenter) + "</span></div>";
  return h;
}

function renderPodio(o, circle, g) {
  const L = o.lang, T = TXT[L];
  let h = header(L, "gEyebrow", circle);
  if (!circle.names) return h + empty(T.gOff);
  const b = g.board || [];
  if (!b.length) return h + empty(T.gEmpty);
  const pl = r => r.played === 1 ? T.gPlayed1 : tf(L, "gPlayedN", { n: r.played });
  const nk = r => (r.nick || []).map(k => '<span class="nk">' + esc(T["n_" + k] || k) + "</span>").join("");
  const order = [[b[1], 2], [b[0], 1], [b[2], 3]].filter(x => x[0]);
  h += '<div class="pod">' + order.map(([r, n]) => '<div class="p p' + n + '"><span class="av">' + esc(r.initials) + '</span><span class="nm" dir="auto">' + esc(r.name) + '</span><span class="pt">' + r.total + " " + esc(T.gPts) + "</span>" + nk(r) +
    '<span class="st h' + (n === 1 ? 64 : n === 2 ? 46 : 34) + '">' + n + "</span></div>").join("") + "</div>";
  if (b.length > 3) h += '<ol class="sec" start="4">' + b.slice(3, Math.max(4, o.rows)).map((r, i) => '<li class="rk"><span class="pos">' + (i + 4) + '</span><span class="nm"><b dir="auto">' + esc(r.name) + "</b><span>" + esc(pl(r)) + "</span>" + nk(r) + '</span><span class="sc"><b>' + r.total + "</b><span>" + esc(T.gPts) + "</span></span></li>").join("") + "</ol>";
  if ((g.awards || []).length) h += '<section class="sec"><h2>' + esc(T.aTitle) + '</h2><ul class="aw">' + g.awards.map(a => '<li><span class="k">' + esc(T["a_" + a.key]) + '</span><b dir="auto">' + esc(a.name) + "</b><span>" + esc(tf(L, "u_" + a.key, { n: a.value })) + "</span></li>").join("") + "</ul></section>";
  if ((g.twins || []).length) h += '<section class="sec"><h2>' + esc(T.tTwins) + '</h2><div class="chips">' + g.twins.map(p => '<span dir="auto">' + esc(p[0]) + " <em>&amp;</em> " + esc(p[1]) + "</span>").join("") + "</div></section>";
  return h;
}

function headers(res, nonce, cache) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", cache);
  res.setHeader("Content-Security-Policy", ["default-src 'none'", "style-src 'nonce-" + nonce + "'", "script-src 'nonce-" + nonce + "'", "img-src data:", "base-uri 'none'", "form-action 'none'", "frame-ancestors *"].join("; "));
}

module.exports = async (req, res) => {
  const nonce = crypto.randomBytes(16).toString("base64");
  let q;
  try { q = new URL(req.url, "http://x").searchParams; } catch (e) { q = new URLSearchParams(); }
  const o = options(q);
  const foot = '<footer><span>' + esc(TXT[o.lang].foot) + '</span><a href="https://sorso-taccuino.vercel.app/" target="_blank" rel="noopener">' + esc(TXT[o.lang].brand) + '</a></footer>';
  if (req.method !== "GET" && req.method !== "HEAD") { headers(res, nonce, "no-store"); res.status(405).send(page(o, nonce, "Taste", "")); return; }
  const token = q.get("t") || "";
  if (!TOKEN.test(token)) { headers(res, nonce, "public, max-age=300, s-maxage=300"); res.status(404).send(page(o, nonce, "Taste", '<p class="empty">' + esc(TXT[o.lang].gone) + "</p>")); return; }
  let redis;
  try { redis = getRedis(); } catch (e) { headers(res, nonce, "no-store"); res.status(503).send(page(o, nonce, "Taste", "")); return; }
  try {
    await Quota.ensure(redis);
    const rl = await limit.hit(redis, "wdg:" + clientIp(req), PER_IP, 60);
    if (!rl.ok) { headers(res, nonce, "no-store"); res.setHeader("Retry-After", String(rl.retryAfter)); res.status(429).send(page(o, nonce, "Taste", '<p class="empty">' + esc(TXT[o.lang].busy) + "</p>")); return; }
    const circle = await Circles.widgetCircle(redis, token);
    if (!circle) { headers(res, nonce, "public, max-age=60, s-maxage=60"); res.status(404).send(page(o, nonce, "Taste", '<p class="empty">' + esc(TXT[o.lang].gone) + "</p>")); return; }
    const widths = new Set([64, 46, 34].map(n => "h" + n));
    let body;
    if (o.view === "sfida" || o.view === "campo" || o.view === "podio") {
      const g = await Game.widgetStats(redis, circle.id, circle.names);
      const foot2 = '<footer><span>' + esc(TXT[o.lang][o.view === "podio" ? "gFoot" : o.view === "campo" ? "cFoot" : "sFoot"]) + '</span><a href="https://sorso-taccuino.vercel.app/" target="_blank" rel="noopener">' + esc(TXT[o.lang].brand) + "</a></footer>";
      body = (o.view === "sfida" ? renderSfida(o, circle, g, widths) : o.view === "campo" ? renderCampo(o, circle, g, widths) : renderPodio(o, circle, g)) + foot2;
    } else {
      const st = await Team.getTeamStatsApi(redis, Circles.CIRCLE_PARTNER.id, circle.id);
      body = o.view === "palato" ? renderPalato(o, circle, st, widths) + foot : o.view === "striscia" ? renderStriscia(o, circle, st) : render(o, circle, st, widths) + foot;
    }
    headers(res, nonce, "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
    res.status(200).send(page(o, nonce, circle.name + " — Taste", body, widths));
  } catch (e) {
    headers(res, nonce, "no-store");
    res.status(500).send(page(o, nonce, "Taste", ""));
  } finally {
    await Quota.flush(redis);
  }
};
module.exports.options = options;
