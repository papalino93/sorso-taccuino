const { getRedis } = require("./_redis");
const { HttpError, parseBody, bearer, clientIp, sendJson, sendError } = require("./_http");
const Quota = require("./_quota");
const limit = require("./_limit");
const C = require("./_circles");

/* L'indirizzo del sito nei link delle mail: fisso (o da APP_ORIGIN), mai ricavato dalla richiesta —
   altrimenti qualcuno potrebbe far partire mail con un link a un altro sito. */
function appOrigin() {
  const o = String(process.env.APP_ORIGIN || "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[a-z0-9.\-]+(:\d+)?$/i.test(o) ? o : "https://sorso-taccuino.vercel.app";
}

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
    /* l'anteprima dell'invito si può vedere senza accesso (chi apre il link dalla mail): limite per indirizzo IP */
    const pre = parseBody(req);
    if (typeof pre.op === "string" && C.PUBLIC.has(pre.op)) {
      const rlp = await limit.hit(redis, "circp:" + clientIp(req), 30, 60);
      if (!rlp.ok) { res.setHeader("Retry-After", String(rlp.retryAfter)); throw new HttpError(429, "rate_limited", "Troppe richieste: riprova fra poco."); }
      sendJson(res, 200, await C.OPS[pre.op](redis, null, pre, {}));
      return;
    }
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
    sendJson(res, 200, await fn(redis, user, body, { origin: appOrigin() }));
  } catch (e) {
    sendError(res, e);
  } finally {
    await Quota.flush(redis);
  }
};
