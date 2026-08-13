const test = require("node:test");
const assert = require("node:assert");
const { buildSystemPrompt, buildUserMessage, ENVELOPE_SCHEMA } = require("../llm/prompt.js");
const { WIDGET_TYPES } = require("../common/envelope.js");

const aesthetic = { id: "terminal", name: "Terminal", spec: "green phosphor CRT everywhere", baseCss: "" };

test("system prompt includes aesthetic name, spec, widget catalog, and output contract", () => {
  const p = buildSystemPrompt(aesthetic);
  assert.ok(p.includes("Terminal"));
  assert.ok(p.includes("green phosphor CRT everywhere"));
  for (const w of ["marquee", "sparkle_cursor", "tiled_background", "hit_counter", "badge"]) assert.ok(p.includes(w), w);
  assert.ok(p.includes("@import"));                 // the prohibition is stated
  assert.ok(p.includes("--patina-asset-stars"));    // asset tokens documented
  assert.ok(p.includes('"css"'));                   // JSON contract stated
});

test("user message embeds the digest as JSON", () => {
  const m = buildUserMessage({ title: "Example", darkMode: true });
  assert.ok(m.includes('"title":"Example"'));
  assert.ok(!m.includes("different direction"));
});

test("previousNotes adds the variation instruction", () => {
  const m = buildUserMessage({ title: "X" }, { previousNotes: "starfield with beveled buttons" });
  assert.ok(m.includes("starfield with beveled buttons"));
  assert.ok(m.toLowerCase().includes("different direction"));
});

test("envelope schema constrains widget types", () => {
  const types = ENVELOPE_SCHEMA.properties.widgets.items.properties.type.enum;
  assert.deepEqual([...types].sort(), ["badge", "hit_counter", "marquee", "sparkle_cursor", "tiled_background"]);
  assert.deepEqual(ENVELOPE_SCHEMA.required, ["css", "widgets"]);
});

test("envelope schema widget enum stays in sync with the validator catalog", () => {
  assert.deepEqual(
    ENVELOPE_SCHEMA.properties.widgets.items.properties.type.enum,
    WIDGET_TYPES
  );
});

test("css rules carry contrast pairing, minified-class, and dense-app guidance", () => {
  const p = buildSystemPrompt(aesthetic);
  assert.ok(p.includes("CONTRAST PAIRING"));
  assert.ok(p.includes("classesLookMinified"));
  assert.ok(p.toLowerCase().includes("dense application"));
});

test("null previousNotes yields no variation instruction", () => {
  const m = buildUserMessage({ title: "X" }, { previousNotes: null });
  assert.ok(!m.toLowerCase().includes("different direction"));
});
