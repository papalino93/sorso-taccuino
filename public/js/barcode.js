/* Codice a barre (EAN/UPC) da una foto, nel browser: la foto non esce dal dispositivo.
   Dove c'è BarcodeDetector (Chrome, Android) lo si usa; altrove (iPhone, Firefox) si carica ZXing alla prima volta. */
(function (root) {
  var ZX_URL = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
  var FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
  var zxLoading = null;

  function loadZX() {
    if (root.ZXing) return Promise.resolve(root.ZXing);
    if (zxLoading) return zxLoading;
    zxLoading = new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = ZX_URL; s.async = true; s.crossOrigin = "anonymous";
      s.onload = function () { root.ZXing ? res(root.ZXing) : rej(new Error("zxing")); };
      s.onerror = function () { zxLoading = null; rej(new Error("offline")); };
      document.head.appendChild(s);
    });
    return zxLoading;
  }

  /* la foto ridotta (i telefoni scattano a 12 megapixel: troppo per leggere in fretta), anche ruotata di 90° */
  function canvasOf(img, max, rotate) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var k = Math.min(1, max / Math.max(w, h));
    var cw = Math.round(w * k), ch = Math.round(h * k);
    var c = document.createElement("canvas");
    c.width = rotate ? ch : cw; c.height = rotate ? cw : ch;
    var x = c.getContext("2d", { willReadFrequently: true });
    if (rotate) { x.translate(ch, 0); x.rotate(Math.PI / 2); }
    x.drawImage(img, 0, 0, cw, ch);
    return c;
  }

  async function withDetector(img) {
    if (!("BarcodeDetector" in root)) return null;
    try {
      var ok = root.BarcodeDetector.getSupportedFormats ? await root.BarcodeDetector.getSupportedFormats() : FORMATS;
      var f = FORMATS.filter(function (x) { return ok.indexOf(x) > -1; });
      if (!f.length) return null;
      var d = new root.BarcodeDetector({ formats: f });
      var r = await d.detect(img);
      return r && r.length ? String(r[0].rawValue || "") : "";
    } catch (e) { return null; }
  }

  async function withZX(img) {
    var ZX = await loadZX();
    var hints = new Map();
    hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E]);
    hints.set(ZX.DecodeHintType.TRY_HARDER, true);
    var reader = new ZX.MultiFormatReader(); reader.setHints(hints);
    var tries = [[1600, false], [1600, true], [900, false], [900, true]];
    for (var i = 0; i < tries.length; i++) {
      var c = canvasOf(img, tries[i][0], tries[i][1]);
      var data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      var lum = new Uint8ClampedArray(c.width * c.height);
      for (var p = 0, j = 0; p < lum.length; p++, j += 4) lum[p] = (data[j] * 299 + data[j + 1] * 587 + data[j + 2] * 114) / 1000;
      try {
        var src = new ZX.RGBLuminanceSource(lum, c.width, c.height);
        var res = reader.decode(new ZX.BinaryBitmap(new ZX.HybridBinarizer(src)));
        if (res && res.getText()) return res.getText();
      } catch (e) { /* nessun codice in questo tentativo */ }
    }
    return "";
  }

  /* restituisce le cifre del codice, oppure "" se nella foto non se ne trova uno */
  async function read(img) {
    var r = await withDetector(img);
    if (r) return r.replace(/\D/g, "");
    var z = await withZX(img);
    return String(z || "").replace(/\D/g, "");
  }

  /* cifra di controllo (EAN-8, UPC-A, EAN-13, GTIN-14) */
  function valid(code) {
    var s = String(code || "").replace(/\D/g, "");
    if ([8, 12, 13, 14].indexOf(s.length) < 0) return false;
    var d = s.split("").map(Number), check = d.pop(), sum = 0;
    d.reverse().forEach(function (x, i) { sum += x * (i % 2 === 0 ? 3 : 1); });
    return (10 - (sum % 10)) % 10 === check;
  }

  root.Barcode = { read: read, valid: valid };
})(typeof self !== "undefined" ? self : this);
