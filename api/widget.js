const crypto = require("crypto");
const { getRedis } = require("./_redis");
const { clientIp } = require("./_http");
const Quota = require("./_quota");
const limit = require("./_limit");
const Team = require("./_team");
const Circles = require("./_circles");
const Theme = require("../public/js/theme.js");

/* Widget per i siti: la pagina pubblica, di sola lettura, con le statistiche di una cerchia.
     /widget?t=<codice>[&lang=it|en][&theme=auto|light|dark][&accent=rrggbb][&bg=rrggbb|none][&rows=1-10][&show=top,events,totals]
   Fatta tutta sul server (niente codice da scaricare), incorporabile da qualunque sito, in cache per due minuti.
   Solo aggregati, gli stessi delle statistiche della cerchia: serate chiuse, una media dal secondo voto in su,
   vini alla cieca nascosti finché non vengono svelati. Nessun nome di chi ha votato. Si spegne revocando il link. */

const PER_IP = 120;                 // al minuto, per le richieste che non arrivano dalla cache
const TOKEN = /^[0-9a-f]{48}$/;

const TXT = {
  it: {
    eyebrow: "Classifica della cerchia", top: "I vini migliori", events: "Ultime serate", winner: "Il preferito", noWinner: "nessuna media ancora",
    votes1: "1 voto", votesN: "{n} voti", wines1: "1 vino", winesN: "{n} vini", blind: "Vino {n} (alla cieca)", tie: "pari merito",
    tEvenings: "Serate", tWines: "Vini", tVotes: "Voti", tAvg: "Media", scale: "su 100",
    empty: "La classifica compare quando si chiude la prima serata con almeno due voti per vino.",
    foot: "Medie anonime delle serate chiuse", brand: "Sorso · taccuino di degustazione", gone: "Questo widget non è disponibile: il link è stato revocato o non è corretto.", busy: "Troppe richieste: riprova fra poco.",
    rankLabel: "Classifica dei vini", evLabel: "Serate chiuse", in: "in"
  },
  en: {
    eyebrow: "Circle ranking", top: "Best wines", events: "Latest evenings", winner: "Favourite", noWinner: "no average yet",
    votes1: "1 vote", votesN: "{n} votes", wines1: "1 wine", winesN: "{n} wines", blind: "Wine {n} (blind)", tie: "tie",
    tEvenings: "Evenings", tWines: "Wines", tVotes: "Votes", tAvg: "Average", scale: "out of 100",
    empty: "The ranking appears once the first evening is closed with at least two votes per wine.",
    foot: "Anonymous averages of closed evenings", brand: "Sorso · tasting notebook", gone: "This widget is not available: the link was revoked or is wrong.", busy: "Too many requests: try again shortly.",
    rankLabel: "Wine ranking", evLabel: "Closed evenings", in: "at"
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
  return { lang, theme, rows, show, accent: hex(q.get("accent")), bg: hex(bgRaw), transparent: bgRaw === "none" };
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
  const bars = [...widths].map(w => ".b" + w + "{width:" + w + "%}").join("");
  return base + bars + `
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font:450 15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.w{container-type:inline-size;padding:16px}
.eb{margin:0;font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--acc-text)}
h1{margin:3px 0 0;font-size:22px;line-height:1.15;font-weight:780;letter-spacing:-.02em;overflow-wrap:anywhere}
h2{margin:0 0 8px;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
ol,ul{list-style:none;margin:0;padding:0}
.tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:14px 0 4px}
.tile{background:var(--card);border-radius:14px;padding:9px 10px 8px}
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
.rk{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:4px 10px;align-items:center;padding:9px 12px 10px;border-radius:14px;background:var(--card);margin-bottom:6px}
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
.ev .win{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:5px;padding:7px 10px;border-radius:12px;background:var(--card)}
.ev .win span{min-width:0;font-size:13px;overflow-wrap:anywhere}.ev .win em{font-style:normal;color:var(--muted);font-size:11.5px;display:block}
.chip{flex:none;display:inline-block;padding:2px 9px;border-radius:999px;background:var(--accent);color:var(--on);font-weight:750;font-size:12.5px;font-variant-numeric:tabular-nums}
.none{font-size:12.5px;color:var(--muted);font-style:italic;margin-top:3px;display:block}
.empty{margin-top:14px;padding:16px;border-radius:16px;background:var(--card);color:var(--ink2);font-size:14px}
footer{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 10px;margin-top:14px;padding-top:10px;border-top:1px solid var(--line);font-size:11.5px;color:var(--muted)}
footer a{color:inherit;font-weight:650;text-decoration:none;border-bottom:1px solid var(--line)}footer a:hover{color:var(--acc-text)}
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
<main class="w">${body}</main>
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
  let h = '<header><p class="eb">Sorso · ' + esc(T.eyebrow) + '</p><h1 dir="auto">' + esc(circle.name) + "</h1></header>";
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
  if (req.method !== "GET" && req.method !== "HEAD") { headers(res, nonce, "no-store"); res.status(405).send(page(o, nonce, "Sorso", "")); return; }
  const token = q.get("t") || "";
  if (!TOKEN.test(token)) { headers(res, nonce, "public, max-age=300, s-maxage=300"); res.status(404).send(page(o, nonce, "Sorso", '<p class="empty">' + esc(TXT[o.lang].gone) + "</p>")); return; }
  let redis;
  try { redis = getRedis(); } catch (e) { headers(res, nonce, "no-store"); res.status(503).send(page(o, nonce, "Sorso", "")); return; }
  try {
    await Quota.ensure(redis);
    const rl = await limit.hit(redis, "wdg:" + clientIp(req), PER_IP, 60);
    if (!rl.ok) { headers(res, nonce, "no-store"); res.setHeader("Retry-After", String(rl.retryAfter)); res.status(429).send(page(o, nonce, "Sorso", '<p class="empty">' + esc(TXT[o.lang].busy) + "</p>")); return; }
    const circle = await Circles.widgetCircle(redis, token);
    if (!circle) { headers(res, nonce, "public, max-age=60, s-maxage=60"); res.status(404).send(page(o, nonce, "Sorso", '<p class="empty">' + esc(TXT[o.lang].gone) + "</p>")); return; }
    const st = await Team.getTeamStatsApi(redis, Circles.CIRCLE_PARTNER.id, circle.id);
    headers(res, nonce, "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
    const widths = new Set();
    const body = render(o, circle, st, widths) + foot;
    res.status(200).send(page(o, nonce, circle.name + " — Sorso", body, widths));
  } catch (e) {
    headers(res, nonce, "no-store");
    res.status(500).send(page(o, nonce, "Sorso", ""));
  } finally {
    await Quota.flush(redis);
  }
};
module.exports.options = options;
