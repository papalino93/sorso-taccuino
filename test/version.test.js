const test = require("node:test");
const assert = require("node:assert/strict");
const V = require("../public/js/version.js");
const pkg = require("../package.json");
test("la versione del sito coincide con package.json e ha una data valida", () => {
  assert.equal(V.version, pkg.version);
  assert.match(V.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!isNaN(new Date(V.date + "T12:00:00")));
});
test("README e roadmap citano la versione corrente", () => {
  const fs = require("node:fs"), path = require("node:path");
  assert.ok(fs.readFileSync(path.join(__dirname, "../README.md"), "utf8").includes(V.version), "README");
  assert.ok(fs.readFileSync(path.join(__dirname, "../CHANGELOG.md"), "utf8").includes("## " + V.version), "CHANGELOG");
});
