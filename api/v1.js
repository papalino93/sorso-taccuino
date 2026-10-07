const { getRedis } = require("./_redis");
const { AuthError } = require("./_jwt");
const { HttpError, clientIp, bearer, sendJson, sendError, noStore } = require("./_http");
const Partner = require("./_partner");
const Team = require("./_team");
const Quota = require("./_quota");
const limit = require("./_limit");

/* API di sola lettura per il server del sito partner (versione 1).
   Autenticazione:  Authorization: Bearer sk_<partner>_<chiave>
   vercel.json riscrive /api/v1/<percorso> in /api/v1?path=<percorso>.

     GET    /api/v1/tastings[?team=&status=open|closed]
     GET    /api/v1/tastings/{id}/results[?format=csv]
     DELETE /api/v1/users/{sub}

   Espone solo aggregati: mai chi ha votato cosa. La media compare dal secondo
   voto in su (con un voto solo coinciderebbe con quello di una persona). */

const ID = /^[A-Za-z0-9._:-]{1,128}$/;
const USER_ID = /^[A-Za-z0-9._:@-]{1,128}$/;   // come il claim sub del token: ammette la chiocciola (email)

function route(req) {
  let path = "";
  try { path = new URL(req.url, "http://x").searchParams.get("path") || ""; } catch (e) { path = ""; }
  if (!path && req.query && req.query.path) path = Array.isArray(req.query.path) ? req.query.path.join("/") : String(req.query.path);
  return path.split("/").filter(Boolean).map(decodeURIComponent);
}

module.exports = async (req, res) => {
  res.setHeader("X-Sorso-Api-Version", "1");
  let raw;
  try { raw = getRedis(); }
  catch (e) { sendJson(res, 503, { error: { code: "no_database", message: e.message } }); return; }

  try {
    await Quota.ensure(raw);
    const redis = Quota.track(raw);
    if (Quota.level() !== "ok") res.setHeader("X-Sorso-Quota", Quota.level());

    /* limite per indirizzo prima ancora di guardare la chiave: chi prova chiavi a caso si ferma */
    const pre = await limit.hit(redis, "v1ip:" + clientIp(req), 120, 60);
    if (!pre.ok) { res.setHeader("Retry-After", String(pre.retryAfter)); throw new HttpError(429, "rate_limited", "Troppe richieste: riprova fra poco."); }

    let partner;
    try { partner = await Partner.partnerFromApiKey(redis, bearer(req)); }
    catch (e) { if (e instanceof AuthError) throw new HttpError(401, "unauthorized", "Chiave API mancante o non valida."); throw e; }
    const rl = await limit.hit(redis, "v1:" + partner.id, 120, 60);
    if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); throw new HttpError(429, "rate_limited", "Troppe richieste: riprova fra poco."); }

    const parts = route(req);
    const url = new URL(req.url, "http://x");

    if (req.method === "GET" && parts.length === 1 && parts[0] === "tastings") {
      const status = url.searchParams.get("status");
      if (status && status !== "open" && status !== "closed") throw new HttpError(400, "invalid_status", "status: open oppure closed.");
      const team = url.searchParams.get("team") || "";
      sendJson(res, 200, { tastings: await Team.listTastings(redis, partner.id, { team, status }) });
      return;
    }

    if (req.method === "GET" && parts.length === 3 && parts[0] === "tastings" && parts[2] === "results") {
      if (!ID.test(parts[1])) throw new HttpError(404, "not_found", "Degustazione non trovata.");
      const results = await Team.getResults(redis, partner.id, parts[1]);
      if (url.searchParams.get("format") === "csv") {
        noStore(res);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="sorso-' + parts[1] + '.csv"');
        res.status(200).send(Team.resultsCsv(results));
        return;
      }
      sendJson(res, 200, results);
      return;
    }

    if (req.method === "DELETE" && parts.length === 2 && parts[0] === "users") {
      if (!USER_ID.test(parts[1])) throw new HttpError(400, "invalid_user", "Identificativo utente non valido.");
      Quota.assertWritable();
      sendJson(res, 200, await Team.deleteUser(redis, partner.id, parts[1]));
      return;
    }

    const known = (parts.length === 1 && parts[0] === "tastings") || (parts.length === 3 && parts[0] === "tastings" && parts[2] === "results") || (parts.length === 2 && parts[0] === "users");
    if (known) throw new HttpError(405, "method_not_allowed", "Metodo non consentito.");
    throw new HttpError(404, "not_found", "Percorso sconosciuto.");
  } catch (e) {
    sendError(res, e);
  } finally {
    await Quota.flush(raw);
  }
};
