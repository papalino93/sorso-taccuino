const { HttpError } = require("./_http");

/* Consumo del piano gratuito di Redis (500.000 comandi al mese).

   Upstash non dice quanti comandi sono stati usati, quindi li contiamo noi: getRedis()
   (in _redis.js) restituisce un client che conta ogni comando, e a fine richiesta
   flush() somma il conteggio a un contatore mensile (usage:AAAA-MM), ogni tanto e
   non a ogni richiesta, per costare poco. Anche i comandi del contatore si contano.

   Soglie: all'80% le risposte portano X-Sorso-Quota: warn; al 90% le scritture
   si fermano (sola lettura). Il conteggio è un'approssimazione per difetto (istanze che
   si spengono con comandi non ancora sommati): il margine del 10% la assorbe. */

const LIMIT = Number(process.env.SORSO_COMMAND_LIMIT) || 500000;
const WARN_AT = 0.8;
const READONLY_AT = 0.9;
const FLUSH_EVERY = 25;      // comandi
const FLUSH_MS = 60 * 1000;  // oppure, al massimo, un minuto

let pending = 0, lastFlush = 0, known = null;

function monthKey(d) { return "usage:" + (d || new Date()).toISOString().slice(0, 7); }

function reset() { pending = 0; lastFlush = 0; known = null; }

function wrapPipeline(p) {
  const proxy = new Proxy(p, {
    get(t, prop) {
      const v = t[prop];
      if (typeof v !== "function" || prop === "exec") return typeof v === "function" ? v.bind(t) : v;
      return (...a) => {
        pending++;
        const r = v.apply(t, a);
        return r === t ? proxy : r;     // concatenando (multi().set().incr()) ogni comando si conta
      };
    }
  });
  return proxy;
}

/* Restituisce il client con il conteggio dei comandi. */
function track(redis) {
  return new Proxy(redis, {
    get(t, prop) {
      const v = t[prop];
      if (typeof v !== "function") return v;
      if (prop === "pipeline" || prop === "multi") return (...a) => wrapPipeline(v.apply(t, a));
      return (...a) => { pending++; return v.apply(t, a); };
    }
  });
}

/* All'avvio di un'istanza si legge il contatore, una volta. */
async function ensure(redis) {
  if (known !== null) return;
  try { known = Number(await redis.get(monthKey())) || 0; } catch (e) { known = 0; }
}

async function flush(redis, force) {
  const now = Date.now();
  if (!pending || (!force && pending < FLUSH_EVERY && now - lastFlush < FLUSH_MS)) return;
  const n = pending;
  pending = 0; lastFlush = now;
  try {
    const total = await redis.incrby(monthKey(), n);
    if (total === n) await redis.expire(monthKey(), 40 * 24 * 3600);
    known = total;
  } catch (e) { /* il conteggio è un'approssimazione: non fa fallire la richiesta */ }
}

function level() {
  const used = known || 0;
  if (used >= LIMIT * READONLY_AT) return "readonly";
  if (used >= LIMIT * WARN_AT) return "warn";
  return "ok";
}

function used() { return (known || 0) + pending; }

function assertWritable() {
  if (level() === "readonly") {
    throw new HttpError(503, "read_only", "Il servizio è in sola lettura: limite mensile gratuito quasi raggiunto.");
  }
}

/* Avvolge una funzione Vercel: conta e somma i comandi anche per gli endpoint che non
   lo fanno da soli (login con Google, archivio personale). */
function wrap(handler) {
  return async (req, res) => {
    try { return await handler(req, res); }
    finally {
      try { const { getRedis } = require("./_redis"); await flush(getRedis()); } catch (e) { /* senza database non c'è nulla da sommare */ }
    }
  };
}

module.exports = { LIMIT, WARN_AT, READONLY_AT, monthKey, reset, track, ensure, flush, level, used, assertWritable, wrap };
