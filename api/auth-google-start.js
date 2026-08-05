const crypto = require("crypto");
const { getRedis } = require("./_redis");

const STATE_TTL_SECONDS = 10 * 60;

function redirectUri(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return proto + "://" + host + "/api/auth-google-callback";
}

/* Avvia il login con Google: genera uno "state" anti-CSRF, lo
   registra a tempo, e reindirizza alla schermata di consenso Google. */
module.exports = async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).send("Login con Google non configurato: manca GOOGLE_CLIENT_ID.");
    return;
  }

  let redis;
  try {
    redis = getRedis();
  } catch (e) {
    res.status(503).send(e.message);
    return;
  }

  const state = crypto.randomBytes(16).toString("hex");
  try {
    await redis.set("oauth-state:" + state, "1", { ex: STATE_TTL_SECONDS });
  } catch (e) {
    res.status(500).send("Errore del server.");
    return;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account"
  });

  res.writeHead(302, { Location: "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString() });
  res.end();
};
