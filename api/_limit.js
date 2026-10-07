/* Limite di richieste a finestra fissa: un INCR (e un EXPIRE alla prima
   richiesta della finestra), quindi 1-2 comandi Redis per controllo. */
async function hit(redis, scope, limit, windowSec) {
  const nowSec = Math.floor(Date.now() / 1000);
  const win = Math.floor(nowSec / windowSec);
  const key = "rl:" + scope + ":" + win;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, windowSec * 2);
  return { ok: n <= limit, count: n, retryAfter: Math.max(1, windowSec - (nowSec % windowSec)) };
}

module.exports = { hit };
