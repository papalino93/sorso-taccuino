const crypto = require("crypto");
const jwt = require("./_jwt");
const { AuthError } = jwt;

/* Configurazione dei siti partner e sessione dell'embed.

   Un partner è un record Redis  p:<id>  (JSON). Lo crea a mano
   scripts/partner.js. Il segreto di firma serve a verificare i token che il
   partner firma per i suoi utenti; la chiave API (di sola lettura) si salva
   solo come hash. */

const ID_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;
const SESSION_TTL_SECONDS = 4 * 60 * 60;   // una serata di degustazione
const CACHE_TTL_MS = 30 * 1000;            // rotazioni e disattivazioni si propagano in 30 s

const cache = new Map();
function clearCache() { cache.clear(); }

function validId(id) { return typeof id === "string" && ID_RE.test(id); }

function sha256(s) { return crypto.createHash("sha256").update(s).digest("hex"); }

/* ---- tema: solo valori sicuri, mai testo libero dentro il CSS ---- */
const FONTS = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  rounded: 'ui-rounded, "Nunito", "Segoe UI", system-ui, sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace'
};
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function sanitizeTheme(t) {
  const out = {};
  if (!t || typeof t !== "object") return out;
  ["accent", "bg", "ink"].forEach(k => { if (typeof t[k] === "string" && COLOR_RE.test(t[k])) out[k] = t[k].toLowerCase(); });
  if (typeof t.font === "string" && FONTS[t.font]) out.font = t.font;
  if (typeof t.title === "string") out.title = t.title.replace(/[\u0000-\u001f<>"'`]/g, "").trim().slice(0, 40);
  if (typeof t.logo === "string" && /^https:\/\/[^\s"'()<>\\]{1,280}$/.test(t.logo)) out.logo = t.logo;
  return out;
}

/* variabili CSS del tema, da iniettare nella pagina embed */
function themeCss(theme) {
  const t = sanitizeTheme(theme);
  const v = [];
  if (t.accent) v.push("--accent:" + t.accent);
  if (t.bg) v.push("--bg:" + t.bg);
  if (t.ink) v.push("--ink:" + t.ink);
  if (t.font) v.push("--font:" + FONTS[t.font]);
  return v.length ? ":root{" + v.join(";") + "}" : "";
}

/* ---- origini autorizzate a incorporare l'iframe ---- */
function normalizeOrigin(o, allowLocalhost) {
  let u;
  try { u = new URL(String(o)); } catch (e) { return null; }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(allowLocalhost && local && u.protocol === "http:")) return null;
  if (u.origin !== String(o).replace(/\/$/, "")) return null;
  return u.origin;
}

function frameAncestors(partner) {
  const list = (partner && partner.origins || []).filter(o => normalizeOrigin(o, true));
  return ["'self'"].concat(list).join(" ");
}

/* ---- chiave API ---- */
const KEY_RE = /^sk_([a-z0-9-]+)_([0-9a-f]{48})$/;
function newApiKey(id) { return "sk_" + id + "_" + crypto.randomBytes(24).toString("hex"); }
function partnerIdOfKey(key) { const m = KEY_RE.exec(String(key || "")); return m ? m[1] : null; }

/* ---- caricamento ---- */
async function loadPartner(redis, id) {
  if (!validId(id)) return null;
  const hit = cache.get(id);
  if (hit && hit.exp > Date.now()) return hit.cfg;
  const raw = await redis.get("p:" + id);
  let cfg = null;
  if (raw) {
    try { cfg = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { cfg = null; }
  }
  if (cfg && (cfg.id !== id || cfg.active === false)) cfg = null;
  cache.set(id, { cfg, exp: Date.now() + CACHE_TTL_MS });
  return cfg;
}

/* Chi chiama l'API di sola lettura: chiave valida e partner attivo. */
async function partnerFromApiKey(redis, key) {
  const id = partnerIdOfKey(key);
  if (!id) throw new AuthError("api_key", "Chiave API non valida.");
  const p = await loadPartner(redis, id);
  if (!p || !p.apiKeyHash || !jwt.safeEqual(sha256(key), p.apiKeyHash)) throw new AuthError("api_key", "Chiave API non valida.");
  return p;
}

/* ---- token firmato dal partner per un suo utente ---- */
const SUB_RE = /^[A-Za-z0-9._:@-]{1,128}$/;
const TEAM_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const JTI_RE = /^[A-Za-z0-9._:-]{8,64}$/;

/* Verifica firma, scadenza e claim. Restituisce il contesto dell'utente. */
async function verifyPartnerToken(redis, token) {
  let claims;
  try { claims = jwt.peek(token); } catch (e) { throw e; }
  const partner = await loadPartner(redis, claims && claims.iss);
  if (!partner) throw new AuthError("partner", "Partner sconosciuto o disattivato.");
  const c = jwt.verify(token, partner.secret, { maxLifetime: 900 });
  if (c.iss !== partner.id) throw new AuthError("partner", "Partner non valido.");
  if (typeof c.sub !== "string" || !SUB_RE.test(c.sub)) throw new AuthError("claim_sub", "Claim sub non valido.");
  if (typeof c.team !== "string" || !TEAM_RE.test(c.team)) throw new AuthError("claim_team", "Claim team non valido.");
  if (typeof c.jti !== "string" || !JTI_RE.test(c.jti)) throw new AuthError("claim_jti", "Claim jti mancante o non valido.");
  const role = c.role == null ? "member" : c.role;
  if (role !== "member" && role !== "organizer") throw new AuthError("claim_role", "Ruolo non valido: member oppure organizer.");
  const name = typeof c.name === "string" ? c.name.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 60) : "";
  const lang = c.lang === "en" || c.lang === "it" ? c.lang : null;
  return { partner, ctx: { uid: c.sub, name, team: c.team, role, lang }, jti: c.jti, exp: c.exp };
}

/* Il token si può usare una volta sola: si registra il jti fino a scadenza. */
async function consumeJti(redis, partnerId, jti, exp) {
  const ttl = Math.max(60, Math.ceil(exp - Date.now() / 1000) + 120);
  const r = await redis.set("jti:" + partnerId + ":" + jti, "1", { nx: true, ex: ttl });
  return r === "OK";
}

/* ---- sessione dell'embed: senza stato, firmata con una chiave derivata dal
   segreto del partner (così ruotare il segreto la invalida, e non servono
   altre variabili d'ambiente né altri comandi Redis) ---- */
function sessionKey(secret) {
  return crypto.createHmac("sha256", secret).update("sorso-embed-session-v1").digest();
}

function mintSession(partner, ctx, now) {
  now = now != null ? now : Math.floor(Date.now() / 1000);
  const payload = { p: partner.id, u: ctx.uid, n: ctx.name, t: ctx.team, r: ctx.role, l: ctx.lang || null, exp: now + SESSION_TTL_SECONDS };
  const body = "s1." + jwt.b64u(JSON.stringify(payload));
  return body + "." + jwt.hmac(sessionKey(partner.secret), body);
}

async function verifySession(redis, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "s1") throw new AuthError("session", "Sessione non valida.");
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); }
  catch (e) { throw new AuthError("session", "Sessione non valida."); }
  const partner = await loadPartner(redis, payload && payload.p);
  if (!partner) throw new AuthError("session", "Sessione non valida.");
  const expected = jwt.hmac(sessionKey(partner.secret), parts[0] + "." + parts[1]);
  if (!jwt.safeEqual(expected, parts[2])) throw new AuthError("session", "Sessione non valida.");
  if (typeof payload.exp !== "number" || Date.now() / 1000 > payload.exp) throw new AuthError("session_expired", "Sessione scaduta: ricarica la pagina.");
  return { partner, ctx: { uid: payload.u, name: payload.n || "", team: payload.t, role: payload.r, lang: payload.l || null } };
}

module.exports = {
  ID_RE, SESSION_TTL_SECONDS, FONTS, validId, sha256, sanitizeTheme, themeCss, normalizeOrigin, frameAncestors,
  newApiKey, partnerIdOfKey, loadPartner, partnerFromApiKey, verifyPartnerToken, consumeJti,
  mintSession, verifySession, clearCache
};
