/* Finto server REST di Upstash Redis, in memoria, per i test.

   Parla lo stesso protocollo del servizio vero: ogni comando arriva come
   array JSON (["HSET","chiave","campo","valore"]) con POST /, le pipeline su
   /pipeline e le transazioni su /multi-exec. Così nei test gira il vero
   client @upstash/redis (serializzazione, opzioni NX/EX, forma delle risposte)
   e non un doppione scritto a mano. Implementa solo i comandi che il codice usa. */
const http = require("http");

function create() {
  const store = new Map();     // chiave -> {type, value, exp}
  const log = [];              // comandi ricevuti, per contare i costi
  const now = () => Date.now();

  function live(key) {
    const e = store.get(key);
    if (!e) return null;
    if (e.exp && e.exp <= now()) { store.delete(key); return null; }
    return e;
  }
  function hash(key, create) {
    let e = live(key);
    if (!e) { if (!create) return null; e = { type: "hash", value: new Map(), exp: 0 }; store.set(key, e); }
    if (e.type !== "hash") throw new Error("WRONGTYPE");
    return e.value;
  }
  function set(key, create) {
    let e = live(key);
    if (!e) { if (!create) return null; e = { type: "set", value: new Set(), exp: 0 }; store.set(key, e); }
    if (e.type !== "set") throw new Error("WRONGTYPE");
    return e.value;
  }

  function exec(cmd) {
    const name = String(cmd[0]).toUpperCase();
    const a = cmd.slice(1).map(String);
    log.push(name);
    switch (name) {
      case "GET": { const e = live(a[0]); return e ? (e.type === "string" ? e.value : (() => { throw new Error("WRONGTYPE"); })()) : null; }
      case "SET": {
        let nx = false, ex = 0;
        for (let i = 2; i < a.length; i++) {
          const o = a[i].toUpperCase();
          if (o === "NX") nx = true;
          else if (o === "EX") ex = Number(a[++i]);
          else if (o === "PX") ex = Number(a[++i]) / 1000;
        }
        if (nx && live(a[0])) return null;
        store.set(a[0], { type: "string", value: a[1], exp: ex ? now() + ex * 1000 : 0 });
        return "OK";
      }
      case "DEL": { let n = 0; a.forEach(k => { if (live(k)) { store.delete(k); n++; } }); return n; }
      case "EXISTS": return a.filter(k => live(k)).length;
      case "INCR": case "INCRBY": {
        const by = name === "INCR" ? 1 : Number(a[1]);
        const e = live(a[0]);
        const v = (e ? Number(e.value) : 0) + by;
        store.set(a[0], { type: "string", value: String(v), exp: e ? e.exp : 0 });
        return v;
      }
      case "EXPIRE": { const e = live(a[0]); if (!e) return 0; e.exp = now() + Number(a[1]) * 1000; return 1; }
      case "TTL": { const e = live(a[0]); if (!e) return -2; return e.exp ? Math.ceil((e.exp - now()) / 1000) : -1; }
      case "HSET": {
        const h = hash(a[0], true); let added = 0;
        for (let i = 1; i < a.length; i += 2) { if (!h.has(a[i])) added++; h.set(a[i], a[i + 1]); }
        return added;
      }
      case "HGET": { const h = hash(a[0]); return h && h.has(a[1]) ? h.get(a[1]) : null; }
      case "HGETALL": { const h = hash(a[0]); const out = []; if (h) h.forEach((v, k) => out.push(k, v)); return out; }
      case "HLEN": { const h = hash(a[0]); return h ? h.size : 0; }
      case "HDEL": { const h = hash(a[0]); let n = 0; if (h) a.slice(1).forEach(f => { if (h.delete(f)) n++; }); return n; }
      case "HINCRBY": { const h = hash(a[0], true); const v = (Number(h.get(a[1])) || 0) + Number(a[2]); h.set(a[1], String(v)); return v; }
      case "SADD": { const s = set(a[0], true); let n = 0; a.slice(1).forEach(m => { if (!s.has(m)) { s.add(m); n++; } }); return n; }
      case "SREM": { const s = set(a[0]); let n = 0; if (s) a.slice(1).forEach(m => { if (s.delete(m)) n++; }); return n; }
      case "SMEMBERS": { const s = set(a[0]); return s ? Array.from(s) : []; }
      case "SCARD": { const s = set(a[0]); return s ? s.size : 0; }
      default: throw new Error("comando non implementato nel finto Upstash: " + name);
    }
  }

  /* Con l'intestazione Upstash-Encoding: base64 (che il client vero manda) il
     servizio codifica in base64 ogni stringa della risposta, tranne "OK". */
  function enc(v) {
    if (typeof v === "string") return v === "OK" ? v : Buffer.from(v, "utf8").toString("base64");
    if (Array.isArray(v)) return v.map(enc);
    return v;
  }

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
      let payload;
      try { payload = JSON.parse(body || "null"); } catch (e) { return send(400, { error: "JSON non valido" }); }
      const b64 = String(req.headers["upstash-encoding"] || "").toLowerCase() === "base64";
      const one = c => { try { const r = exec(c); return { result: b64 ? enc(r) : r }; } catch (e) { return { error: "ERR " + e.message }; } };
      if (req.url === "/pipeline" || req.url === "/multi-exec") return send(200, payload.map(one));
      const r = one(payload);
      return send(r.error ? 400 : 200, r);
    });
  });

  return {
    store, log,
    async start() { await new Promise(r => server.listen(0, "127.0.0.1", r)); return "http://127.0.0.1:" + server.address().port; },
    stop() { return new Promise(r => server.close(r)); },
    reset() { store.clear(); log.length = 0; },
    commandCount() { return log.length; }
  };
}

module.exports = { create };
