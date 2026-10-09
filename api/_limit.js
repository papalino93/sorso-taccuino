/* Limite di richieste a finestra fissa. Il contatore si crea e si incrementa in una
   sola transazione (SET NX con scadenza, poi INCR): se la funzione muore a metà non
   può restare una chiave senza scadenza che blocca qualcuno per sempre. Costo: 2 comandi. */
async function hit(redis, scope, limit, windowSec, n) {
  const nowSec = Math.floor(Date.now() / 1000);
  const win = Math.floor(nowSec / windowSec);
  const key = "rl:" + scope + ":" + win;
  const m = redis.multi().set(key, 0, { nx: true, ex: windowSec * 2 });
  const res = await (n > 1 ? m.incrby(key, n) : m.incr(key)).exec();
  const used = Number(res[1]);
  return { ok: used <= limit, count: used, retryAfter: Math.max(1, windowSec - (nowSec % windowSec)) };
}

module.exports = { hit };
