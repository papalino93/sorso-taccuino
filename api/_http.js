/* Piccoli aiuti comuni alle funzioni dello spazio di team. */

class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  return body && typeof body === "object" ? body : {};
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

/* stringa pulita: tolti spazi ai bordi e caratteri di controllo, lunghezza limitata */
function cleanText(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

module.exports = { HttpError, parseBody, clientIp, bearer, noStore, sendJson, sendError, cleanText };
