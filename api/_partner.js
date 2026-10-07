const crypto = require("crypto");
const jwt = require("./_jwt");
const { AuthError } = jwt;

/* Configurazione dei siti partner e sessione dell'embed.

   Un partner è un record Redis  p:<id>  (JSON) più il suo id nell'insieme `partners`.
   Lo crea a mano scripts/partner.js. Il segreto di firma serve a verificare i token che
   il partner firma per i suoi utenti; la chiave API (di sola lettura) si salva solo
   come hash. */

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;      // minuscole, cifre e trattini in mezzo
const SESSION_TTL_SECONDS = 4 * 60 * 60;         // una serata di degustazione
const REGISTRY_TTL_MS = 60 * 1000;               // rotazioni e disattivazioni arrivano entro un minuto
const UNKNOWN_REFRESH_MS = 10 * 1000;            // un partner appena creato compare entro 10 secondi

function validId(id) { return typeof id === "string" && id.length >= 2 && id.length <= 31 && ID_RE.test(id); }

function sha256(s) { return crypto.createHash("sha256").update(s).digest("hex"); }

/* ---------------- colori e tema ---------------- */
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

const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = c => "#" + c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));   // t = quanto verso b; interi, come nell'esadecimale finale

/* nero e bianco puri: per qualunque colore, il migliore dei due dà almeno 4,58:1 (con un nero
   appena più chiaro i colori di luminosità media restavano sotto 4,5) */
const NERO = [0, 0, 0], BIANCO = [255, 255, 255];
const BG_CHIARO = hex2rgb("#fbfaf8"), BG_SCURO = hex2rgb("#161418");
const INK_CHIARO = hex2rgb("#1b1b1f"), INK_SCURO = hex2rgb("#f3efe9");
const ACCENT_BASE = hex2rgb("#7a1228");

/* Avvicina `c` a `verso` finché il contrasto con `su` raggiunge `minimo`. */
function garantisci(c, su, verso, minimo) {
  if (contrast(c, su) >= minimo) return c;
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const m = mix(c, verso, t);
    if (contrast(m, su) >= minimo) return m;
  }
  return verso;
}

/* Tavolozza completa e leggibile a partire dai colori del partner. Con un solo colore
   scelto gli altri si ricavano da quello, e il risultato non dipende più dal tema chiaro o
   scuro del dispositivo: testo ≥ 4,5:1 sullo sfondo, accento ≥ 3:1, testo sull'accento ≥ 4,5:1.
   Se il partner non sceglie nessun colore, restano quelli predefiniti (che seguono il dispositivo). */
function resolveTheme(theme) {
  const t = sanitizeTheme(theme);
  if (!t.accent && !t.bg && !t.ink) return null;
  let bg;
  if (t.bg) bg = hex2rgb(t.bg);
  else if (t.ink) bg = lum(hex2rgb(t.ink)) > 0.4 ? BG_SCURO : BG_CHIARO;      // testo chiaro → sfondo scuro
  else bg = BG_CHIARO;
  /* uno sfondo di luminosità media (per esempio #4080b8) non permette a nessun testo, nemmeno nero
     o bianco puro, di arrivare a 4,5:1 sui riquadri: in quel caso lo si schiarisce o scurisce
     quanto basta */
  const polo = c => contrast(BIANCO, c) >= contrast(NERO, c) ? BIANCO : NERO;
  let p0 = polo(bg);
  if (contrast(p0, bg) < 5.5) bg = garantisci(bg, p0, p0 === BIANCO ? NERO : BIANCO, 5.5);
  const scuro = lum(bg) < 0.4;
  let ink = t.ink ? hex2rgb(t.ink) : (scuro ? INK_SCURO : INK_CHIARO);
  if (contrast(ink, bg) < 4.5) ink = polo(bg);
  /* il testo deve restare leggibile anche sui riquadri (leggermente più scuri o chiari dello sfondo) */
  let surface = mix(bg, ink, 0.06);
  for (let i = 0; i < 3 && contrast(ink, surface) < 4.5; i++) {
    ink = garantisci(ink, surface, polo(surface), 4.5);
    surface = mix(bg, ink, 0.06);
  }
  if (contrast(ink, surface) < 4.5) { ink = polo(surface); surface = mix(bg, ink, 0.06); }
  let accent = t.accent ? hex2rgb(t.accent) : ACCENT_BASE;
  if (!t.accent && contrast(accent, bg) < 3) accent = scuro ? hex2rgb("#e0526b") : ACCENT_BASE;
  accent = garantisci(accent, bg, ink, 3);
  const onAccent = contrast(BIANCO, accent) >= contrast(NERO, accent) ? BIANCO : NERO;
  const line = mix(bg, ink, 0.22);
  const muted = garantisci(mix(bg, ink, 0.66), surface, ink, 4.5);
  const colore = (chiaro, scuroC) => garantisci(hex2rgb(scuro ? scuroC : chiaro), surface, ink, 4.5);
  return {
    "color-scheme": scuro ? "dark" : "light",
    "--bg": rgb2hex(bg), "--ink": rgb2hex(ink), "--accent": rgb2hex(accent), "--on-accent": rgb2hex(onAccent),
    "--surface": rgb2hex(surface), "--line": rgb2hex(line), "--muted": rgb2hex(muted),
    "--ok": rgb2hex(colore("#1e6b3a", "#6fcf8f")), "--warn": rgb2hex(colore("#8a5a00", "#f0b95a")), "--danger": rgb2hex(colore("#a31d1d", "#ff8a8a"))
  };
}

