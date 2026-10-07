const crypto = require("crypto");
const { getRedis } = require("./_redis");
const Partner = require("./_partner");
const Quota = require("./_quota");

/* Serve la pagina /embed (riscritta qui da vercel.json).

   Perché una funzione e non un file statico: l'intestazione
   Content-Security-Policy: frame-ancestors dipende dal partner, così la pagina
   si può incorporare solo dai domini che il partner ha registrato. Un file in
   public/ sarebbe incorporabile da chiunque. Per lo stesso motivo il guscio
   HTML sta qui e non in public/.

   Lo script e il foglio di stile veri (embed.js, embed.css) sono statici; il
   tema del partner è un piccolo <style> con nonce, fatto solo di valori
   controllati (vedi _partner.js: sanitizeTheme). */

const SHELL = nonce => themeCss => lang => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>Sorso</title>
<link rel="stylesheet" href="/embed.css">
<style nonce="${nonce}">${themeCss}</style>
</head>
<body>
<div id="app" aria-live="polite"></div>
<script src="/js/scoring.js"></script>
<script src="/embed.js"></script>
</body>
</html>
`;

function baseHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
}

module.exports = async (req, res) => {
  baseHeaders(res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).send("Metodo non consentito.");
    return;
  }
  let pid = "";
  try { pid = new URL(req.url, "http://x").searchParams.get("p") || ""; } catch (e) { pid = ""; }

  let partner = null, raw;
  try {
    raw = getRedis();
    await Quota.ensure(raw);
    partner = await Partner.loadPartner(Quota.track(raw), pid);
  } catch (e) {
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.status(503).send("Servizio non disponibile.");
    return;
  } finally {
    if (raw) await Quota.flush(raw);
  }

  if (!partner) {
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.status(404).send("Spazio non disponibile.");
    return;
  }

  const nonce = crypto.randomBytes(16).toString("base64");
  res.setHeader("Content-Security-Policy", [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'nonce-" + nonce + "'",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors " + Partner.frameAncestors(partner)
  ].join("; "));
  const lang = partner.lang === "en" ? "en" : "it";
  res.status(200).send(SHELL(nonce)(Partner.themeCss(partner.theme))(lang));
};
