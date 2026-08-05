const crypto = require("crypto");

const SESSION_TTL_SECONDS = 60 * 24 * 60 * 60; // 60 giorni

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

/* Crea una sessione per lo username indicato e restituisce il token.
   Usata sia dal login con nome+password sia da quello con Google. */
async function createSession(redis, username) {
  const token = makeToken();
  await redis.set("session:" + token, username, { ex: SESSION_TTL_SECONDS });
  return token;
}

module.exports = { createSession, makeToken, SESSION_TTL_SECONDS };
