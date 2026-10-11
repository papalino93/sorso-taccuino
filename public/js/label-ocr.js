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

  /* scala di grigi, contrasto allungato (taglia l'1% più scuro e più chiaro); opzionale: testo chiaro su fondo scuro */
  function preprocess(img, invert) {
    var w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    var k = Math.min(MAX_SIDE / Math.max(w0, h0), 3), W = Math.max(1, Math.round(w0 * k)), H = Math.max(1, Math.round(h0 * k));
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(img, 0, 0, W, H);
    var id = ctx.getImageData(0, 0, W, H), d = id.data, n = W * H, g = new Uint8ClampedArray(n), hist = new Uint32Array(256), i, j, v;
    for (i = 0, j = 0; i < n; i++, j += 4) { v = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) | 0; g[i] = v; hist[v]++; }
    var lo = 0, hi = 255, acc = 0;
    for (v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.01) { lo = v; break; } }
    acc = 0;
    for (v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.99) { hi = v; break; } }
    var range = Math.max(1, hi - lo);
    for (i = 0, j = 0; i < n; i++, j += 4) { v = (g[i] - lo) * 255 / range; if (invert) v = 255 - v; d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255; }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  function ensureWorker() {
    if (worker) return Promise.resolve(worker);
    return loadEngine().then(function () {
      return root.Tesseract.createWorker(LANGS.split("+"), 1, { logger: function (m) { if (onProg) onProg(m); } });
    }).then(function (w) { worker = w; return w; });
  }

  function recognize(w, canvas) {
    return w.setParameters({ tessedit_pageseg_mode: "11", preserve_interword_spaces: "1" }).then(function () { return w.recognize(canvas); }).then(function (res) {
      var data = res.data || {};
      return {
        text: (data.text || "").trim(), conf: data.confidence || 0,
        lines: (data.lines || []).map(function (l) { return { text: l.text, h: l.bbox ? l.bbox.y1 - l.bbox.y0 : 0, conf: l.confidence }; })
      };
    });
  }

  /* legge l'immagine; se il testo è poco o incerto prova anche «chiaro su scuro» e tiene la lettura migliore.
     onProgress({status, progress}) con status = chiave del motore (loading…, recognizing text…) */
  function read(img, opts) {
    onProg = opts && opts.onProgress || null;
    return ensureWorker().then(function (w) {
      return recognize(w, preprocess(img, false)).then(function (a) {
        if (a.text.replace(/\s/g, "").length >= 25 && a.conf >= 55) return a;
        return recognize(w, preprocess(img, true)).then(function (b) {
          var score = function (r) { return r.text.replace(/[^A-Za-zÀ-ÿ0-9]/g, "").length * (r.conf / 100); };
          return score(b) > score(a) ? b : a;
        });
      });
    });
  }

  root.LabelOCR = { read: read, preprocess: preprocess };
})(typeof self !== "undefined" ? self : this);
