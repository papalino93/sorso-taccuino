const test = require("node:test");
const assert = require("node:assert/strict");
const Theme = require("../public/js/theme.js");
const hex = h => Theme.hex2rgb(h);
const C = (a, b) => Theme.contrast(hex(a), hex(b));
function rnd(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const color = r => "#" + [0, 0, 0].map(() => Math.floor(r() * 256).toString(16).padStart(2, "0")).join("");

test("nessuna scelta: tavolozza predefinita a vino, leggibile in entrambi i temi", () => {
  const l = Theme.derive({ dark: false }), d = Theme.derive({ dark: true });
  assert.equal(l.vars["--accent"], "#8c1d3f"); assert.equal(l.vars["--panel"], "#fbf4e6");
  assert.equal(d.vars["--accent"], "#c8385c"); assert.equal(d.vars["--panel"], "#0f080b");
  for (const x of [l, d]) {
    assert.equal(x.adjusted, false, "i predefiniti non vanno corretti");
    assert.ok(C(x.vars["--sel-fg"], x.vars["--sel-bg"]) >= 4.5, "testo sul pulsante pieno");
    assert.ok(C(x.vars["--accent-text"], x.vars["--card"]) >= 4.5, "testo colorato");
    assert.ok(C(x.vars["--accent"], x.vars["--panel"]) >= 3.2, "riempimento sullo sfondo");
  }
  assert.deepEqual(Theme.derive({ dark: false, accent: "rosso", bg: "x" }).vars, l.vars, "valori non validi ignorati");
  assert.deepEqual(Theme.derive({ dark: true, accent: Theme.DEFAULT_ACCENT, bg: "#0f080b" }).vars, d.vars);
});
test("i colori predefiniti scritti in index.html sono quelli di theme.js", () => {
  const r = require("node:child_process").spawnSync(process.execPath, [require("node:path").join(__dirname, "..", "scripts", "theme-css.js"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
test("qualunque accento e sfondo: testo, riempimenti, bordi e testo sul pulsante restano leggibili", () => {
  const r = rnd(7);
  for (let i = 0; i < 3000; i++) {
    const dark = i % 2 === 1, accent = color(r), bg = color(r);
    const d = Theme.derive({ accent, bg, dark });
    assert.ok(d, "tavolozza " + accent + " " + bg);
    const v = d.vars;
    const tag = (dark ? "scuro " : "chiaro ") + accent + " su " + bg;
    assert.ok(C(v["--ink"], v["--panel"]) >= 9, "testo su sfondo " + tag);
    assert.ok(C(v["--ink"], v["--card"]) >= 8, "testo su scheda " + tag);
    for (const k of ["--ink-3", "--ink-4"]) assert.ok(C(v[k], v["--card-alt"]) >= 4.5, k + " " + tag);
    assert.ok(C(v["--accent-text"], v["--card"]) >= 4.5 && C(v["--accent-text"], v["--panel"]) >= 4.5, "testo colorato " + tag);
    assert.ok(C(v["--accent"], v["--panel"]) >= 3 && C(v["--accent"], v["--card"]) >= 3, "riempimento " + tag);
    assert.ok(C(v["--sel-fg"], v["--sel-bg"]) >= 4.5, "testo sul pulsante pieno " + tag);
    assert.ok(C(v["--line-strong"], v["--panel"]) >= 3 && C(v["--line-strong"], v["--card-alt"]) >= 3, "bordi dei campi " + tag);
  }
});
test("i predefiniti proposti restano leggibili in entrambi i temi", () => {
  for (const dark of [false, true]) for (const a of Theme.ACCENTS) for (const b of (dark ? Theme.BG_DARK : Theme.BG_LIGHT)) {
    const d = Theme.derive({ accent: a.hex, bg: b.hex, dark });
    if (!d) continue;
    assert.ok(C(d.vars["--sel-fg"], d.vars["--sel-bg"]) >= 4.5, a.id + "/" + b.id);
    assert.ok(C(d.vars["--accent-text"], d.vars["--card"]) >= 4.5, a.id + "/" + b.id);
  }
});
test("uno sfondo che non è del tema scelto viene corretto, e lo dice", () => {
  const d = Theme.derive({ accent: "#0f7a4d", bg: "#101010", dark: false });
  assert.equal(d.adjusted, true);
  assert.ok(Theme.contrast(Theme.hex2rgb(d.vars["--ink"]), Theme.hex2rgb(d.vars["--panel"])) >= 9);
});
test("un giallo su bianco viene scurito e segnalato; un viola già adatto no", () => {
  assert.equal(Theme.derive({ accent: "#ffeb3b", bg: "#ffffff", dark: false }).adjusted, true);
  assert.equal(Theme.derive({ accent: "#0f7a4d", bg: "#fafaf7", dark: false }).adjusted, false);
});
test("sanitize tiene solo valori validi", () => {
  assert.deepEqual(Theme.sanitize({ accent: "#ABCDEF", bgLight: "red", bgDark: "#112233", x: 1 }), { accent: "#abcdef", bgDark: "#112233" });
  assert.deepEqual(Theme.sanitize(null), {});
});
