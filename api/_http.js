/* Piccoli aiuti comuni alle funzioni dello spazio di team. */

class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  return body && typeof body === "object" && !Array.isArray(body) ? body : {};
}

function clientIp(req) {
  const xf = String((req.headers && req.headers["x-forwarded-for"]) || "");
  return xf.split(",")[0].trim() || "unknown";
}

function bearer(req) {
  const h = String((req.headers && req.headers.authorization) || "");
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(res, status, obj) {
  noStore(res);
  res.status(status).json(obj);
}

/* Risposta di errore uniforme: { error: { code, message } } */
function sendError(res, err) {
  if (err instanceof HttpError) {
    sendJson(res, err.status, { error: { code: err.code, message: err.message } });
    return;
  }
  console.error("Errore interno:", err && err.stack ? err.stack : err);
  sendJson(res, 500, { error: { code: "internal", message: "Errore del server." } });
}

/* Caratteri che non si vedono o che cambiano la direzione del testo: tolti, perché
   un nome fatto solo di questi sembrerebbe vuoto e uno con U+202E si leggerebbe al
   contrario (zero-width, controlli bidirezionali, BOM, trattino morbido). */
const INVISIBILI = /[\u00ad\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\u2800\u3164\ufe00-\ufe0e\ufeff\uffa0\u{e0000}-\u{e0fff}]/gu;
const CONTROLLI = /[\u0000-\u001f\u007f-\u009f]/g;

/* Stringa pulita: solo testo (mai numeri, oggetti o liste: "[object Object]" non è un
   nome), senza caratteri di controllo né invisibili, spazi compattati, lunghezza
   limitata in caratteri veri (non si taglia una coppia surrogata a metà). */
function cleanText(v, max) {
  if (typeof v !== "string") return "";
  const s = v.replace(INVISIBILI, "").replace(CONTROLLI, " ").replace(/\s+/g, " ").trim();
  const cp = Array.from(s);
  return cp.length > max ? cp.slice(0, max).join("").trim() : s;
}

/* decodeURIComponent senza eccezioni: un % isolato nel percorso non deve dare un 500 */
function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return null; }
}

module.exports = { HttpError, parseBody, clientIp, bearer, noStore, sendJson, sendError, cleanText, safeDecode };