/* CSS del tema da iniettare nella pagina embed: solo valori calcolati qui. */
function themeCss(theme) {
  const t = sanitizeTheme(theme);
  const r = resolveTheme(theme);
  const v = [];
  if (r) Object.keys(r).forEach(k => v.push(k + ":" + r[k]));
  if (t.font) v.push("--font:" + FONTS[t.font]);
  return v.length ? ":root{" + v.join(";") + "}" : "";
}

/* ---------------- origini autorizzate a incorporare l'iframe ---------------- */
/* Solo https://dominio[:porta], senza percorso, caratteri jolly, punti e virgola, virgole o
   credenziali: il valore finisce dentro l'intestazione Content-Security-Policy, quindi
   un carattere in più potrebbe aggiungere o allargare una regola. http solo per localhost,
   e solo se il partner lo ha chiesto (allowLocalhost). */
function normalizeOrigin(o, allowLocalhost) {
  if (typeof o !== "string") return null;
  const raw = o.trim().replace(/\/$/, "");     // una barra finale è un errore innocuo: si toglie
  if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/i.test(raw)) return null;
  let u;
  try { u = new URL(raw); } catch (e) { return null; }
  const host = u.hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  if (local) { if (!allowLocalhost) return null; }
  else {
    if (u.protocol !== "https:") return null;
    if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)) return null;   // un dominio vero, con almeno un punto
  }
  if (u.port && (Number(u.port) < 1 || Number(u.port) > 65535)) return null;
  return u.origin;
}

function frameAncestors(partner) {
  const allowLocal = !!(partner && partner.allowLocalhost === true);
  const list = [];
  ((partner && partner.origins) || []).forEach(o => {
    const n = normalizeOrigin(o, allowLocal);
    if (n && list.indexOf(n) < 0) list.push(n);
  });
  return ["'self'"].concat(list).join(" ");
}

/* ---------------- chiave API ---------------- */
const KEY_RE = /^sk_([a-z0-9]+(?:-[a-z0-9]+)*)_([0-9a-f]{48})$/;
function newApiKey(id) { return "sk_" + id + "_" + crypto.randomBytes(24).toString("hex"); }
function partnerIdOfKey(key) { const m = KEY_RE.exec(String(key || "")); return m ? m[1] : null; }

/* ---------------- elenco dei partner, in memoria ----------------
   I partner si leggono tutti insieme (SMEMBERS partners + MGET) e si tengono in memoria
   per un minuto: così un identificativo inventato non costa nessun comando Redis, e
   nessuno può consumare la quota gratuita chiedendo partner a caso. Se arriva un id
   sconosciuto si ricarica l'elenco al massimo ogni 10 secondi (un partner appena creato
   si vede subito, e l'attacco non paga più di 2 comandi ogni 10 secondi per istanza). */
