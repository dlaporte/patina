const test = require("node:test");
const assert = require("node:assert");
const { PRESETS, getAesthetic } = require("../common/presets.js");
const { sanitizeCss } = require("../common/sanitizer.js");

test("ships exactly the five presets with unique ids", () => {
  const ids = PRESETS.map((p) => p.id);
  assert.deepEqual(ids.sort(), ["8bit", "enterprise", "psychedelic", "superhighway", "terminal"]);
  assert.equal(new Set(ids).size, 5);
});

test("every preset has name, spec, and baseCss strings", () => {
  for (const p of PRESETS) {
    assert.equal(typeof p.name, "string");
    assert.ok(p.spec.length > 100, `${p.id} spec too thin`);
    assert.equal(typeof p.baseCss, "string");
  }
});

test("every baseCss passes the sanitizer unmodified", () => {
  for (const p of PRESETS) {
    if (!p.baseCss) continue;
    const r = sanitizeCss(p.baseCss);
    assert.equal(r.ok, true, p.id);
    assert.deepEqual(r.removed, [], `${p.id} baseCss tripped the sanitizer`);
  }
});

test("getAesthetic resolves presets and custom aesthetics", () => {
  assert.equal(getAesthetic("terminal", { customAesthetics: [] }).name, "Terminal");
  const custom = getAesthetic("custom-cottagecore", {
    customAesthetics: [{ id: "custom-cottagecore", name: "Cottagecore", spec: "soft florals" }]
  });
  assert.equal(custom.name, "Cottagecore");
  assert.equal(custom.baseCss, "");
  assert.equal(getAesthetic("nope", { customAesthetics: [] }), null);
});
