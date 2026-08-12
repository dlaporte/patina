const test = require("node:test");
const assert = require("node:assert");
const { sanitizeCss, MAX_CSS_BYTES } = require("../common/sanitizer.js");

test("strips @import statements", () => {
  const r = sanitizeCss('@import url("https://evil.example/x.css"); body { color: red; }');
  assert.equal(r.ok, true);
  assert.ok(!r.css.includes("@import"));
  assert.ok(r.css.includes("color: red"));
  assert.equal(r.removed.length, 1);
});

test("strips declarations with external url(), keeps data: URIs", () => {
  const r = sanitizeCss(
    'body { background-image: url("https://evil.example/t.png"); color: blue; }\n' +
    '.ok { background-image: url("data:image/svg+xml;base64,abc"); }'
  );
  assert.ok(!r.css.includes("evil.example"));
  assert.ok(r.css.includes("color: blue"));
  assert.ok(r.css.includes("data:image/svg+xml"));
});

test("keeps asset-token backgrounds untouched", () => {
  const css = "body { background-image: var(--patina-asset-stars); }";
  const r = sanitizeCss(css);
  assert.equal(r.css, css.trim());
  assert.equal(r.removed.length, 0);
});

test("strips expression() and -moz-binding", () => {
  const r = sanitizeCss('div { width: expression(alert(1)); color: green; } a { -moz-binding: url("x"); }');
  assert.ok(!r.css.includes("expression"));
  assert.ok(!r.css.includes("-moz-binding"));
  assert.ok(r.css.includes("color: green"));
});

test("drops fixed full-viewport overlay rules, keeps others", () => {
  const r = sanitizeCss(".overlay { position: fixed; inset: 0; background: #000; } p { color: blue; } nav { position: fixed; top: 0; height: 40px; }");
  assert.ok(!r.css.includes("inset"));
  assert.ok(r.css.includes("color: blue"));
  assert.ok(r.css.includes("height: 40px")); // small fixed nav survives
});

test("removes url() hidden inside comments", () => {
  const r = sanitizeCss("body { /* url(https://evil.example) */ color: red; }");
  assert.ok(!r.css.includes("evil.example"));
  assert.ok(r.css.includes("color: red"));
});

test("rejects css over the 50KB cap", () => {
  const r = sanitizeCss("a".repeat(MAX_CSS_BYTES + 1));
  assert.equal(r.ok, false);
  assert.match(r.reason, /50KB/);
});

test("drops fixed overlays declared with longhand zero offsets", () => {
  const r = sanitizeCss(
    ".o { position: fixed; top: 0; right: 0; bottom: 0; left: 0; background: #000; } " +
    "nav { position: fixed; top: 0; left: 0; height: 40px; }"
  );
  assert.ok(!r.css.includes("bottom: 0"));
  assert.ok(r.css.includes("height: 40px")); // 2 zero offsets ≠ full viewport
});
