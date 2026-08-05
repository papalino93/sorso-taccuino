const crypto = require("crypto");
const { getRedis } = require("./_redis");
const { createSession } = require("./_session");

const XCHG_TTL_SECONDS = 60;

function redirectUri(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return proto + "://" + host + "/api/auth-google-callback";
}

function appOrigin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return proto + "://" + host;
}

function failRedirect(req, res, reason) {
  res.writeHead(302, { Location: appOrigin(req) + "/?gerr=" + encodeURIComponent(reason) });
  res.end();
}

/* Riceve il "code" da Google dopo il consenso, lo scambia con un
   token, recupera l'identità dell'utente e crea una sessione Sorso.
   Il token di sessione non viene messo nell'URL: si genera invece un
   codice di scambio monouso, che il frontend traduce nel token vero
   tramite /api/auth-exchange (così il token non finisce nella cronologia
   del browser né negli header Referer). */
module.exports = async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    failRedirect(req, res, "Login con Google non configurato sul server.");
    return;
  }

  const url = new URL(req.url, "http://x");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    failRedirect(req, res, "Accesso con Google annullato.");
    return;
  }
  if (!code || !state) {
    failRedirect(req, res, "Risposta di Google incompleta.");
    return;
  }

  let redis;
  try {
    redis = getRedis();
  } catch (e) {
    failRedirect(req, res, e.message);
    return;
  }

  try {
    const stateKey = "oauth-state:" + state;
    const stateOk = await redis.get(stateKey);
    if (!stateOk) {
      failRedirect(req, res, "Richiesta scaduta, riprova.");
      return;
    }
    await redis.del(stateKey);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri(req),
        grant_type: "authorization_code"
      }).toString()
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      failRedirect(req, res, "Scambio con Google non riuscito.");
      return;
    }

    const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + tokenData.access_token }
    });
    const info = await infoRes.json();
    if (!infoRes.ok || !info.sub) {
      failRedirect(req, res, "Impossibile leggere il profilo Google.");
      return;
    }

    const username = "google:" + info.sub;
    const userKey = "user:" + username;
    const existing = await redis.get(userKey);
    if (!existing) {
      await redis.set(userKey, JSON.stringify({
        provider: "google",
        email: info.email || "",
        name: info.name || "",
        createdAt: Date.now()
      }));
    }

    const token = await createSession(redis, username);

    const xchg = crypto.randomBytes(24).toString("hex");
    await redis.set("xchg:" + xchg, JSON.stringify({ token, username, name: info.name || "" }), { ex: XCHG_TTL_SECONDS });

    res.writeHead(302, { Location: appOrigin(req) + "/?g=" + xchg });
    res.end();
  } catch (e) {
    failRedirect(req, res, "Errore del server.");
  }
};
