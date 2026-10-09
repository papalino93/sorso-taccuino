const { getRedis } = require("./_redis");
const { HttpError, parseBody, bearer, sendJson, sendError } = require("./_http");
const Quota = require("./_quota");
const limit = require("./_limit");
const C = require("./_circles");

/* Cerchie: POST con un corpo JSON { op, ... } e  Authorization: Bearer <sessione Sorso>.
   La sessione è quella dell'accesso con Google (la stessa dell'app). */
module.exports = async (req, res) => {
  if (req.method !== "POST") { sendJson(res, 405, { error: { code: "method_not_allowed", message: "Metodo non consentito." } }); return; }
  let redis;
  try { redis = getRedis(); }
  catch (e) { sendJson(res, 503, { error: { code: "no_database", message: e.message } }); return; }
  try {
    await Quota.ensure(redis);
    if (Quota.level() !== "ok") res.setHeader("X-Sorso-Quota", Quota.level());
    const token = bearer(req);
    const username = token ? await redis.get("session:" + token) : null;
    if (!username) throw new HttpError(401, "session", "Sessione scaduta: accedi di nuovo.");
    const rl = await limit.hit(redis, "circ:" + username, 90, 60);
    if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); throw new HttpError(429, "rate_limited", "Troppe richieste: riprova fra poco."); }
    const body = parseBody(req);
    const op = typeof body.op === "string" ? body.op : "";
    const fn = Object.prototype.hasOwnProperty.call(C.OPS, op) ? C.OPS[op] : null;
    if (!fn) throw new HttpError(400, "unknown_op", "Operazione sconosciuta.");
    if (C.WRITES.has(op)) Quota.assertWritable();
    const user = await C.getUser(redis, String(username));
    sendJson(res, 200, await fn(redis, user, body));
  } catch (e) {
    sendError(res, e);
  } finally {
    await Quota.flush(redis);
  }
};
