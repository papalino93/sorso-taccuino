const { getRedis } = require("./_redis");

/* Traduce il codice di scambio monouso (ricevuto in querystring dopo
   il login con Google) nel vero token di sessione. Il codice si
   consuma alla prima lettura. */
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Metodo non consentito" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};
  const code = String(body.code || "");
  if (!code) {
    res.status(400).json({ error: "Codice mancante." });
    return;
  }

  let redis;
  try {
    redis = getRedis();
  } catch (e) {
    res.status(503).json({ error: e.message });
    return;
  }

  try {
    const key = "xchg:" + code;
    const raw = await redis.get(key);
    if (!raw) {
      res.status(400).json({ error: "Codice scaduto o già usato." });
      return;
    }
    await redis.del(key);
    const data = JSON.parse(raw);
    res.status(200).json({ token: data.token, username: data.username, name: data.name || "" });
  } catch (e) {
    res.status(500).json({ error: "Errore del server." });
  }
};
