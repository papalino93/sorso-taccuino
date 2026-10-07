#!/usr/bin/env node
/* Consumo mensile di comandi Redis dello spazio di team (piano gratuito: 500.000).
   Il contatore è approssimato (vedi api/_quota.js): per difetto di qualche punto
   percentuale. Serve KV_REST_API_URL e KV_REST_API_TOKEN nell'ambiente. */
const Quota = require("../api/_quota");

async function main(redis, log) {
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const n = Number(await redis.get(Quota.monthKey(d))) || 0;
    const pct = (n / Quota.LIMIT * 100).toFixed(1);
    const stato = n >= Quota.LIMIT * Quota.READONLY_AT ? "  → SOLA LETTURA" : n >= Quota.LIMIT * Quota.WARN_AT ? "  → attenzione" : "";
    log(d.toISOString().slice(0, 7) + "  " + String(n).padStart(8) + " / " + Quota.LIMIT + "  (" + pct + "%)" + stato);
  }
}

module.exports = { main };
if (require.main === module) {
  const { getRedis } = require("../api/_redis");
  let redis;
  try { redis = getRedis(); } catch (e) { console.error(e.message); process.exit(2); }
  main(redis, console.log).catch(e => { console.error("Errore: " + e.message); process.exit(1); });
}
