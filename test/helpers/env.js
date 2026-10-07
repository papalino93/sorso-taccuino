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

module.exports = { setup, makeReq, makeRes, call };
