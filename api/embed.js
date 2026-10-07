const { getRedis } = require("./_redis");
const { AuthError } = require("./_jwt");
const { HttpError, parseBody, clientIp, bearer, sendJson, sendError } = require("./_http");
const Partner = require("./_partner");
const Team = require("./_team");
const Quota = require("./_quota");
const limit = require("./_limit");

/* API interna dell'embed: la usa solo la pagina /embed dentro l'iframe.
   POST con un corpo JSON { op, ... }. L'unica operazione senza sessione è
   "session", che scambia il token firmato dal partner con una sessione.
   Tutte le altre vogliono  Authorization: Bearer <sessione>. */

const WRITES = { "tasting.create": 1, "tasting.status": 1, "wine.add": 1, "vote": 1 };

function authFail(res, e) {
  sendJson(res, 401, { error: { code: e.code, message: e.message } });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: { code: "method_not_allowed", message: "Metodo non consentito." } });
    return;
  }
  let raw;
  try { raw = getRedis(); }
  catch (e) { sendJson(res, 503, { error: { code: "no_database", message: e.message } }); return; }

  try {
    await Quota.ensure(raw);
    const redis = Quota.track(raw);
    const body = parseBody(req);
    const op = String(body.op || "");
    if (Quota.level() !== "ok") res.setHeader("X-Sorso-Quota", Quota.level());

    if (op === "session") {
      const rl = await limit.hit(redis, "sess:" + clientIp(req), 30, 60);
      if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); throw new HttpError(429, "rate_limited", "Troppi tentativi: riprova fra poco."); }
      const { partner, ctx, jti, exp } = await Partner.verifyPartnerToken(redis, body.token);
      if (!(await Partner.consumeJti(redis, partner.id, jti, exp))) {
        throw new AuthError("token_used", "Token già usato: ricarica la pagina dal sito per ottenerne uno nuovo.");
      }
      const th = Partner.sanitizeTheme(partner.theme);
      sendJson(res, 200, {
        session: Partner.mintSession(partner, ctx),
        user: { name: ctx.name, role: ctx.role, team: ctx.team },
        config: {
          modes: partner.modes && partner.modes.length ? partner.modes : ["smart", "full"],
          defaultMode: partner.defaultMode === "full" ? "full" : "smart",
          lang: ctx.lang || partner.lang || "it",
          title: th.title || partner.name || "", logo: th.logo || ""
        },
        quota: Quota.level()
      });
      return;
    }

    const { partner, ctx } = await Partner.verifySession(redis, bearer(req));
    const rl = await limit.hit(redis, "u:" + partner.id + ":" + ctx.uid, 90, 60);
    if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); throw new HttpError(429, "rate_limited", "Troppe richieste: riprova fra poco."); }
    if (WRITES[op]) Quota.assertWritable();

    switch (op) {
      case "state": {
        const state = await Team.getState(redis, partner, ctx, body.tasting ? String(body.tasting) : "");
        state.quota = ctx.role === "organizer" ? Quota.level() : "ok";
        sendJson(res, 200, state);
        return;
      }
      case "tasting.create":
        sendJson(res, 200, { tasting: await Team.createTasting(redis, partner.id, ctx, body) });
        return;
      case "tasting.status": {
        const t = await Team.setTastingStatus(redis, partner.id, ctx, String(body.tasting || ""), body.status);
        sendJson(res, 200, { tasting: { id: t.id, name: t.name, status: t.status } });
        return;
      }
      case "wine.add":
        sendJson(res, 200, { wine: await Team.addWine(redis, partner.id, ctx, String(body.tasting || ""), body.wine) });
        return;
      case "vote":
        sendJson(res, 200, await Team.castVote(redis, partner, ctx, body));
        return;
      default:
        throw new HttpError(400, "unknown_op", "Operazione sconosciuta.");
    }
  } catch (e) {
    if (e instanceof AuthError) authFail(res, e);
    else sendError(res, e);
  } finally {
    await Quota.flush(raw);
  }
};
