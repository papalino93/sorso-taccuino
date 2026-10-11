/* Lettura dell'etichetta da foto: OCR (Tesseract.js) che gira tutto nel browser, la foto non esce dal dispositivo.
   Il motore e i dati della lingua si scaricano la prima volta (da jsDelivr) e restano nella cache del browser.
   Poi i campi si ricavano con LabelReader (public/js/label-reader.js). */
(function (root) {
  var TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  var LANGS = "ita+eng", MAX_SIDE = 2000;
  var loading = null, worker = null, onProg = null;

  function loadEngine() {
    if (root.Tesseract) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = TESS_URL; s.async = true;
      s.onload = function () { root.Tesseract ? resolve() : reject(new Error("engine")); };
      s.onerror = function () { loading = null; reject(new Error("offline")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  /* ---- dove sta l'etichetta nella foto ----
     L'etichetta è carta: chiara e poco colorata, di solito al centro. Su una copia piccola si segna ogni punto «carta»,
     si chiudono i buchi lasciati dalle scritte, si prende la zona più grande e più centrale e se ne usa il riquadro.
     Senza etichetta riconoscibile si usa la parte centrale della foto. */
  function findLabel(img) {
    var w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    var s = 200 / Math.max(w0, h0), W = Math.max(8, Math.round(w0 * s)), H = Math.max(8, Math.round(h0 * s));
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(img, 0, 0, W, H);
    var d = ctx.getImageData(0, 0, W, H).data, n = W * H, m = new Uint8Array(n), i, j;
    for (i = 0, j = 0; i < n; i++, j += 4) {
      var r = d[j], g = d[j + 1], b = d[j + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      m[i] = mx > 145 && (mx - mn) / mx < 0.22 ? 1 : 0;   // soglie misurate su foto vere
    }
    var lab = new Int32Array(n), best = null, id = 0, stack = [];
    for (i = 0; i < n; i++) {
      if (!m[i] || lab[i]) continue;
      id++; var minx = W, miny = H, maxx = 0, maxy = 0, area = 0; stack.push(i); lab[i] = id;
      while (stack.length) {
        var p = stack.pop(), px = p % W, py = (p - px) / W; area++;
        if (px < minx) minx = px; if (px > maxx) maxx = px; if (py < miny) miny = py; if (py > maxy) maxy = py;
        var nb = [p - 1, p + 1, p - W, p + W];
        for (var k = 0; k < 4; k++) { var q = nb[k]; if (q < 0 || q >= n || lab[q] || !m[q]) continue; if ((k === 0 && px === 0) || (k === 1 && px === W - 1)) continue; lab[q] = id; stack.push(q); }
      }
      var cx = (minx + maxx) / 2 / W - 0.5, cy = (miny + maxy) / 2 / H - 0.5, fill = area / ((maxx - minx + 1) * (maxy - miny + 1));
      /* muri e piastrelle toccano il bordo della foto, le etichette quasi mai */
      var edges = (minx === 0) + (miny === 0) + (maxx === W - 1) + (maxy === H - 1);
      var score = area * (1 - Math.min(0.9, Math.sqrt(cx * cx + cy * cy) * 1.4)) * (0.4 + fill) * Math.pow(0.5, edges);
      if (area > n * 0.03 && (!best || score > best.score)) best = { score: score, minx: minx, miny: miny, maxx: maxx, maxy: maxy };
    }
    if (!best) return { x: Math.round(w0 * 0.1), y: Math.round(h0 * 0.12), w: Math.round(w0 * 0.8), h: Math.round(h0 * 0.76), found: false };
    var px0 = Math.max(0, best.minx - 3) / s, py0 = Math.max(0, best.miny - 3) / s, px1 = Math.min(W, best.maxx + 4) / s, py1 = Math.min(H, best.maxy + 4) / s;
    return { x: Math.round(px0), y: Math.round(py0), w: Math.round(px1 - px0), h: Math.round(py1 - py0), found: true };
  }

  /* una variante dell'immagine da leggere: canale (luminosità, verde = senza il rosso delle scritte), scala, contrasto */
  function prepare(img, crop, opt) {
    var k = opt.scale === "small" ? Math.min(1, MAX_SIDE / Math.max(crop.w, crop.h)) : Math.min(MAX_SIDE / Math.max(crop.w, crop.h), 2.2);
    var W = Math.max(1, Math.round(crop.w * k)), H = Math.max(1, Math.round(crop.h * k));
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);
    var id = ctx.getImageData(0, 0, W, H), d = id.data, n = W * H, g = new Float32Array(n), hist = new Uint32Array(256), i, j, v;
    for (i = 0, j = 0; i < n; i++, j += 4) { v = opt.ch === "g" ? d[j + 1] : 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]; g[i] = v; hist[v | 0]++; }
    var lo = 0, hi = 255, acc = 0;
    for (v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.01) { lo = v; break; } }
    acc = 0;
    for (v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.99) { hi = v; break; } }
    var range = Math.max(1, hi - lo);
    for (i = 0, j = 0; i < n; i++, j += 4) { v = (g[i] - lo) * 255 / range; if (opt.invert) v = 255 - v; d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255; }
    ctx.putImageData(id, 0, 0);
    return { canvas: c, k: k };
  }
  /* compatibilità: la vecchia pre-elaborazione su tutta l'immagine */
  function preprocess(img, invert) { var w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height; return prepare(img, { x: 0, y: 0, w: w0, h: h0 }, { ch: "lum", invert: invert }).canvas; }

  function ensureWorker() {
    if (worker) return Promise.resolve(worker);
    return loadEngine().then(function () {
      return root.Tesseract.createWorker(LANGS.split("+"), 1, { logger: function (m) { if (onProg && m.status !== "recognizing text") onProg(m); } });
    }).then(function (w) { worker = w; return w; });
  }

  function recognize(w, prep, psm) {
    return w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: "1" }).then(function () { return w.recognize(prep.canvas); }).then(function (res) {
      var data = res.data || {};
      return {
        text: (data.text || "").trim(), conf: data.confidence || 0,
        lines: (data.lines || []).map(function (l) { return { text: (l.text || "").replace(/\s+/g, " ").trim(), h: l.bbox ? (l.bbox.y1 - l.bbox.y0) / prep.k : 0, y: l.bbox ? l.bbox.y0 / prep.k : 0, conf: l.confidence }; })
      };
    });
  }

  /* più letture della stessa etichetta: le righe si uniscono (una riga letta più volte resta una, quella più sicura) */
  var norm = function (t) { return String(t).toLowerCase().replace(/[^a-z0-9àèéìòù]/g, ""); };
  function lev(a, b) { var m = a.length, n2 = b.length, p = [], c, i, j; for (j = 0; j <= n2; j++) p[j] = j; for (i = 1; i <= m; i++) { c = [i]; for (j = 1; j <= n2; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n2]; }
  function merge(results) {
    var out = [];
    results.forEach(function (r) {
      r.lines.forEach(function (l) {
        var k = norm(l.text); if (k.length < 2) return;
        var same = null;
        for (var i = 0; i < out.length; i++) { var o = out[i], ko = norm(o.text); if (Math.abs(o.y - l.y) < Math.max(o.h, l.h) * 0.8 && (ko.indexOf(k) >= 0 || k.indexOf(ko) >= 0 || lev(ko, k) <= Math.max(1, Math.floor(Math.max(ko.length, k.length) * 0.3)))) { same = i; break; } }
        if (same == null) { l.hits = 1; out.push(l); return; }
        var hits = (out[same].hits || 1) + 1, o2 = out[same], ko2 = norm(o2.text);
        /* una lettura che contiene l'altra («MARTE» e «ART») vince se non è molto meno sicura; altrimenti vince la più sicura */
        var longer = k.length > ko2.length && (k.indexOf(ko2) >= 0 || lev(k, ko2) <= 2);
        if (longer ? (l.conf || 0) >= (o2.conf || 0) - 40 : (l.conf || 0) > (o2.conf || 0) + 3) out[same] = l;
        out[same].hits = hits;
      });
    });
    out.sort(function (a, b) { return a.y - b.y; });
    return out;
  }

  /* Legge l'immagine: trova l'etichetta, la legge in più modi (luminosità e canale verde, testo sparso e a blocchi)
     e unisce le righe. onProgress({status, progress}): il motore, poi «recognizing text» con l'avanzamento delle letture. */
  var PASSES = [{ ch: "lum", psm: "11" }, { ch: "g", psm: "11", scale: "small" }, { ch: "lum", psm: "3" }, { ch: "g", psm: "3", scale: "small" }];   // scelte misurando foto vere
  function read(img, opts) {
    onProg = opts && opts.onProgress || null;
    var crop = findLabel(img), results = [];
    return ensureWorker().then(function (w) {
      var step = function (i) {
        if (i >= PASSES.length) return null;
        if (onProg) onProg({ status: "recognizing text", progress: i / PASSES.length });
        return recognize(w, prepare(img, crop, PASSES[i]), PASSES[i].psm).then(function (r) { results.push(r); return step(i + 1); });
      };
      return step(0);
    }).then(function () {
      /* se l'etichetta non era riconoscibile e le letture sono povere, un'ultima prova chiaro su scuro */
      var poor = results.every(function (r) { return r.text.replace(/[^A-Za-zÀ-ÿ]/g, "").length < 12; });
      if (!poor) return null;
      return ensureWorker().then(function (w) { return recognize(w, prepare(img, crop, { ch: "lum", invert: true }), "11").then(function (r) { results.push(r); }); });
    }).then(function () {
      if (onProg) onProg({ status: "recognizing text", progress: 1 });
      var lines = merge(results);
      return { text: lines.map(function (l) { return l.text; }).join("\n"), lines: lines, conf: Math.max.apply(null, results.map(function (r) { return r.conf; }).concat([0])), crop: crop };
    });
  }

  root.LabelOCR = { read: read, preprocess: preprocess, findLabel: findLabel };
})(typeof self !== "undefined" ? self : this);