let registry = null;       // { at, map }
let refreshing = null;

function clearCache() { registry = null; refreshing = null; }

/* Scarta le configurazioni incomplete o malformate: meglio un partner "inesistente"
   che un errore interno a ogni richiesta. */
function parseConfig(raw, id) {
  let cfg = null;
  try { cfg = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { return null; }
  if (!cfg || typeof cfg !== "object" || cfg.id !== id || cfg.active === false) return null;
  if (typeof cfg.secret !== "string" || cfg.secret.length < 32) return null;
  cfg.origins = Array.isArray(cfg.origins) ? cfg.origins.filter(o => typeof o === "string") : [];
  const modes = Array.isArray(cfg.modes) ? cfg.modes.filter(m => m === "smart" || m === "full") : [];
  cfg.modes = modes.length ? modes : ["smart", "full"];
  return cfg;
}

function refreshRegistry(redis) {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const ids = ((await redis.smembers("partners")) || []).filter(validId);
      const raws = ids.length ? await redis.mget(...ids.map(i => "p:" + i)) : [];
      const map = new Map();
      ids.forEach((id, i) => { const c = parseConfig(raws[i], id); if (c) map.set(id, c); });
      registry = { at: Date.now(), map };
    } finally { refreshing = null; }
  })();
  return refreshing;
}

async function loadPartner(redis, id) {
  if (!validId(id)) return null;
  if (!registry || Date.now() - registry.at > REGISTRY_TTL_MS) await refreshRegistry(redis);
  let cfg = registry.map.get(id);
  if (!cfg && Date.now() - registry.at > UNKNOWN_REFRESH_MS) { await refreshRegistry(redis); cfg = registry.map.get(id); }
  return cfg || null;
}

/* Chi chiama l'API di sola lettura: chiave valida e partner attivo. */
async function partnerFromApiKey(redis, key) {
  const id = partnerIdOfKey(key);
  if (!id) throw new AuthError("api_key", "Chiave API non valida.");
  const p = await loadPartner(redis, id);
  if (!p || typeof p.apiKeyHash !== "string" || !jwt.safeEqual(sha256(key), p.apiKeyHash)) throw new AuthError("api_key", "Chiave API non valida.");
  return p;
}

/* ---------------- token firmato dal partner per un suo utente ---------------- */
const SUB_RE = /^[A-Za-z0-9._:@-]{1,128}$/;
const TEAM_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const JTI_RE = /^[A-Za-z0-9._:-]{8,64}$/;

/* Verifica firma, scadenza e claim. Restituisce il contesto dell'utente. */
async function verifyPartnerToken(redis, token) {
  const claims = jwt.peek(token);
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

/* ---------------- sessione dell'embed ----------------
   Senza stato, firmata con una chiave derivata dal segreto del partner (così ruotare il
   segreto la invalida, e non servono altre variabili d'ambiente né altri comandi Redis). */
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
  if (!payload || typeof payload !== "object") throw new AuthError("session", "Sessione non valida.");
  const partner = await loadPartner(redis, payload.p);
  if (!partner) throw new AuthError("session", "Sessione non valida.");
  const expected = jwt.hmac(sessionKey(partner.secret), parts[0] + "." + parts[1]);
  if (!jwt.safeEqual(expected, parts[2])) throw new AuthError("session", "Sessione non valida.");
  if (typeof payload.exp !== "number" || Date.now() / 1000 > payload.exp) throw new AuthError("session_expired", "Sessione scaduta: ricarica la pagina.");
  return { partner, ctx: { uid: payload.u, name: payload.n || "", team: payload.t, role: payload.r, lang: payload.l || null } };
}

module.exports = {
  ID_RE, SESSION_TTL_SECONDS, FONTS, validId, sha256, sanitizeTheme, resolveTheme, themeCss, contrast, hex2rgb, normalizeOrigin, frameAncestors,
  newApiKey, partnerIdOfKey, loadPartner, partnerFromApiKey, verifyPartnerToken, consumeJti,
  mintSession, verifySession, clearCache
};
