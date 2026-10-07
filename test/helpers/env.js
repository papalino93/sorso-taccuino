/* Avvia il finto Upstash e punta il client vero (api/_redis.js) verso di lui. */
const fake = require("./fake-upstash");

async function setup() {
  const srv = fake.create();
  const url = await srv.start();
  process.env.KV_REST_API_URL = url;
  process.env.KV_REST_API_TOKEN = "test-token";
  require("../../api/_redis").reset();
  return srv;
}

/* req/res minimi, come li usano le funzioni Vercel */
function makeReq(o) {
  return Object.assign({ method: "GET", headers: {}, url: "/", body: undefined, query: {} }, o);
}
function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, ended: false };
  res.setHeader = (k, v) => { res.headers[String(k).toLowerCase()] = v; return res; };
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { res.body = o; res.ended = true; return res; };
  res.send = s => { res.body = s; res.ended = true; return res; };
  res.writeHead = (c, h) => { res.statusCode = c; Object.keys(h || {}).forEach(k => res.setHeader(k, h[k])); return res; };
  res.end = s => { if (s !== undefined) res.body = s; res.ended = true; return res; };
  return res;
}
async function call(handler, o) {
  const res = makeRes();
  await handler(makeReq(o), res);
  return res;
}

/* I limiti di richieste contano in finestre di un minuto: un test che conta fino alla
   soglia non deve attraversare il cambio di minuto, o fallirebbe senza che ci sia un
   difetto. Se mancano meno di `serve` secondi alla fine della finestra, si aspetta. */
async function finestraSicura(serve) {
  const sec = (Date.now() / 1000) % 60;
  if (60 - sec < (serve || 8)) await new Promise(r => setTimeout(r, (60 - sec + 0.3) * 1000));
}

module.exports = { setup, makeReq, makeRes, call, finestraSicura };
