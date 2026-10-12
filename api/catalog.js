const { getRedis } = require("./_redis");
const { HttpError, parseBody, bearer, clientIp, sendJson, sendError } = require("./_http");
const Quota = require("./_quota");
const limit = require("./_limit");
const Cat = require("./_catalog");

/* Catalogo Sorso e codici a barre: POST { op, ... }.
   «search» si può usare anche senza accesso (la lettura dell'etichetta funziona per tutti), con un limite per indirizzo;
   «confirm» e «report» vogliono la sessione di Sorso. */
module.exports = async (req, res) => {
  if (req.method !== "POST") { sendJson(res, 405, { error: { code: "method_not_allowed", message: "Metodo non consentito." } }); return; }
  let redis;
  try { redis = getRedis(); }
  catch (e) { sendJson(res, 503, { error: { code: "no_database", message: e.message } }); return; }
  try {
    await Quota.ensure(redis);
    if (Quota.level() !== "ok") res.setHeader("X-Sorso-Quota", Quota.level());
    const body = parseBody(req);
    const op = typeof body.op === "string" && Object.prototype.hasOwnProperty.call(Cat.OPS, body.op) ? body.op : "";
    if (!op) throw new HttpError(400, "unknown_op", "Operazione sconosciuta.");
    const rl = await limit.hit(redis, "cat:" + clientIp(req), 30, 60);
    if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); throw new HttpError(429, "rate_limited", "Troppe richieste: riprova fra poco."); }
    const token = bearer(req);
    const username = token ? await redis.get("session:" + token) : null;
    if (Cat.NEEDS_LOGIN.has(op) && !username) throw new HttpError(401, "session", "Accedi per contribuire al catalogo.");
    if (Cat.WRITES.has(op)) Quota.assertWritable();
    sendJson(res, 200, await Cat.OPS[op](redis, username ? String(username) : null, body));
  } catch (e) {
    sendError(res, e);
  } finally {
    await Quota.flush(redis);
  }
};
