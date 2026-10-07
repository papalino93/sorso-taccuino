/* Piccolo server locale che imita Vercel per provare lo spazio di team nel browser:
   file statici da public/, le funzioni di api/ con req/res alla Vercel, le
   riscritture di vercel.json, e un finto Upstash al posto di Redis.

   Uso nei test:  const dev = await start({ partner: {...} })  →  dev.url, dev.stop()
   Uso a mano:    node test/helpers/dev-server.js   (porta 8770, partner "demo") */
const http = require("http");
const fs = require("fs");
const path = require("path");
const fake = require("./fake-upstash");

const PUBLIC = path.join(__dirname, "../../public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".txt": "text/plain", ".xml": "application/xml" };

function vercelRes(res) {
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); return res; };
  res.send = s => { if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.end(s); return res; };
  return res;
}

async function start(opts) {
  opts = opts || {};
  const upstash = fake.create();
  const upstashUrl = await upstash.start();
  process.env.KV_REST_API_URL = upstashUrl;
  process.env.KV_REST_API_TOKEN = "dev";
  require("../../api/_redis").reset();
  const { getRedis } = require("../../api/_redis");
  const P = require("../../api/_partner");
  const quota = require("../../api/_quota");
  quota.reset();
  const handlers = {
    "/api/embed": require("../../api/embed"),
    "/api/embed-page": require("../../api/embed-page"),
    "/api/v1": require("../../api/v1")
  };
  const secret = opts.secret || "d".repeat(64);
  const apiKey = P.newApiKey("demo");
  await getRedis().sadd("partners", "demo");
  await getRedis().set("p:demo", JSON.stringify(Object.assign({
    id: "demo", name: "Club Demo", active: true, secret, apiKeyHash: P.sha256(apiKey),
    origins: opts.origins || [], allowLocalhost: true, modes: ["smart", "full"], defaultMode: "smart", lang: "it", theme: {}
  }, opts.partner)));
  P.clearCache();

  const server = http.createServer((req, res) => {
    vercelRes(res);
    const u = new URL(req.url, "http://x");
    let chunks = "";
    req.on("data", c => { chunks += c; });
    req.on("end", async () => {
      try {
        let route = u.pathname, search = u.search;
        const m = /^\/api\/v1(?:\/(.*))?$/.exec(route);
        if (m) { route = "/api/v1"; search = "?path=" + encodeURIComponent(m[1] || "") + (u.search ? "&" + u.search.slice(1) : ""); }
        if (route === "/embed") route = "/api/embed-page";
        if (handlers[route]) {
          req.url = route + search;
          req.query = Object.fromEntries(new URL(req.url, "http://x").searchParams);
          const ct = String(req.headers["content-type"] || "");
          req.body = chunks && ct.includes("json") ? JSON.parse(chunks) : chunks || undefined;
          await handlers[route](req, res);
          return;
        }
        const file = path.join(PUBLIC, route === "/" ? "index.html" : route);
        if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end("non trovato"); return; }
        res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
        res.end(fs.readFileSync(file));
      } catch (e) { console.error(e); res.statusCode = 500; res.end("errore"); }
    });
  });
  await new Promise(r => server.listen(opts.port || 0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + server.address().port;
  return {
    url, secret, apiKey, upstash,
    async stop() { await new Promise(r => server.close(r)); await upstash.stop(); }
  };
}

module.exports = { start };

if (require.main === module) {
  start({ port: 8770, origins: ["http://127.0.0.1:8771"] }).then(d => console.log("Spazio di team su " + d.url + "  (partner demo, origine consentita http://127.0.0.1:8771)"));
}
