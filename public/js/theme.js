/* Colori scelti dall'utente per l'app personale.
   L'utente sceglie un colore d'accento e un tono di sfondo; da questi due colori (e dal tema
   chiaro o scuro) si ricava tutta la tavolozza, con il contrasto garantito: qualunque cosa si
   scelga, il testo resta leggibile, i bordi dei campi si vedono e il testo sul pulsante pieno
   si legge. Se un colore non basta, lo si schiarisce o scurisce quanto serve e lo si dice.
   Modulo senza dipendenze: funziona nel browser (window.Theme) e in Node (require) per i test. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Theme = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var HEX_RE = /^#[0-9a-fA-F]{6}$/;
  var NERO = [0, 0, 0], BIANCO = [255, 255, 255];

  /* ---- predefiniti ---- */
  var ACCENTS = [
    { id: "uva", hex: "#5b2eff" },
    { id: "vinaccia", hex: "#8c1d3f" },
    { id: "bosco", hex: "#0f7a4d" },
    { id: "oceano", hex: "#0a6bcb" },
    { id: "ambra", hex: "#b45309" },
    { id: "corallo", hex: "#d2402f" },
    { id: "grafite", hex: "#2b2b33" }
  ];
  var BG_LIGHT = [
    { id: "carta", hex: "#fafaf7" }, { id: "bianco", hex: "#ffffff" }, { id: "crema", hex: "#fbf4e6" },
    { id: "salvia", hex: "#f2f6f1" }, { id: "nebbia", hex: "#f1f4f9" }
  ];
  var BG_DARK = [
    { id: "nero", hex: "#08080b" }, { id: "grafite", hex: "#17181c" }, { id: "notte", hex: "#0b1020" },
    { id: "bosco", hex: "#0e1512" }, { id: "cantina", hex: "#1a0e12" }
  ];
  var DEFAULT_ACCENT = "#5b2eff";
  /* l'accento predefinito, sul fondo scuro, è un viola più chiaro scelto a mano (design B) */
  var DEFAULT_ACCENT_DARK = "#a58bff";

  /* ---- colori ---- */
  function hex2rgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }
  function rgb2hex(c) { return "#" + c.map(function (v) { return Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0"); }).join(""); }
  function lin(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function lum(c) { return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  /* t = quanto verso b; interi, come nell'esadecimale finale */
  function mix(a, b, t) { return a.map(function (v, i) { return Math.round(v * (1 - t) + b[i] * t); }); }
  function polo(c) { return contrast(BIANCO, c) >= contrast(NERO, c) ? BIANCO : NERO; }
  function same(a, b) { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }

  /* Avvicina c a `verso` finché il contrasto con `su` raggiunge `minimo`. */
  function garantisci(c, su, verso, minimo) {
    if (contrast(c, su) >= minimo) return c;
    for (var t = 0.04; t <= 1.0001; t += 0.04) {
      var m = mix(c, verso, t);
      if (contrast(m, su) >= minimo) return m;
    }
    return verso;
  }

  function valid(h) { return typeof h === "string" && HEX_RE.test(h); }

  /* Tavolozza completa. Opzioni: accent e bg (#rrggbb, facoltativi), dark (booleano).
     Restituisce { vars, adjusted } oppure null se non c'è nessuna scelta (restano i predefiniti). */
  function derive(opt) {
    opt = opt || {};
    var dark = !!opt.dark;
    var accentChosen = valid(opt.accent) && opt.accent.toLowerCase() !== DEFAULT_ACCENT;
    var bgChosen = valid(opt.bg) && opt.bg.toLowerCase() !== (dark ? BG_DARK[0].hex : BG_LIGHT[0].hex);
    if (!accentChosen && !bgChosen) return null;

    var adjusted = false;
    var bg = hex2rgb(valid(opt.bg) ? opt.bg : (dark ? BG_DARK[0].hex : BG_LIGHT[0].hex));
    /* il tema (chiaro o scuro) lo decide l'utente col suo interruttore: uno sfondo che non ci sta si corregge */
    var ink = dark ? hex2rgb("#f6f6f3") : hex2rgb("#0b0b10");
    if (dark && contrast(ink, bg) < 10) { bg = garantisci(bg, ink, NERO, 10); adjusted = true; }
    if (!dark && contrast(ink, bg) < 12) { bg = garantisci(bg, ink, BIANCO, 12); adjusted = true; }
    if (contrast(ink, bg) < 9) { ink = polo(bg); }

    var card = mix(bg, ink, dark ? 0.07 : 0.05);
    var cardAlt = mix(bg, ink, dark ? 0.12 : 0.09);
    var field = dark ? cardAlt : mix(bg, BIANCO, 0.7);
    var line = mix(bg, ink, 0.14);
    var lineSoft = mix(bg, ink, 0.1);
    var lineStrong = garantisci(mix(bg, ink, 0.5), bg, ink, 3.1);       // bordi dei campi (WCAG 1.4.11)
    lineStrong = garantisci(lineStrong, cardAlt, ink, 3.0);

    var acc = hex2rgb(accentChosen ? opt.accent : (dark ? DEFAULT_ACCENT_DARK : DEFAULT_ACCENT));
    /* riempimenti (pulsanti, barre): si vedono sullo sfondo e sulle schede */
    var fill = garantisci(acc, bg, ink, 3.2);
    fill = garantisci(fill, card, ink, 3.1);
    if (!same(fill, acc)) adjusted = true;
    var onFill = polo(fill);
    /* testo colorato: leggibile sulle schede e sullo sfondo */
    var text = garantisci(fill, card, ink, 4.6);
    text = garantisci(text, bg, ink, 4.6);
    text = garantisci(text, cardAlt, ink, 4.6);

    var ink2 = garantisci(mix(ink, bg, 0.12), cardAlt, ink, 9);
    var ink3 = garantisci(mix(ink, bg, 0.3), cardAlt, ink, 5.2);
    var ink4 = garantisci(mix(ink, bg, 0.4), cardAlt, ink, 4.7);
    var shell = dark ? mix(bg, NERO, 0.6) : mix(bg, ink, 0.06);
    var bar = rgb2hex(bg);
    var glow = fill.join(",");

    var v = {
      "--shell": rgb2hex(shell), "--panel": rgb2hex(bg), "--card": rgb2hex(card), "--card-alt": rgb2hex(cardAlt), "--field": rgb2hex(field),
      "--line": rgb2hex(line), "--line-soft": rgb2hex(lineSoft), "--line-strong": rgb2hex(lineStrong),
      "--ink": rgb2hex(ink), "--ink-2": rgb2hex(ink2), "--ink-3": rgb2hex(ink3), "--ink-4": rgb2hex(ink4),
      "--sel-bg": rgb2hex(fill), "--sel-fg": rgb2hex(onFill), "--accent": rgb2hex(fill), "--accent-text": rgb2hex(text),
      "--gold": rgb2hex(text), "--head-gold": rgb2hex(fill),
      "--head-bg": rgb2hex(bg), "--head-fg": rgb2hex(ink), "--head-dim": rgb2hex(ink3),
      "--head-line": "rgba(" + ink.join(",") + ",.16)",
      "--bar": "rgba(" + bg.join(",") + ",.94)", "--chip": rgb2hex(cardAlt),
      "--desk-wine": "rgba(" + glow + (dark ? ",.10)" : ",.07)"), "--desk-gold": "rgba(" + glow + (dark ? ",.06)" : ",.05)"),
      "--desk-edge": "rgba(" + ink.join(",") + ",.08)",
      "--ph-v": rgb2hex(mix(fill, bg, 0.65)), "--ph-o": rgb2hex(mix(fill, bg, 0.4)), "--ph-g": rgb2hex(mix(fill, bg, 0.18)), "--ph-f": rgb2hex(fill)
    };
    return { vars: v, adjusted: adjusted, fill: rgb2hex(fill), effectiveBg: rgb2hex(bg) };
  }

  /* Le scelte salvate: solo valori validi, altrimenti niente. */
  function sanitize(o) {
    var out = {};
    if (!o || typeof o !== "object") return out;
    if (valid(o.accent)) out.accent = o.accent.toLowerCase();
    if (valid(o.bgLight)) out.bgLight = o.bgLight.toLowerCase();
    if (valid(o.bgDark)) out.bgDark = o.bgDark.toLowerCase();
    return out;
  }

  return {
    ACCENTS: ACCENTS, BG_LIGHT: BG_LIGHT, BG_DARK: BG_DARK, DEFAULT_ACCENT: DEFAULT_ACCENT,
    derive: derive, sanitize: sanitize, valid: valid, contrast: contrast, hex2rgb: hex2rgb
  };
});
