const test = require("node:test");
const assert = require("node:assert");
const { validateEnvelope, WIDGET_TYPES } = require("../common/envelope.js");

test("accepts a valid envelope", () => {
  const r = validateEnvelope({
    css: "body { color: lime; }",
    widgets: [{ type: "marquee", target: "h1" }, { type: "hit_counter" }],
    notes: "dark site"
  });
  assert.deepEqual(r, { ok: true, errors: [] });
});

test("widget catalog is the closed five", () => {
  assert.deepEqual([...WIDGET_TYPES].sort(), ["badge", "hit_counter", "marquee", "sparkle_cursor", "tiled_background"]);
});

test("rejects missing/empty css", () => {
  assert.equal(validateEnvelope({ widgets: [] }).ok, false);
  assert.equal(validateEnvelope({ css: "", widgets: [] }).ok, false);
});

test("rejects unknown widget types and non-string targets", () => {
  const r = validateEnvelope({ css: "b{}", widgets: [{ type: "blink_tag" }, { type: "marquee", target: 7 }] });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 2);
});

test("rejects non-object and non-array widgets", () => {
  assert.equal(validateEnvelope(null).ok, false);
  assert.equal(validateEnvelope({ css: "b{}", widgets: "nope" }).ok, false);
});
