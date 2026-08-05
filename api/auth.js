const crypto = require("crypto");
const { getRedis } = require("./_redis");
const { createSession } = require("./_session");

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function normalizeUsername(raw) {
  return String(raw || "").trim().toLowerCase().slice(0, 40);
}

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

  const action = body.action;
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");

  if (!username || username.length < 2) {
    res.status(400).json({ error: "Il nome deve avere almeno 2 caratteri." });
    return;
  }
  if (username.indexOf("google:") === 0) {
    res.status(400).json({ error: "Questo nome non è disponibile." });
    return;
  }
  if (!password || password.length < 4) {
    res.status(400).json({ error: "La password deve avere almeno 4 caratteri." });
    return;
  }

  let redis;
  try {
    redis = getRedis();
  } catch (e) {
    res.status(503).json({ error: e.message });
    return;
  }

  const userKey = "user:" + username;

  try {
    if (action === "register") {
      const existing = await redis.get(userKey);
      if (existing) {
        res.status(409).json({ error: "Questo nome è già registrato. Prova ad accedere." });
        return;
      }
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = hashPassword(password, salt);
      await redis.set(userKey, JSON.stringify({ salt, hash, createdAt: Date.now() }));

      const token = await createSession(redis, username);
      res.status(200).json({ token, username });
      return;
    }

    if (action === "login") {
      const raw = await redis.get(userKey);
      if (!raw) {
        res.status(401).json({ error: "Nome o password non corretti." });
        return;
      }
      const record = JSON.parse(raw);
      const hash = hashPassword(password, record.salt);
      const a = Buffer.from(hash, "hex");
      const b = Buffer.from(record.hash, "hex");
      const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!valid) {
        res.status(401).json({ error: "Nome o password non corretti." });
        return;
      }
      const token = await createSession(redis, username);
      res.status(200).json({ token, username });
      return;
    }

    res.status(400).json({ error: "Azione non valida." });
  } catch (e) {
    res.status(500).json({ error: "Errore del server: " + (e && e.message ? e.message : "sconosciuto") });
  }
};
