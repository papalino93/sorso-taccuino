const { Redis } = require("@upstash/redis");

let client = null;

/* Supporta sia i nomi env di "Vercel KV" sia quelli dell'integrazione
   Upstash diretta dal Marketplace, qualunque delle due venga collegata
   al progetto. automaticDeserialization è disattivato: i valori sono
   sempre stringhe JSON già serializzate dal chiamante (frontend o
   funzione), così un get restituisce esattamente ciò che è stato
   scritto, senza un doppio parse implicito del client. */
function getRedis() {
  if (client) return client;
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Nessun database collegato: aggiungi l'integrazione Vercel KV / Upstash Redis al progetto."
    );
  }
  client = new Redis({ url, token, automaticDeserialization: false });
  return client;
}

module.exports = { getRedis };
