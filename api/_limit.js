/* Limite di richieste a finestra fissa. Il contatore si crea e si incrementa in una
   sola transazione (SET NX con scadenza, poi INCR): se la funzione muore a metà non
   può restare una chiave senza scadenza che blocca qualcuno per sempre. Costo: 2 comandi. */
async function hit(redis, scope, limit, windowSec) {
  const nowSec = Math.floor(Date.now() / 1000);
  const win = Math.floor(nowSec / windowSec);
  const key = "rl:" + scope + ":" + win;
  const res = await redis.multi().set(key, 0, { nx: true, ex: windowSec * 2 }).incr(key).exec();
  const n = Number(res[1]);
  return { ok: n <= limit, count: n, retryAfter: Math.max(1, windowSec - (nowSec % windowSec)) };
}

module.exports = { hit };
