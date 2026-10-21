const { getRedis } = require("./_redis");
const { AuthError } = require("./_jwt");
const { HttpError, parseBody, clientIp, bearer, sendJson, sendError, cleanText } = require("./_http");
const Partner = require("./_partner");
const Team = require("./_team");
const Quota = require("./_quota");
const limit = require("./_limit");
const Circles = require("./_circles");
const Game = require("./_game");

/* API interna dell'embed: la usa solo la pagina /embed dentro l'iframe.
   POST con un corpo JSON { op, ... }. L'unica operazione senza sessione è
   "session", che scambia il token firmato dal partner con una sessione.
   Tutte le altre vogliono  Authorization: Bearer <sessione>. */

const WRITES = Object.assign(Object.create(null), { "tasting.create": 1, "tasting.status": 1, "tasting.delete": 1, "wine.add": 1, "vote": 1, "tasting.reveal": 1, "guess": 1, "wine.status": 1 });
const SESSIONS_PER_IP = 200;   // al minuto: una serata di 40 persone nello stesso locale entra senza problemi
const OPS_PER_USER = 90;       // al minuto

function authFail(res, e) {
  sendJson(res, 401, { error: { code: e.code, message: e.message } });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: { code: "method_not_allowed", message: "Metodo non consentito." } });
    return;
  }
  let redis;
  try { redis = getRedis(); }
  catch (e) { sendJson(res, 503, { error: { code: "no_database", message: e.message } }); return; }

  try {
    await Quota.ensure(redis);
    const body = parseBody(req);
    const op = typeof body.op === "string" ? body.op : "";
    if (Quota.level() !== "ok") res.setHeader("X-Sorso-Quota", Quota.level());

    /* serate di una cerchia (dentro l'app, stessa origine): sessione Sorso + ruolo letto dalla cerchia */
    let partner, ctx;
    if (typeof body.circle === "string" && body.circle) {
      const c = await Circles.embedContext(redis, bearer(req), body.circle);
      partner = c.partner; ctx = c.ctx;
      if (op === "session") {
        const rs = await limit.hit(redis, "u:" + partner.id + ":" + ctx.uid, OPS_PER_USER, 60);
        if (!rs.ok) { res.setHeader("Retry-After", String(rs.retryAfter)); throw new HttpError(429, "rate_limited", "Troppe richieste: riprova fra poco."); }
        const u = await Circles.getUser(redis, c.username);
        const mode = body.mode === "full" || body.mode === "smart" ? body.mode : "smart";
        sendJson(res, 200, {
          session: "circle", user: { name: u.name, role: ctx.role, team: ctx.team, circleRole: ctx.circleRole },
          config: { modes: partner.modes, defaultMode: mode, lang: body.lang === "en" ? "en" : "it", title: cleanText(c.circle.name, 60), logo: "", circle: true, game: !!ctx.game },
          quota: Quota.level() === "readonly" ? "readonly" : "ok"
        });
        return;
      }
    } else if (op === "session") {
      const rl = await limit.hit(redis, "sess:" + clientIp(req), SESSIONS_PER_IP, 60);
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
          modes: partner.modes,
          defaultMode: ctx.mode && partner.modes.indexOf(ctx.mode) > -1 ? ctx.mode
            : (partner.defaultMode === "full" && partner.modes.indexOf("full") > -1 ? "full" : (partner.modes.indexOf("smart") > -1 ? "smart" : partner.modes[0])),
          lang: ctx.lang || partner.lang || "it",
          title: th.title || partner.name || "", logo: th.logo || ""
        },
        quota: Quota.level() === "readonly" ? "readonly" : "ok"
      });
      return;
    }

    if (!partner) ({ partner, ctx } = await Partner.verifySession(redis, bearer(req)));
    const rl = await limit.hit(redis, "u:" + partner.id + ":" + ctx.uid, OPS_PER_USER, 60);
    if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); throw new HttpError(429, "rate_limited", "Troppe richieste: riprova fra poco."); }
    if (WRITES[op]) Quota.assertWritable();
    /* il gioco delle cerchie (api/_game.js) */
    if (Object.prototype.hasOwnProperty.call(Game.OPS, op)) {
      if (Game.WRITES.has(op)) Quota.assertWritable();
      sendJson(res, 200, await Game.OPS[op](redis, partner, ctx, body));
      return;
    }

    switch (op) {
      case "state": {
        const state = await Team.getState(redis, partner, ctx, typeof body.tasting === "string" ? body.tasting : "");
        /* l'avviso "quasi al limite" lo vedono gli organizzatori; la sola lettura serve a tutti,
           perché chi non può votare deve saperlo prima di compilare una scheda */
        const q = Quota.level();
        state.quota = q === "readonly" ? "readonly" : (q === "warn" && ctx.role === "organizer" ? "warn" : "ok");
        sendJson(res, 200, state);
        return;
      }
      case "tasting.create": {
        /* «un solo vino»: la degustazione nasce con il suo vino; se il vino non va, non resta una degustazione vuota */
        const single = body.wine && typeof body.wine === "object";
        const tasting = await Team.createTasting(redis, partner.id, ctx, Object.assign({}, body, { single: !!single, blind: single ? false : body.blind }));
        let wine = null;
        if (single) {
          try { wine = await Team.addWine(redis, partner.id, ctx, tasting.id, body.wine); }
          catch (e) { await Team.deleteTasting(redis, partner.id, ctx, tasting.id).catch(() => {}); throw e; }
        }
        sendJson(res, 200, wine ? { tasting, wine } : { tasting });
        return;
      }
      case "tasting.status": {
        const t = await Team.setTastingStatus(redis, partner.id, ctx, body.tasting, body.status);
        sendJson(res, 200, { tasting: { id: t.id, name: t.name, status: t.status, blind: !!t.blind, revealed: !!t.revealed } });
        return;
      }
      case "tasting.reveal": {
        const t = await Team.revealTasting(redis, partner.id, ctx, body.tasting);
        sendJson(res, 200, { tasting: { id: t.id, name: t.name, status: t.status, blind: !!t.blind, revealed: !!t.revealed } });
        return;
      }
      case "wine.status":
        sendJson(res, 200, { wine: await Team.setWineStatus(redis, partner.id, ctx, body.tasting, body.wine, body.status) });
        return;
      case "guess":
        sendJson(res, 200, await Team.castGuess(redis, partner, ctx, body));
        return;
      case "notebook":
        sendJson(res, 200, { notebook: await Team.getNotebook(redis, partner, ctx) });
        return;
      case "stats":
        sendJson(res, 200, { stats: await Team.getStats(redis, partner, ctx) });
        return;
      case "tasting.delete":
        sendJson(res, 200, await Team.deleteTasting(redis, partner.id, ctx, body.tasting));
        return;
      case "wine.add":
        sendJson(res, 200, { wine: await Team.addWine(redis, partner.id, ctx, body.tasting, body.wine) });
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
    await Quota.flush(redis);
  }
};
