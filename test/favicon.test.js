const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const pub = f => path.join(__dirname, "../public", f);
test("favicon: i file collegati dalla pagina esistono e il manifest è valido", () => {
  const html = fs.readFileSync(pub("index.html"), "utf8");
  for (const f of ["favicon.svg", "favicon-32.png", "apple-touch-icon.png", "manifest.webmanifest"]) {
    assert.ok(html.includes('"/' + f + '"'), f + " collegato");
    assert.ok(fs.existsSync(pub(f)), f + " presente");
  }
  const m = JSON.parse(fs.readFileSync(pub("manifest.webmanifest"), "utf8"));
  assert.ok(m.icons.length >= 3);
  m.icons.forEach(i => assert.ok(fs.existsSync(pub(i.src.replace(/^\//, ""))), i.src));
  assert.ok(m.icons.some(i => i.purpose === "maskable"));
});
test("favicon: i PNG hanno le dimensioni dichiarate", () => {
  const dim = f => { const b = fs.readFileSync(pub(f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepEqual(dim("favicon-32.png"), [32, 32]);
  assert.deepEqual(dim("apple-touch-icon.png"), [180, 180]);
  assert.deepEqual(dim("icon-192.png"), [192, 192]);
  assert.deepEqual(dim("icon-512.png"), [512, 512]);
  assert.deepEqual(dim("icon-maskable-512.png"), [512, 512]);
});
