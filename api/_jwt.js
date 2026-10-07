const crypto = require("crypto");

/* JWT HS256 minimale, senza dipendenze. Serve a due cose:
   - verificare il token che il sito partner firma per i suoi utenti;
   - firmare/verificare il token di sessione dell'embed (vedi _partner.js).
   Accetta solo HS256: "none" e qualunque altro algoritmo vengono rifiutati. */

class AuthError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

const b64u = v => Buffer.from(v).toString("base64url");

function hmac(secret, data) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function parseJson(part) {
  try { return JSON.parse(Buffer.from(part, "base64url").toString("utf8")); }
  catch (e) { throw new AuthError("malformed", "Token non valido."); }
}

function sign(payload, secret) {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64u(JSON.stringify(payload));
  return h + "." + p + "." + hmac(secret, h + "." + p);
}

/* Legge il contenuto SENZA verificare la firma: serve solo a sapere di quale
   partner si tratta (claim iss) per andare a prendere il suo segreto. Non
   fidarsi mai di quanto restituisce prima di aver chiamato verify(). */
function peek(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new AuthError("malformed", "Token non valido.");
  return parseJson(parts[1]);
}

/* opzioni: now (secondi), leeway (tolleranza orologi), maxLifetime (secondi
   massimi fra adesso e exp: i token del partner devono essere di breve durata) */
function verify(token, secret, opts) {
  opts = opts || {};
  const now = opts.now != null ? opts.now : Date.now() / 1000;
  const leeway = opts.leeway != null ? opts.leeway : 60;
  const maxLifetime = opts.maxLifetime != null ? opts.maxLifetime : 900;
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new AuthError("malformed", "Token non valido.");
  const header = parseJson(parts[0]);
  if (!header || header.alg !== "HS256") throw new AuthError("alg", "Algoritmo non consentito: serve HS256.");
  if (!safeEqual(hmac(secret, parts[0] + "." + parts[1]), parts[2])) throw new AuthError("signature", "Firma non valida.");
  const payload = parseJson(parts[1]);
  if (!payload || typeof payload !== "object") throw new AuthError("malformed", "Token non valido.");
  if (typeof payload.exp !== "number" || !isFinite(payload.exp)) throw new AuthError("exp_missing", "Manca la scadenza (exp).");
  if (now > payload.exp + leeway) throw new AuthError("expired", "Token scaduto.");
  if (payload.exp - now > maxLifetime + Math.min(leeway, 20)) throw new AuthError("exp_too_far", "Scadenza troppo lontana: massimo " + Math.round(maxLifetime / 60) + " minuti.");
  if (typeof payload.nbf === "number" && now + leeway < payload.nbf) throw new AuthError("not_yet", "Token non ancora valido.");
  return payload;
}

module.exports = { AuthError, b64u, hmac, safeEqual, sign, peek, verify };
