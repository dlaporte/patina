# Patina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Patina, an MV3 Chrome extension that LLM-generates a per-site CSS theme (plus retro widget placements) for a chosen aesthetic, caches it permanently per `(domain, aesthetic)`, and applies it instantly on every visit.

**Architecture:** Content scripts apply cached themes at `document_start` and host a shipped widget runtime; a background service worker owns all LLM calls (Anthropic + OpenAI-compatible adapters), a per-domain generation queue, envelope validation, CSS sanitization, and the permanent theme cache. The LLM only ever produces data (CSS + JSON); all executable code ships in the package.

**Tech Stack:** Plain JavaScript (no build step, no runtime dependencies), Chrome Manifest V3, `node --test` (Node ≥ 18.13) for unit tests. Shared modules use a UMD-ish wrapper so the same file loads as a classic script in the extension and via `require()` in tests.

**Spec:** `docs/superpowers/specs/2026-08-12-patina-design.md`

## Global Constraints

- Manifest V3. No build step. No npm runtime dependencies. Tests run with built-in `node --test`.
- The LLM output is data only (CSS string + widget JSON). Never execute or inject LLM-produced JavaScript (MV3 remote-code policy).
- Sanitizer invariants (must hold for any CSS that reaches a page): no `@import`; `url()` only with `data:` URIs; no `expression(`/`-moz-binding`; no fixed full-viewport overlay rules; ≤ 50KB.
- API key lives only in `chrome.storage.local` (never `storage.sync`).
- Required permissions exactly: `storage`, `scripting`, `activeTab`, `tabs`. `<all_urls>` only under `optional_host_permissions`, granted via the options-page "Enable everywhere" toggle.
- Default aesthetic id: `superhighway`. Anthropic model picker default: `claude-opus-5`; fast/cheap alternative `claude-haiku-4-5`.
- Anthropic requests set header `anthropic-version: 2023-06-01`, header `anthropic-dangerous-direct-browser-access: true`, and `cache_control: {type: "ephemeral"}` on the system prompt block.
- User-visible verbs: "Patinate" / "Re-patinate".
- Widget types (closed set, everywhere): `marquee`, `sparkle_cursor`, `tiled_background`, `hit_counter`, `badge`.
- Asset token names (closed set): `stars`, `construction`, `scanlines`, `tiedye` → CSS vars `--patina-asset-<name>`.
- Shared-module namespace: each `common/`, `llm/`, and `content/` library file registers itself on `globalThis.Patina.<name>` AND exports via `module.exports` when present (UMD wrapper shown in Task 2 — copy it exactly in later tasks).
- **Approved deviation from spec:** LLM adapters are non-streaming in v1; the popup shows a "Generating theme…" state instead of token-level progress. (Flagged to owner at plan handoff.)

---

### Task 1: Repo scaffold, manifest, load-unpacked smoke test

**Files:**
- Create: `manifest.json`
- Create: `background.js` (placeholder, replaced in Task 13)
- Create: `package.json`
- Create: `.gitignore`

**Interfaces:**
- Produces: the manifest every later task slots into; `npm test` runner convention (`node --test tests/`).

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
.DS_Store
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "patina",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 3: Create `manifest.json`**

Content scripts are NOT statically declared — the background worker registers them dynamically when `<all_urls>` is granted (Task 13), and injects on demand via `activeTab` otherwise. `web_accessible_resources` lets injected CSS reference bundled textures.

```json
{
  "manifest_version": 3,
  "name": "Patina",
  "version": "0.1.0",
  "description": "Restyles the web to match your aesthetic. Pick a patina; every site gets the finish.",
  "permissions": ["storage", "scripting", "activeTab", "tabs"],
  "optional_host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html", "default_title": "Patina" },
  "options_page": "options.html",
  "web_accessible_resources": [
    { "resources": ["assets/*"], "matches": ["<all_urls>"] }
  ]
}
```

- [ ] **Step 4: Create placeholder `background.js`**

```js
// Placeholder — replaced by the real service worker in Task 13.
console.log("[patina] service worker loaded");
```

- [ ] **Step 5: Create placeholder `popup.html` and `options.html`**

Manifest references them; real versions come in Tasks 15–16.

`popup.html`:
```html
<!doctype html><html><body>Patina (under construction)</body></html>
```

`options.html`:
```html
<!doctype html><html><body>Patina options (under construction)</body></html>
```

- [ ] **Step 6: Smoke test**

Open `chrome://extensions` → enable Developer mode → Load unpacked → select `~/code/patina`.
Expected: extension loads with no errors; service worker console shows `[patina] service worker loaded`; clicking the toolbar icon opens the placeholder popup.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: MV3 scaffold with optional <all_urls> host permissions"
```

---

### Task 2: Settings module

**Files:**
- Create: `common/settings.js`
- Test: `tests/settings.test.js`

**Interfaces:**
- Produces: `Patina.settings` = `{ DEFAULTS, DEFAULT_DENYLIST, normalizeHost(hostname) → string, isDenylisted(hostname, denylist) → bool, getSiteState(hostname, settings) → "on"|"off"|"denylisted", async getSettings() → settings, async saveSettings(patch) → settings }`.
- Settings shape: `{ enabled: bool, aestheticId: string, provider: { type: "anthropic"|"openai", baseUrl: string, model: string, apiKey: string }, denylist: string[], siteOverrides: { [host]: "off"|"on" }, customAesthetics: [{id, name, spec}] }`.

- [ ] **Step 1: Write the failing test**

`tests/settings.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert");

function makeChromeStub() {
  const store = {};
  return {
    _store: store,
    storage: {
      local: {
        async get(key) {
          if (key === null) return { ...store };
          const keys = Array.isArray(key) ? key : [key];
          return Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]));
        },
        async set(obj) { Object.assign(store, obj); },
        async remove(key) { delete store[key]; }
      }
    }
  };
}
globalThis.chrome = makeChromeStub();

const S = require("../common/settings.js");

test("normalizeHost lowercases and strips www.", () => {
  assert.equal(S.normalizeHost("WWW.Example.COM"), "example.com");
  assert.equal(S.normalizeHost("news.ycombinator.com"), "news.ycombinator.com");
});

test("isDenylisted matches wildcard suffix patterns", () => {
  assert.equal(S.isDenylisted("irs.gov", ["*.gov"]), true);
  assert.equal(S.isDenylisted("www.treasury.gov", ["*.gov"]), true);
  assert.equal(S.isDenylisted("govtrack.us", ["*.gov"]), false);
});

test("isDenylisted matches exact domains and subdomains", () => {
  assert.equal(S.isDenylisted("chase.com", ["chase.com"]), true);
  assert.equal(S.isDenylisted("secure.chase.com", ["chase.com"]), true);
  assert.equal(S.isDenylisted("notchase.com", ["chase.com"]), false);
});

test("getSiteState honors global toggle, denylist, and site overrides", () => {
  const settings = { ...S.DEFAULTS, siteOverrides: { "example.com": "off" } };
  assert.equal(S.getSiteState("example.com", settings), "off");
  assert.equal(S.getSiteState("irs.gov", settings), "denylisted");
  assert.equal(S.getSiteState("wikipedia.org", settings), "on");
  assert.equal(S.getSiteState("wikipedia.org", { ...settings, enabled: false }), "off");
});

test("getSettings merges stored partial settings over defaults", async () => {
  await chrome.storage.local.set({ settings: { aestheticId: "terminal", provider: { apiKey: "k" } } });
  const s = await S.getSettings();
  assert.equal(s.aestheticId, "terminal");
  assert.equal(s.provider.apiKey, "k");
  assert.equal(s.provider.model, "claude-opus-5"); // default preserved
  assert.equal(s.enabled, true);
});

test("saveSettings round-trips a patch", async () => {
  await S.saveSettings({ aestheticId: "soviet" });
  const s = await S.getSettings();
  assert.equal(s.aestheticId, "soviet");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/settings.test.js`
Expected: FAIL — `Cannot find module '../common/settings.js'`

- [ ] **Step 3: Write the implementation**

`common/settings.js` (this UMD wrapper is the template for every later shared module):
```js
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.settings = mod;
})(globalThis, function () {
  const DEFAULT_DENYLIST = [
    "*.gov", "*.mil",
    "chase.com", "bankofamerica.com", "wellsfargo.com", "citi.com",
    "fidelity.com", "schwab.com", "vanguard.com",
    "mychart.com", "kaiserpermanente.org"
  ];

  const DEFAULTS = {
    enabled: true,
    aestheticId: "superhighway",
    provider: { type: "anthropic", baseUrl: "", model: "claude-opus-5", apiKey: "" },
    denylist: DEFAULT_DENYLIST,
    siteOverrides: {},
    customAesthetics: []
  };

  function normalizeHost(hostname) {
    return String(hostname || "").toLowerCase().replace(/^www\./, "");
  }

  function matchesPattern(host, pattern) {
    if (pattern.startsWith("*.")) {
      return host === pattern.slice(2) || host.endsWith(pattern.slice(1));
    }
    return host === pattern || host.endsWith("." + pattern);
  }

  function isDenylisted(hostname, denylist) {
    const host = normalizeHost(hostname);
    return (denylist || []).some((p) => matchesPattern(host, String(p).toLowerCase().trim()));
  }

  function getSiteState(hostname, settings) {
    if (!settings.enabled) return "off";
    if (isDenylisted(hostname, settings.denylist)) return "denylisted";
    return settings.siteOverrides[normalizeHost(hostname)] === "off" ? "off" : "on";
  }

  async function getSettings() {
    const stored = await chrome.storage.local.get("settings");
    const s = stored.settings || {};
    return Object.assign({}, DEFAULTS, s, {
      provider: Object.assign({}, DEFAULTS.provider, s.provider || {})
    });
  }

  async function saveSettings(patch) {
    const next = Object.assign({}, await getSettings(), patch);
    await chrome.storage.local.set({ settings: next });
    return next;
  }

  return { DEFAULTS, DEFAULT_DENYLIST, normalizeHost, isDenylisted, getSiteState, getSettings, saveSettings };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/settings.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add common/settings.js tests/settings.test.js
git commit -m "feat: settings module with denylist matching and site overrides"
```

---

### Task 3: Theme cache module

**Files:**
- Create: `common/cache.js`
- Test: `tests/cache.test.js`

**Interfaces:**
- Produces: `Patina.cache` = `{ themeKey(domain, aestheticId) → string, async getTheme(domain, aestheticId) → record|null, async putTheme(domain, aestheticId, record), async deleteTheme(domain, aestheticId), async listThemes() → [{domain, aestheticId, record}] }`.
- Record shape: `{ envelope: {css, widgets, notes}, meta: {provider, model, createdAt, size} }`.

- [ ] **Step 1: Write the failing test**

`tests/cache.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert");

const store = {};
globalThis.chrome = {
  storage: {
    local: {
      async get(key) {
        if (key === null) return { ...store };
        const keys = Array.isArray(key) ? key : [key];
        return Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]));
      },
      async set(obj) { Object.assign(store, obj); },
      async remove(key) { delete store[key]; }
    }
  }
};

const cache = require("../common/cache.js");
const record = { envelope: { css: "body{}", widgets: [], notes: "" }, meta: { provider: "anthropic", model: "m", createdAt: 1, size: 6 } };

test("themeKey is namespaced and stable", () => {
  assert.equal(cache.themeKey("example.com", "terminal"), "theme::terminal::example.com");
});

test("put/get/delete round-trip", async () => {
  await cache.putTheme("example.com", "terminal", record);
  assert.deepEqual(await cache.getTheme("example.com", "terminal"), record);
  assert.equal(await cache.getTheme("example.com", "soviet"), null); // different aesthetic = different key
  await cache.deleteTheme("example.com", "terminal");
  assert.equal(await cache.getTheme("example.com", "terminal"), null);
});

test("listThemes returns only theme entries, parsed", async () => {
  await chrome.storage.local.set({ settings: { junk: true } });
  await cache.putTheme("a.com", "terminal", record);
  await cache.putTheme("b.com", "soviet", record);
  const list = await cache.listThemes();
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((t) => t.domain).sort(), ["a.com", "b.com"]);
  assert.deepEqual(list.map((t) => t.aestheticId).sort(), ["soviet", "terminal"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/cache.test.js`
Expected: FAIL — `Cannot find module '../common/cache.js'`

- [ ] **Step 3: Write the implementation**

`common/cache.js` (same UMD wrapper as Task 2, registering `root.Patina.cache`):
```js
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.cache = mod;
})(globalThis, function () {
  function themeKey(domain, aestheticId) {
    return `theme::${aestheticId}::${domain}`;
  }

  async function getTheme(domain, aestheticId) {
    const key = themeKey(domain, aestheticId);
    const res = await chrome.storage.local.get(key);
    return res[key] || null;
  }

  async function putTheme(domain, aestheticId, record) {
    await chrome.storage.local.set({ [themeKey(domain, aestheticId)]: record });
  }

  async function deleteTheme(domain, aestheticId) {
    await chrome.storage.local.remove(themeKey(domain, aestheticId));
  }

  async function listThemes() {
    const all = await chrome.storage.local.get(null);
    return Object.entries(all)
      .filter(([k]) => k.startsWith("theme::"))
      .map(([k, record]) => {
        const [, aestheticId, domain] = k.split("::");
        return { domain, aestheticId, record };
      });
  }

  return { themeKey, getTheme, putTheme, deleteTheme, listThemes };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/cache.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add common/cache.js tests/cache.test.js
git commit -m "feat: permanent per-(domain, aesthetic) theme cache"
```

---

### Task 4: CSS sanitizer

**Files:**
- Create: `common/sanitizer.js`
- Test: `tests/sanitizer.test.js`

**Interfaces:**
- Produces: `Patina.sanitizer` = `{ MAX_CSS_BYTES, sanitizeCss(cssText) → { ok: true, css, removed: string[] } | { ok: false, reason } }`.

- [ ] **Step 1: Write the failing test**

`tests/sanitizer.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sanitizer.test.js`
Expected: FAIL — `Cannot find module '../common/sanitizer.js'`

- [ ] **Step 3: Write the implementation**

`common/sanitizer.js` (UMD wrapper registering `root.Patina.sanitizer`). Regex-based by design: input is model output constrained by our prompt, not adversarial user input; the known limitation (nested `@media` braces aren't tracked, so overlay-rule detection is per innermost rule) is acceptable for v1 and noted here for reviewers.

```js
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.sanitizer = mod;
})(globalThis, function () {
  const MAX_CSS_BYTES = 50 * 1024;

  function sanitizeCss(cssText) {
    if (typeof cssText !== "string") return { ok: false, reason: "css must be a string" };
    if (new TextEncoder().encode(cssText).length > MAX_CSS_BYTES) {
      return { ok: false, reason: "css exceeds 50KB cap" };
    }
    const removed = [];
    const drop = (m) => { removed.push(m.trim()); return ""; };

    let css = cssText.replace(/\/\*[\s\S]*?\*\//g, "");            // comments first (nothing hides in them)
    css = css.replace(/@import[^;]*;/gi, drop);                     // no imports
    // Only data: URIs may pass. The optional quote lives INSIDE the lookahead —
    // with `['"]?(?!data:)` the engine backtracks past the quote and strips data: URIs too.
    css = css.replace(/[^;{}]*url\(\s*(?!["']?data:)[^)]*\)[^;}]*;?/gi, drop);
    css = css.replace(/[^;{}]*(expression\s*\(|-moz-binding)[^;}]*;?/gi, drop); // legacy executable CSS

    // Drop innermost rules that create fixed full-viewport overlays.
    css = css.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, sel, body) => {
      const fixed = /position\s*:\s*fixed/i.test(body);
      const covers = /(100vw|100vh|inset\s*:\s*0)/i.test(body) ||
        (/width\s*:\s*100%/i.test(body) && /height\s*:\s*100%/i.test(body));
      return fixed && covers ? drop(rule) : rule;
    });

    return { ok: true, css: css.trim(), removed };
  }

  return { MAX_CSS_BYTES, sanitizeCss };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/sanitizer.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add common/sanitizer.js tests/sanitizer.test.js
git commit -m "feat: CSS sanitizer enforcing import/url/overlay/size invariants"
```

---

### Task 5: Envelope validator

**Files:**
- Create: `common/envelope.js`
- Test: `tests/envelope.test.js`

**Interfaces:**
- Produces: `Patina.envelope` = `{ WIDGET_TYPES: string[], validateEnvelope(obj) → { ok: bool, errors: string[] } }`.
- Envelope shape (the LLM's contract): `{ css: string, widgets: [{type, target?, asset?, text?}], notes?: string }`.

- [ ] **Step 1: Write the failing test**

`tests/envelope.test.js`:
```js
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
  assert.deepEqual(WIDGET_TYPES.sort(), ["badge", "hit_counter", "marquee", "sparkle_cursor", "tiled_background"]);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/envelope.test.js`
Expected: FAIL — `Cannot find module '../common/envelope.js'`

- [ ] **Step 3: Write the implementation**

`common/envelope.js` (UMD wrapper registering `root.Patina.envelope`):
```js
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.envelope = mod;
})(globalThis, function () {
  const WIDGET_TYPES = ["marquee", "sparkle_cursor", "tiled_background", "hit_counter", "badge"];

  function validateEnvelope(obj) {
    if (!obj || typeof obj !== "object") return { ok: false, errors: ["envelope must be an object"] };
    const errors = [];
    if (typeof obj.css !== "string" || obj.css.trim() === "") errors.push("css must be a non-empty string");
    if (!Array.isArray(obj.widgets)) {
      errors.push("widgets must be an array");
    } else {
      obj.widgets.forEach((w, i) => {
        if (!w || typeof w !== "object") { errors.push(`widgets[${i}] must be an object`); return; }
        if (!WIDGET_TYPES.includes(w.type)) errors.push(`widgets[${i}].type "${w.type}" is not a known widget`);
        for (const f of ["target", "asset", "text"]) {
          if (w[f] != null && typeof w[f] !== "string") errors.push(`widgets[${i}].${f} must be a string`);
        }
      });
    }
    if (obj.notes != null && typeof obj.notes !== "string") errors.push("notes must be a string");
    return { ok: errors.length === 0, errors };
  }

  return { WIDGET_TYPES, validateEnvelope };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/envelope.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add common/envelope.js tests/envelope.test.js
git commit -m "feat: LLM envelope validator with closed widget catalog"
```

---

### Task 6: Presets (all seven aesthetics)

**Files:**
- Create: `common/presets.js`
- Test: `tests/presets.test.js`

**Interfaces:**
- Produces: `Patina.presets` = `{ PRESETS: [{id, name, spec, baseCss}], getAesthetic(id, settings) → {id, name, spec, baseCss}|null }`. `getAesthetic` resolves presets first, then `settings.customAesthetics` (custom aesthetics get `baseCss: ""`).

- [ ] **Step 1: Write the failing test**

`tests/presets.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert");
const { PRESETS, getAesthetic } = require("../common/presets.js");
const { sanitizeCss } = require("../common/sanitizer.js");

test("ships exactly the seven presets with unique ids", () => {
  const ids = PRESETS.map((p) => p.id);
  assert.deepEqual(ids.sort(), ["8bit", "enterprise", "murica", "psychedelic", "soviet", "superhighway", "terminal"]);
  assert.equal(new Set(ids).size, 7);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/presets.test.js`
Expected: FAIL — `Cannot find module '../common/presets.js'`

- [ ] **Step 3: Write the implementation**

`common/presets.js` (UMD wrapper registering `root.Patina.presets`). Information Superhighway is the fully-crafted flagship; the other six are intentionally thinner and deepened iteratively. Each `spec` is prose the LLM reads; each `baseCss` is the instant no-LLM fallback.

```js
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.presets = mod;
})(globalThis, function () {
  const PRESETS = [
    {
      id: "superhighway",
      name: "Information Superhighway",
      spec: `The 1998–2003 personal-homepage web (GeoCities/Angelfire era).
Palette: deep space-navy page background (#000018) with the tiled starfield texture (var(--patina-asset-stars)); electric unvisited-link blue (#66ccff on dark, #0000EE on light panels), visited purple (#cc99ff), lime green (#66ff66) and hot magenta (#ff66cc) accents, yellow (#ffff66) headings.
Type: Times New Roman for body text; Comic Sans MS for headings and anything playful. Underline every link.
Chrome: content areas become boxed "table" panels — 2px ridge or outset borders (#c0c0c0), slight padding, no border-radius anywhere. Buttons and inputs get the classic gray 3D bevel: background #c0c0c0, 2px outset white border, black text. Horizontal rules become chunky.
Texture accents: use var(--patina-asset-construction) sparingly as a banner background for one prominent header or nav strip.
Energy: exuberant amateur enthusiasm. It should look hand-made with love in FrontPage.
Widgets: strongly prefer tiled_background (stars), a marquee on the page's main heading, a hit_counter, sparkle_cursor, and a badge reading "Best viewed in Netscape Navigator 4.0".`,
      baseCss: `body { background-color: #000018 !important; background-image: var(--patina-asset-stars) !important; color: #e8e8ff !important; font-family: "Times New Roman", serif !important; }
a { color: #66ccff !important; text-decoration: underline !important; }
a:visited { color: #cc99ff !important; }
h1, h2, h3 { color: #ffff66 !important; font-family: "Comic Sans MS", "Comic Sans", cursive !important; }
button, input[type="submit"], input[type="button"] { background: #c0c0c0 !important; color: #000 !important; border: 2px outset #fff !important; border-radius: 0 !important; }
input, textarea, select { border-radius: 0 !important; }`
    },
    {
      id: "terminal",
      name: "Terminal",
      spec: `A phosphor CRT terminal. Near-black background (#050805), glowing green text (#33ff33) with amber (#ffb000) reserved for headings and emphasis. Everything monospace ("Courier New", "Consolas", monospace). Borders are 1px solid green with a soft outer glow (box-shadow 0 0 6px rgba(51,255,51,.5)); no border-radius. Links are green, underlined with a dotted underline, brighter on hover. Images get a phosphor treatment: filter grayscale + sepia + hue-rotate toward green, slightly boosted contrast. Overlay the scanline texture (var(--patina-asset-scanlines)) as the body background-image. Give the first h1 a blinking block cursor via ::after content "▌". Widgets: tiled_background (scanlines); a badge reading "SYS READY".`,
      baseCss: `body { background-color: #050805 !important; background-image: var(--patina-asset-scanlines) !important; color: #33ff33 !important; font-family: "Courier New", monospace !important; }
a { color: #33ff33 !important; text-decoration: underline dotted !important; }
h1, h2, h3 { color: #ffb000 !important; font-family: "Courier New", monospace !important; text-transform: uppercase; }
button, input[type="submit"] { background: #050805 !important; color: #33ff33 !important; border: 1px solid #33ff33 !important; border-radius: 0 !important; }`
    },
    {
      id: "8bit",
      name: "8-bit",
      spec: `An NES-era video game menu. Black (#0a0a0a) background, white text, and a hard primary palette: red #e74c3c, blue #3498db, yellow #f1c40f — no gradients, no shadows with blur, no border-radius. Type: bold monospace with wide letter-spacing, ALL CAPS headings. Chunky pixel borders: 4px solid, plus stepped box-shadow offsets (e.g. box-shadow: 4px 0 0 #000, -4px 0 0 #000, 0 4px 0 #000, 0 -4px 0 #000) to fake pixel corners. Buttons look like menu items: black background, white text, and a "▶ " ::before prefix on hover/focus. Images get image-rendering: pixelated. Widgets: a badge reading "PRESS START"; hit_counter styled as a score display.`,
      baseCss: `body { background-color: #0a0a0a !important; color: #ffffff !important; font-family: "Courier New", monospace !important; letter-spacing: 0.5px; }
a { color: #f1c40f !important; text-decoration: none !important; }
h1, h2, h3 { text-transform: uppercase; color: #e74c3c !important; }
img { image-rendering: pixelated; }
button, input[type="submit"] { background: #000 !important; color: #fff !important; border: 4px solid #fff !important; border-radius: 0 !important; }`
    },
    {
      id: "psychedelic",
      name: "Psychedelic",
      spec: `Late-60s psychedelia — Fillmore poster energy. The tie-dye radial texture (var(--patina-asset-tiedye)) as body background. Palette: hot pink #ff5ecb, orange #ffb340, acid green #7bff6a, sky #5ec8ff, deep purple #4a148c for text panels. Type: rounded/bubbly display serifs ("Cooper Black", "Chalkboard SE", Georgia fallback) for headings; generous rounding everywhere (border-radius 20px+ on panels, buttons, images). Headings get a slow hue-rotate animation (@keyframes, ~12s loop) and soft multi-color text-shadow. Content panels get translucent white backgrounds (rgba(255,255,255,0.85)) so text stays readable over the tie-dye. Widgets: tiled_background (tiedye), sparkle_cursor, a marquee on the main heading.`,
      baseCss: `body { background-image: var(--patina-asset-tiedye) !important; color: #4a148c !important; }
main, article, section { background: rgba(255,255,255,0.85); border-radius: 20px; }
a { color: #ff5ecb !important; }
h1, h2, h3 { color: #4a148c !important; font-family: "Cooper Black", Georgia, serif !important; }
button, input[type="submit"] { background: #ffb340 !important; color: #4a148c !important; border: none !important; border-radius: 24px !important; }`
    },
    {
      id: "enterprise",
      name: "Enterprise",
      spec: `The LCARS bridge computer from Star Trek: The Next Generation (Okuda style). Pure black (#000) background. Panel palette: gold #ff9c00, salmon #ff9966, lavender #cc99cc, blue-lavender #9999cc, muted red #cc6666 — used as solid blocks, never gradients. Shape language: pill-shaped buttons and nav items (border-radius: 24px); sections framed with a thick colored left border (12–16px solid, alternating palette colors) and a rounded top-left "elbow" (border-top-left-radius: 40px). Thin horizontal bars with fully-rounded end caps as separators. Type: ultra-condensed sans ("Arial Narrow", "Helvetica Neue", sans-serif), ALL CAPS, right-aligned labels where feasible; decorate major headings with a ::before number code like "47-291 · ". Links are gold; hover switches to salmon. Images can keep natural color but get a 2px gold bottom border. Widgets: a badge reading "STARDATE 47291.3".`,
      baseCss: `body { background-color: #000 !important; color: #ff9c00 !important; font-family: "Arial Narrow", "Helvetica Neue", sans-serif !important; }
a { color: #ff9c00 !important; text-decoration: none !important; }
a:hover { color: #ff9966 !important; }
h1, h2, h3 { color: #cc99cc !important; text-transform: uppercase; letter-spacing: 1px; }
button, input[type="submit"] { background: #ff9966 !important; color: #000 !important; border: none !important; border-radius: 24px !important; text-transform: uppercase; }`
    },
    {
      id: "soviet",
      name: "Soviet",
      spec: `Soviet constructivist propaganda poster. Aged-paper cream background (#f2e8d5), near-black ink (#1a1a1a), and revolutionary red (#cc2222) doing all the accent work. Type: heavy condensed uppercase display ("Impact", "Haettenschweiler", "Arial Narrow", sans-serif) for headings — big, loud, tightly leaded; body text in a sturdy serif. Headings become red banners: red background, cream text, slight skew (transform: skew(-2deg)), generous horizontal padding. Thick 3px solid black borders on panels and images; no border-radius. List bullets become red stars (list-style-type: "★ "). Links: dark red (#992222), underlined, bold. Diagonal energy where possible (skewed banners, bold horizontal rules). Widgets: a badge reading "ГОТОВО (READY)"; a marquee on the main heading.`,
      baseCss: `body { background-color: #f2e8d5 !important; color: #1a1a1a !important; }
a { color: #992222 !important; font-weight: bold !important; }
h1, h2, h3 { background: #cc2222; color: #f2e8d5 !important; font-family: Impact, "Arial Narrow", sans-serif !important; text-transform: uppercase; display: inline-block; padding: 2px 12px; transform: skew(-2deg); }
ul { list-style-type: "★ "; }
button, input[type="submit"] { background: #cc2222 !important; color: #f2e8d5 !important; border: 3px solid #1a1a1a !important; border-radius: 0 !important; text-transform: uppercase; }`
    },
    {
      id: "murica",
      name: "Murica",
      spec: `Maximal county-fair Americana. Palette: old-glory red #b22234, white, and navy #3c3b6e — and use all three constantly. Body background: subtle red-and-white awning stripes via repeating-linear-gradient (white dominant so content stays readable); content panels solid white with a 3px navy border. Headings: huge slab/display type (Impact or "Arial Black"), navy fill with a red text-shadow offset (text-shadow: 3px 3px 0 #b22234), stars "★" flanking the main h1 via ::before/::after. Links bold navy; buttons red with white text and a navy border. List bullets are stars. Sprinkle small waving-flag energy: skewed red/white striped accents on hr elements. Widgets: a badge reading "FREEDOM CERTIFIED ★"; a marquee on the main heading; sparkle_cursor.`,
      baseCss: `body { background-image: repeating-linear-gradient(90deg, #ffffff 0 48px, #f6e6e8 48px 96px) !important; color: #1a1a2e !important; }
main, article, section { background: #ffffff; border: 3px solid #3c3b6e; }
a { color: #3c3b6e !important; font-weight: bold !important; }
h1, h2, h3 { color: #3c3b6e !important; font-family: Impact, "Arial Black", sans-serif !important; text-shadow: 2px 2px 0 #b22234; }
ul { list-style-type: "★ "; }
button, input[type="submit"] { background: #b22234 !important; color: #fff !important; border: 2px solid #3c3b6e !important; text-transform: uppercase; }`
    }
  ];

  function getAesthetic(id, settings) {
    const preset = PRESETS.find((p) => p.id === id);
    if (preset) return preset;
    const custom = ((settings && settings.customAesthetics) || []).find((c) => c.id === id);
    if (custom) return { id: custom.id, name: custom.name, spec: custom.spec, baseCss: "" };
    return null;
  }

  return { PRESETS, getAesthetic };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/presets.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add common/presets.js tests/presets.test.js
git commit -m "feat: seven aesthetic presets with specs and instant base themes"
```

---

### Task 7: Prompt builder

**Files:**
- Create: `llm/prompt.js`
- Test: `tests/prompt.test.js`

**Interfaces:**
- Consumes: aesthetic objects from `Patina.presets.getAesthetic` (`{id, name, spec, baseCss}`).
- Produces: `Patina.prompt` = `{ buildSystemPrompt(aesthetic) → string, buildUserMessage(digest, opts?) → string, ENVELOPE_SCHEMA }`. `opts.previousNotes` (string) triggers the re-patinate variation instruction. `ENVELOPE_SCHEMA` is the JSON schema handed to the Anthropic adapter's structured output.

- [ ] **Step 1: Write the failing test**

`tests/prompt.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert");
const { buildSystemPrompt, buildUserMessage, ENVELOPE_SCHEMA } = require("../llm/prompt.js");

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
  assert.deepEqual(types.sort(), ["badge", "hit_counter", "marquee", "sparkle_cursor", "tiled_background"]);
  assert.deepEqual(ENVELOPE_SCHEMA.required, ["css", "widgets"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/prompt.test.js`
Expected: FAIL — `Cannot find module '../llm/prompt.js'`

- [ ] **Step 3: Write the implementation**

`llm/prompt.js` (UMD wrapper registering `root.Patina.prompt`):
```js
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.prompt = mod;
})(globalThis, function () {
  const WIDGET_CATALOG = `Available widgets (shipped with the extension; you only emit placements):
- marquee: {"type":"marquee","target":"<css selector>"} — scrolls the target's text horizontally.
- sparkle_cursor: {"type":"sparkle_cursor"} — trailing sparkles follow the mouse.
- tiled_background: {"type":"tiled_background","asset":"stars|construction|scanlines|tiedye"} — tiles a bundled texture on the page background.
- hit_counter: {"type":"hit_counter"} — retro odometer-style visit counter pinned near the bottom of the page.
- badge: {"type":"badge","text":"<short text>"} — small retro badge pinned near the bottom of the page.`;

  const CSS_RULES = `Rules for the "css" field:
- Style ONLY selectors present in the DOM digest, plus base elements (body, a, h1-h3, p, input, button, img).
- Never use @import. Never reference external URLs. url() is allowed only for data: URIs.
- For texture backgrounds use these CSS variables as background-image values: var(--patina-asset-stars), var(--patina-asset-construction), var(--patina-asset-scanlines), var(--patina-asset-tiedye).
- Do not hide or remove content (no display:none on content containers). Do not create full-viewport fixed overlays.
- Keep the page usable: readable contrast, visible focus states, working hover states.
- Prefer specific selectors; !important is acceptable to beat utility-class frameworks.
- Keep total CSS under 40KB.
Respond with a single JSON object and nothing else: {"css": "...", "widgets": [...], "notes": "<one-line summary of the direction you took>"}.`;

  function buildSystemPrompt(aesthetic) {
    return [
      "You are Patina, a web restyling engine. Given a DOM digest of a website, you produce a site-specific theme that reskins it into a target aesthetic without breaking usability.",
      "## Target aesthetic: " + aesthetic.name,
      aesthetic.spec,
      "## Widget catalog",
      WIDGET_CATALOG,
      "## Output contract",
      CSS_RULES
    ].join("\n\n");
  }

  function buildUserMessage(digest, opts = {}) {
    const parts = ["DOM digest of the site to theme:", JSON.stringify(digest)];
    if (opts.previousNotes) {
      parts.push(
        `The user rejected the previous theme for this site (its summary: "${opts.previousNotes}"). Take a noticeably different direction this time while staying inside the aesthetic.`
      );
    }
    return parts.join("\n\n");
  }

  const ENVELOPE_SCHEMA = {
    type: "object",
    properties: {
      css: { type: "string" },
      widgets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["marquee", "sparkle_cursor", "tiled_background", "hit_counter", "badge"] },
            target: { type: "string" },
            asset: { type: "string" },
            text: { type: "string" }
          },
          required: ["type"],
          additionalProperties: false
        }
      },
      notes: { type: "string" }
    },
    required: ["css", "widgets"],
    additionalProperties: false
  };

  return { WIDGET_CATALOG, CSS_RULES, buildSystemPrompt, buildUserMessage, ENVELOPE_SCHEMA };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/prompt.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add llm/prompt.js tests/prompt.test.js
git commit -m "feat: prompt builder with aesthetic spec, widget catalog, and envelope schema"
```

---

### Task 8: Anthropic adapter

**Files:**
- Create: `llm/anthropic.js`
- Test: `tests/anthropic.test.js`

**Interfaces:**
- Produces: `Patina.llm.anthropic` = `{ API_URL, async generateTheme({apiKey, model, system, user, schema}, fetchImpl?) → envelope object }`. Throws `Error` on non-2xx, refusal stop reason, or unparseable JSON.

- [ ] **Step 1: Write the failing test**

`tests/anthropic.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert");
const { generateTheme, API_URL } = require("../llm/anthropic.js");

function okResponse(envelope) {
  return {
    ok: true,
    json: async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(envelope) }]
    })
  };
}

test("sends a correctly-shaped request and parses the envelope", async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, headers: init.headers, body: JSON.parse(init.body) };
    return okResponse({ css: "body{}", widgets: [], notes: "n" });
  };
  const env = await generateTheme(
    { apiKey: "sk-test", model: "claude-opus-5", system: "SYS", user: "USR", schema: { type: "object" } },
    fakeFetch
  );
  assert.equal(env.css, "body{}");
  assert.equal(captured.url, API_URL);
  assert.equal(captured.headers["x-api-key"], "sk-test");
  assert.equal(captured.headers["anthropic-version"], "2023-06-01");
  assert.equal(captured.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(captured.body.model, "claude-opus-5");
  assert.equal(captured.body.system[0].text, "SYS");
  assert.deepEqual(captured.body.system[0].cache_control, { type: "ephemeral" });
  assert.equal(captured.body.messages[0].content, "USR");
  assert.deepEqual(captured.body.output_config.format, { type: "json_schema", schema: { type: "object" } });
});

test("throws on refusal stop reason", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ stop_reason: "refusal", content: [] }) });
  await assert.rejects(
    generateTheme({ apiKey: "k", model: "m", system: "s", user: "u", schema: {} }, fakeFetch),
    /refusal/
  );
});

test("throws with status and body excerpt on non-2xx", async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, text: async () => '{"error":"bad key"}' });
  await assert.rejects(
    generateTheme({ apiKey: "k", model: "m", system: "s", user: "u", schema: {} }, fakeFetch),
    /401.*bad key/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/anthropic.test.js`
Expected: FAIL — `Cannot find module '../llm/anthropic.js'`

- [ ] **Step 3: Write the implementation**

`llm/anthropic.js` (UMD wrapper registering `root.Patina.llm.anthropic` — note the two-level namespace):
```js
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.llm = root.Patina.llm || {};
  root.Patina.llm.anthropic = mod;
})(globalThis, function () {
  const API_URL = "https://api.anthropic.com/v1/messages";

  async function generateTheme({ apiKey, model, system, user, schema }, fetchImpl) {
    const doFetch = fetchImpl || fetch;
    const res = await doFetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: model || "claude-opus-5",
        max_tokens: 8192,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
        output_config: { format: { type: "json_schema", schema } }
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    if (data.stop_reason === "refusal") throw new Error("Model declined the request (refusal)");
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return JSON.parse(text);
  }

  return { API_URL, generateTheme };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/anthropic.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add llm/anthropic.js tests/anthropic.test.js
git commit -m "feat: Anthropic adapter with prompt caching and structured output"
```

---

### Task 9: OpenAI-compatible adapter

**Files:**
- Create: `llm/openai.js`
- Test: `tests/openai.test.js`

**Interfaces:**
- Produces: `Patina.llm.openai` = `{ async generateTheme({apiKey, baseUrl, model, system, user}, fetchImpl?) → envelope object }`. Default `baseUrl` is `https://api.openai.com/v1`; trailing slashes tolerated. Strips markdown code fences before parsing (some providers wrap JSON despite `json_object` mode).

- [ ] **Step 1: Write the failing test**

`tests/openai.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert");
const { generateTheme } = require("../llm/openai.js");

function okResponse(content) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
}

test("targets {baseUrl}/chat/completions with bearer auth and json_object mode", async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, headers: init.headers, body: JSON.parse(init.body) };
    return okResponse('{"css":"body{}","widgets":[],"notes":""}');
  };
  const env = await generateTheme(
    { apiKey: "sk-o", baseUrl: "http://localhost:11434/v1/", model: "llama3", system: "SYS", user: "USR" },
    fakeFetch
  );
  assert.equal(env.css, "body{}");
  assert.equal(captured.url, "http://localhost:11434/v1/chat/completions");
  assert.equal(captured.headers.authorization, "Bearer sk-o");
  assert.deepEqual(captured.body.response_format, { type: "json_object" });
  assert.equal(captured.body.messages[0].role, "system");
  assert.equal(captured.body.messages[1].content, "USR");
});

test("defaults baseUrl to api.openai.com", async () => {
  let url;
  const fakeFetch = async (u) => { url = u; return okResponse('{"css":"a{}","widgets":[]}'); };
  await generateTheme({ apiKey: "k", model: "gpt-4o", system: "s", user: "u" }, fakeFetch);
  assert.equal(url, "https://api.openai.com/v1/chat/completions");
});

test("strips markdown code fences from the response", async () => {
  const fakeFetch = async () => okResponse('```json\n{"css":"b{}","widgets":[]}\n```');
  const env = await generateTheme({ apiKey: "k", model: "m", system: "s", user: "u" }, fakeFetch);
  assert.equal(env.css, "b{}");
});

test("throws with status on non-2xx", async () => {
  const fakeFetch = async () => ({ ok: false, status: 429, text: async () => "rate limited" });
  await assert.rejects(generateTheme({ apiKey: "k", model: "m", system: "s", user: "u" }, fakeFetch), /429/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/openai.test.js`
Expected: FAIL — `Cannot find module '../llm/openai.js'`

- [ ] **Step 3: Write the implementation**

`llm/openai.js` (UMD wrapper registering `root.Patina.llm.openai`):
```js
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.llm = root.Patina.llm || {};
  root.Patina.llm.openai = mod;
})(globalThis, function () {
  function stripFences(text) {
    return String(text).replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }

  async function generateTheme({ apiKey, baseUrl, model, system, user }, fetchImpl) {
    const doFetch = fetchImpl || fetch;
    const url = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "") + "/chat/completions";
    const res = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        response_format: { type: "json_object" }
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LLM API ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
    return JSON.parse(stripFences(text));
  }

  return { generateTheme };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/openai.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add llm/openai.js tests/openai.test.js
git commit -m "feat: OpenAI-compatible adapter with configurable base URL"
```

---

### Task 10: DOM digest builder

**Files:**
- Create: `content/digest.js`
- Test: `tests/digest.test.js`

**Interfaces:**
- Produces: `Patina.digest` = `{ buildDigest(doc, win) → digest, isDarkColor(cssColor) → bool, capDigest(digest, maxBytes?) → digest }`. `capDigest` (default 4096 bytes) trims `topClasses` until the JSON serialization fits; Task 14's orchestrator calls it on every digest it ships to the background.
- Digest shape: `{ title, host, landmarks: {header?, nav?, main?, aside?, footer?}, topClasses: [{name, n}], styles: {body, link, button, h1}, darkMode: bool }`. Uses only these DOM/window APIs (so tests can stub them): `doc.title`, `doc.body`, `doc.querySelector`, `doc.querySelectorAll("[class]")`, `el.className`, `el.classList` (iterable), `win.getComputedStyle(el).getPropertyValue(prop)`, `win.location.hostname`.

- [ ] **Step 1: Write the failing test**

`tests/digest.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert");
const { buildDigest, isDarkColor, capDigest } = require("../content/digest.js");

function fakeEl(className) {
  const classes = className.split(/\s+/).filter(Boolean);
  return { className, classList: classes };
}

function fakeDoc() {
  const header = fakeEl("site-header sticky");
  const body = fakeEl("");
  return {
    title: "Example Site",
    body,
    querySelector(sel) {
      if (sel === "header") return header;
      if (sel === "a") return fakeEl("nav-link");
      return null; // no nav/main/aside/footer/button/h1 on this fake page
    },
    querySelectorAll(sel) {
      if (sel === "[class]") return [header, fakeEl("card"), fakeEl("card"), fakeEl("card wide")];
      return [];
    }
  };
}

const fakeWin = {
  location: { hostname: "www.example.com" },
  getComputedStyle() {
    return { getPropertyValue: (p) => ({ "background-color": "rgb(20, 20, 30)", color: "rgb(230, 230, 230)", "font-family": "Arial" }[p] || "") };
  }
};

test("isDarkColor classifies rgb colors by luminance", () => {
  assert.equal(isDarkColor("rgb(20, 20, 30)"), true);
  assert.equal(isDarkColor("rgb(250, 250, 245)"), false);
  assert.equal(isDarkColor("not-a-color"), false);
});

test("buildDigest collects title, host, landmarks, top classes, styles, dark mode", () => {
  const d = buildDigest(fakeDoc(), fakeWin);
  assert.equal(d.title, "Example Site");
  assert.equal(d.host, "www.example.com");
  assert.deepEqual(d.landmarks.header.classes, ["site-header", "sticky"]);
  assert.equal(d.landmarks.footer, undefined);
  assert.equal(d.topClasses[0].name, "card");
  assert.equal(d.topClasses[0].n, 3);
  assert.equal(d.styles.body["background-color"], "rgb(20, 20, 30)");
  assert.equal(d.darkMode, true);
});

test("capDigest trims topClasses to fit the byte budget", () => {
  const digest = {
    title: "t", host: "h", landmarks: {}, styles: {},
    topClasses: Array.from({ length: 200 }, (_, i) => ({ name: "class-number-" + i, n: 1 })),
    darkMode: false
  };
  const capped = capDigest(digest, 1024);
  assert.ok(JSON.stringify(capped).length <= 1024);
  assert.ok(capped.topClasses.length >= 5);
  assert.equal(digest.topClasses.length, 200); // input not mutated
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/digest.test.js`
Expected: FAIL — `Cannot find module '../content/digest.js'`

- [ ] **Step 3: Write the implementation**

`content/digest.js` (UMD wrapper registering `root.Patina.digest`):
```js
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.digest = mod;
})(globalThis, function () {
  function isDarkColor(cssColor) {
    const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(String(cssColor || ""));
    if (!m) return false;
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  }

  function pickStyles(el, win, props) {
    if (!el) return null;
    const cs = win.getComputedStyle(el);
    const out = {};
    for (const p of props) out[p] = cs.getPropertyValue(p);
    return out;
  }

  function buildDigest(doc, win) {
    const landmarks = {};
    for (const sel of ["header", "nav", "main", "aside", "footer"]) {
      const el = doc.querySelector(sel);
      if (el) landmarks[sel] = { classes: String(el.className).split(/\s+/).filter(Boolean).slice(0, 5) };
    }

    const counts = new Map();
    let seen = 0;
    for (const el of doc.querySelectorAll("[class]")) {
      for (const c of el.classList) counts.set(c, (counts.get(c) || 0) + 1);
      if (++seen > 3000) break;
    }
    const topClasses = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([name, n]) => ({ name, n }));

    const styles = {
      body: pickStyles(doc.body, win, ["background-color", "color", "font-family"]),
      link: pickStyles(doc.querySelector("a"), win, ["color"]),
      button: pickStyles(doc.querySelector("button, [role=button], input[type=submit]"), win, ["background-color", "color", "border-radius"]),
      h1: pickStyles(doc.querySelector("h1, h2"), win, ["font-family", "font-size", "color"])
    };

    return {
      title: doc.title || "",
      host: win.location ? win.location.hostname : "",
      landmarks,
      topClasses,
      styles,
      darkMode: isDarkColor(styles.body && styles.body["background-color"])
    };
  }

  function capDigest(digest, maxBytes = 4096) {
    const d = { ...digest, topClasses: [...(digest.topClasses || [])] };
    while (JSON.stringify(d).length > maxBytes && d.topClasses.length > 5) {
      d.topClasses = d.topClasses.slice(0, Math.max(5, Math.floor(d.topClasses.length / 2)));
    }
    return d;
  }

  return { buildDigest, isDarkColor, capDigest };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/digest.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests from Tasks 2–10 PASS.

- [ ] **Step 6: Commit**

```bash
git add content/digest.js tests/digest.test.js
git commit -m "feat: DOM digest builder with byte-budgeted serialization"
```

---

### Task 11: Texture assets and style applier

**Files:**
- Create: `assets/textures/stars.svg`, `assets/textures/construction.svg`, `assets/textures/scanlines.svg`, `assets/textures/tiedye.svg`
- Create: `content/apply.js`

**Interfaces:**
- Produces: `Patina.apply` = `{ STYLE_ID, ASSETS, injectAssetTokens(doc), applyCss(doc, cssText), clearPatina(doc), observeAndReassert(doc) }`. `ASSETS` maps token name → extension-relative path. All Patina-created DOM elements carry a `data-patina` attribute (cleanup contract used by widgets too).
- No unit test (needs a real DOM); verified manually in Step 4 and exercised end-to-end in Task 14.

- [ ] **Step 1: Create the four SVG textures**

`assets/textures/stars.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">
  <rect width="240" height="240" fill="#000018"/>
  <g fill="#ffffff">
    <circle cx="20" cy="30" r="1.5"/><circle cx="70" cy="80" r="1"/><circle cx="120" cy="40" r="2"/>
    <circle cx="180" cy="90" r="1"/><circle cx="210" cy="150" r="1.5"/><circle cx="60" cy="170" r="1"/>
    <circle cx="140" cy="200" r="1.5"/><circle cx="30" cy="220" r="1"/><circle cx="200" cy="20" r="1"/>
    <circle cx="100" cy="130" r="1"/><circle cx="160" cy="60" r="1"/><circle cx="90" cy="10" r="1.5"/>
  </g>
</svg>
```

`assets/textures/construction.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56">
  <rect width="56" height="56" fill="#f7c600"/>
  <path d="M-14 14 L14 -14 M0 56 L56 0 M42 70 L70 42" stroke="#111111" stroke-width="14"/>
</svg>
```

`assets/textures/scanlines.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4">
  <rect y="2" width="4" height="1" fill="rgba(0,0,0,0.35)"/>
</svg>
```

`assets/textures/tiedye.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%">
      <stop offset="0%" stop-color="#ff5ecb"/>
      <stop offset="35%" stop-color="#ffb340"/>
      <stop offset="70%" stop-color="#7bff6a"/>
      <stop offset="100%" stop-color="#5ec8ff"/>
    </radialGradient>
  </defs>
  <rect width="200" height="200" fill="url(#g)"/>
</svg>
```

- [ ] **Step 2: Write `content/apply.js`**

(UMD wrapper registering `root.Patina.apply`.)
```js
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.apply = mod;
})(globalThis, function () {
  const STYLE_ID = "patina-style";
  const TOKEN_STYLE_ID = "patina-asset-tokens";
  const ASSETS = {
    stars: "assets/textures/stars.svg",
    construction: "assets/textures/construction.svg",
    scanlines: "assets/textures/scanlines.svg",
    tiedye: "assets/textures/tiedye.svg"
  };

  function mount(doc) { return doc.head || doc.documentElement; }

  function injectAssetTokens(doc) {
    if (doc.getElementById(TOKEN_STYLE_ID)) return;
    const lines = Object.entries(ASSETS).map(
      ([name, path]) => `  --patina-asset-${name}: url("${chrome.runtime.getURL(path)}");`
    );
    const style = doc.createElement("style");
    style.id = TOKEN_STYLE_ID;
    style.setAttribute("data-patina", "tokens");
    style.textContent = `:root {\n${lines.join("\n")}\n}`;
    mount(doc).appendChild(style);
  }

  function applyCss(doc, cssText) {
    injectAssetTokens(doc);
    let style = doc.getElementById(STYLE_ID);
    if (!style) {
      style = doc.createElement("style");
      style.id = STYLE_ID;
      style.setAttribute("data-patina", "theme");
      mount(doc).appendChild(style);
    }
    style.textContent = cssText;
  }

  function clearPatina(doc) {
    const win = doc.defaultView;
    if (win && win.__patinaObserver) { win.__patinaObserver.disconnect(); win.__patinaObserver = null; }
    for (const el of [...doc.querySelectorAll("[data-patina]")]) el.remove();
  }

  // Keep the theme style last in <head> so it wins cascade ties against
  // late-loaded site stylesheets (common on SPAs).
  function observeAndReassert(doc) {
    const win = doc.defaultView;
    if (!win || win.__patinaObserver || !doc.head) return;
    const obs = new MutationObserver(() => {
      const style = doc.getElementById(STYLE_ID);
      if (style && doc.head.lastElementChild !== style) doc.head.appendChild(style);
    });
    obs.observe(doc.head, { childList: true });
    win.__patinaObserver = obs;
  }

  return { STYLE_ID, ASSETS, injectAssetTokens, applyCss, clearPatina, observeAndReassert };
});
```

- [ ] **Step 3: Run the full test suite (regression only — no new unit tests)**

Run: `npm test`
Expected: PASS (apply.js is browser-only; nothing imports it in tests).

- [ ] **Step 4: Manual verification**

Reload the unpacked extension. On any page, open DevTools console and paste the contents of `content/apply.js`, then run:
```js
Patina.apply.applyCss(document, "body { background-image: var(--patina-asset-stars) !important; }");
```
Expected: page background becomes the tiled starfield (asset token resolved through `chrome.runtime.getURL` — works because `assets/*` is web-accessible).

- [ ] **Step 5: Commit**

```bash
git add assets/ content/apply.js
git commit -m "feat: bundled SVG textures, asset tokens, and style applier"
```

---

### Task 12: Widget runtime

**Files:**
- Create: `content/widgets.js`

**Interfaces:**
- Consumes: `Patina.apply.ASSETS` (asset name validation).
- Produces: `Patina.widgets` = `{ applyWidgets(doc, widgets) }` — applies each widget from an envelope's `widgets` array; every widget is individually try/caught so one failure can't break the rest. All created elements carry `data-patina` (so `Patina.apply.clearPatina` removes them).
- No unit test (needs a real DOM); verified manually in Step 2, end-to-end in Task 14.

- [ ] **Step 1: Write `content/widgets.js`**

(UMD wrapper registering `root.Patina.widgets`.)
```js
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.widgets = mod;
})(globalThis, function () {
  function ensureKeyframes(doc) {
    if (doc.getElementById("patina-widget-keyframes")) return;
    const style = doc.createElement("style");
    style.id = "patina-widget-keyframes";
    style.setAttribute("data-patina", "widget-css");
    style.textContent = `
@keyframes patina-marquee { from { transform: translateX(100%); } to { transform: translateX(-100%); } }
@keyframes patina-sparkle { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(14px) scale(0.3); } }
.patina-pill { position: fixed; z-index: 2147483646; font: bold 11px/1.6 monospace; padding: 2px 10px;
  background: #111; color: #ffd700; border: 1px solid #ffd700; border-radius: 3px; opacity: 0.92; }`;
    (doc.head || doc.documentElement).appendChild(style);
  }

  const registry = {
    marquee({ doc, widget }) {
      const target = widget.target && doc.querySelector(widget.target);
      if (!target || target.querySelector("[data-patina='marquee-inner']")) return;
      target.style.overflow = "hidden";
      target.style.whiteSpace = "nowrap";
      const inner = doc.createElement("span");
      inner.setAttribute("data-patina", "marquee-inner");
      while (target.firstChild) inner.appendChild(target.firstChild);
      inner.style.display = "inline-block";
      inner.style.minWidth = "100%";
      inner.style.animation = "patina-marquee 12s linear infinite";
      target.appendChild(inner);
    },

    sparkle_cursor({ doc }) {
      if (doc.defaultView.__patinaSparkles) return;
      doc.defaultView.__patinaSparkles = true;
      let last = 0;
      doc.addEventListener("mousemove", (e) => {
        const now = Date.now();
        if (now - last < 60) return; // throttle
        last = now;
        const s = doc.createElement("div");
        s.setAttribute("data-patina", "sparkle");
        s.textContent = "✦";
        s.style.cssText = `position: fixed; left: ${e.clientX + 6}px; top: ${e.clientY + 6}px;
          pointer-events: none; z-index: 2147483647; color: hsl(${now % 360}, 100%, 70%);
          font-size: 12px; animation: patina-sparkle 0.8s ease-out forwards;`;
        doc.body.appendChild(s);
        setTimeout(() => s.remove(), 850);
      }, { passive: true });
    },

    tiled_background({ doc, widget }) {
      const asset = globalThis.Patina.apply.ASSETS[widget.asset] ? widget.asset : "stars";
      const style = doc.createElement("style");
      style.setAttribute("data-patina", "tiled-bg");
      style.textContent = `body { background-image: var(--patina-asset-${asset}) !important; }`;
      (doc.head || doc.documentElement).appendChild(style);
    },

    async hit_counter({ doc }) {
      const host = location.hostname;
      const key = "hits::" + host;
      const stored = await chrome.storage.local.get(key);
      const hits = (stored[key] || 41960) + 1; // start retro-plausibly high
      await chrome.storage.local.set({ [key]: hits });
      const el = doc.createElement("div");
      el.setAttribute("data-patina", "hit-counter");
      el.className = "patina-pill";
      el.style.right = "12px";
      el.style.bottom = "12px";
      el.textContent = "You are visitor № " + String(hits).padStart(6, "0");
      doc.body.appendChild(el);
    },

    badge({ doc, widget }) {
      const el = doc.createElement("div");
      el.setAttribute("data-patina", "badge");
      el.className = "patina-pill";
      el.style.left = "12px";
      el.style.bottom = "12px";
      el.textContent = widget.text || "Patina'd";
      doc.body.appendChild(el);
    }
  };

  function applyWidgets(doc, widgets) {
    ensureKeyframes(doc);
    for (const w of widgets || []) {
      try {
        const fn = registry[w.type];
        if (fn) fn({ doc, widget: w });
      } catch (e) {
        console.warn("[patina] widget failed:", w.type, e);
      }
    }
  }

  return { applyWidgets };
});
```

- [ ] **Step 2: Manual verification**

On any page, paste `content/apply.js` then `content/widgets.js` into the DevTools console (apply.js first — widgets reads `Patina.apply.ASSETS`), then run:
```js
Patina.widgets.applyWidgets(document, [
  { type: "marquee", target: "h1" },
  { type: "sparkle_cursor" },
  { type: "hit_counter" },
  { type: "badge", text: "Best viewed in Netscape Navigator 4.0" }
]);
```
Expected: the first `h1` scrolls; moving the mouse trails colored sparkles; a visitor counter appears bottom-right; the badge appears bottom-left. Running the snippet twice does not double-wrap the marquee or double-register sparkles.

- [ ] **Step 3: Commit**

```bash
git add content/widgets.js
git commit -m "feat: shipped widget runtime (marquee, sparkles, tiled bg, hit counter, badge)"
```

---

### Task 13: Background service worker

**Files:**
- Modify: `background.js` (replace the Task 1 placeholder entirely)

**Interfaces:**
- Consumes: `Patina.settings`, `Patina.cache`, `Patina.sanitizer`, `Patina.envelope`, `Patina.presets`, `Patina.prompt`, `Patina.llm.anthropic`, `Patina.llm.openai` (via `importScripts`).
- Produces (message protocol — the contract Tasks 14–15 code against):
  - `{type: "patina:generate", domain, aestheticId, digest}` → `{ok: true, envelope}` | `{ok: false, error}`
  - `{type: "patina:status", domain}` → `{siteState, aestheticId, cached: bool, generating: bool, error: string|null, hasKey: bool}`
  - `{type: "patina:repatinate", domain, tabId}` → `{ok: true}` | `{ok: false, error}` (deletes cache, pulls a fresh digest from the tab, regenerates with variation notes, pushes `patina:apply` to the tab)
  - `{type: "patina:injectHere", tabId}` → `{ok: true}` (on-demand injection under `activeTab`)
- Also: dynamic content-script registration when `<all_urls>` is granted; unregistration when revoked.

- [ ] **Step 1: Write the implementation**

`background.js`:
```js
importScripts(
  "common/settings.js", "common/cache.js", "common/sanitizer.js",
  "common/envelope.js", "common/presets.js",
  "llm/prompt.js", "llm/anthropic.js", "llm/openai.js"
);

const P = globalThis.Patina;

const CONTENT_SCRIPTS = [
  "common/settings.js", "common/cache.js", "common/presets.js",
  "content/digest.js", "content/apply.js", "content/widgets.js", "content/main.js"
];

const inFlight = new Map(); // themeKey -> Promise<envelope>
const lastError = new Map(); // themeKey -> string

// --- Content-script registration (everywhere-automatic mode) ---
async function ensureRegistered() {
  const granted = await chrome.permissions.contains({ origins: ["<all_urls>"] });
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: ["patina"] }).catch(() => []);
  if (granted && existing.length === 0) {
    await chrome.scripting.registerContentScripts([{
      id: "patina",
      matches: ["<all_urls>"],
      js: CONTENT_SCRIPTS,
      runAt: "document_start",
      persistAcrossSessions: true
    }]);
  } else if (!granted && existing.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: ["patina"] }).catch(() => {});
  }
}
chrome.runtime.onInstalled.addListener(ensureRegistered);
chrome.runtime.onStartup.addListener(ensureRegistered);
chrome.permissions.onAdded.addListener(ensureRegistered);
chrome.permissions.onRemoved.addListener(ensureRegistered);

// --- Generation pipeline ---
async function generate({ domain, aestheticId, digest, variationNotes }) {
  const key = P.cache.themeKey(domain, aestheticId);
  if (inFlight.has(key)) return inFlight.get(key);

  const job = (async () => {
    const cached = await P.cache.getTheme(domain, aestheticId);
    if (cached && !variationNotes) return cached.envelope; // raced another tab

    const settings = await P.settings.getSettings();
    const aesthetic = P.presets.getAesthetic(aestheticId, settings);
    if (!aesthetic) throw new Error("Unknown aesthetic: " + aestheticId);
    if (!settings.provider.apiKey) throw new Error("No API key configured (open Options)");

    const system = P.prompt.buildSystemPrompt(aesthetic);
    const user = P.prompt.buildUserMessage(digest, { previousNotes: variationNotes });

    const envelope = settings.provider.type === "anthropic"
      ? await P.llm.anthropic.generateTheme({
          apiKey: settings.provider.apiKey, model: settings.provider.model,
          system, user, schema: P.prompt.ENVELOPE_SCHEMA
        })
      : await P.llm.openai.generateTheme({
          apiKey: settings.provider.apiKey, baseUrl: settings.provider.baseUrl,
          model: settings.provider.model, system, user
        });

    const check = P.envelope.validateEnvelope(envelope);
    if (!check.ok) throw new Error("Invalid envelope: " + check.errors.join("; "));
    const clean = P.sanitizer.sanitizeCss(envelope.css);
    if (!clean.ok) throw new Error("CSS rejected: " + clean.reason);
    envelope.css = clean.css;

    await P.cache.putTheme(domain, aestheticId, {
      envelope,
      meta: {
        provider: settings.provider.type, model: settings.provider.model,
        createdAt: Date.now(), size: envelope.css.length
      }
    });
    return envelope;
  })();

  inFlight.set(key, job);
  lastError.delete(key);
  try {
    return await job;
  } catch (e) {
    lastError.set(key, e.message);
    throw e;
  } finally {
    inFlight.delete(key);
  }
}

// --- Message routing ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "patina:generate") {
        const envelope = await generate(msg);
        sendResponse({ ok: true, envelope });

      } else if (msg.type === "patina:status") {
        const settings = await P.settings.getSettings();
        const key = P.cache.themeKey(msg.domain, settings.aestheticId);
        sendResponse({
          siteState: P.settings.getSiteState(msg.domain, settings),
          aestheticId: settings.aestheticId,
          cached: !!(await P.cache.getTheme(msg.domain, settings.aestheticId)),
          generating: inFlight.has(key),
          error: lastError.get(key) || null,
          hasKey: !!settings.provider.apiKey
        });

      } else if (msg.type === "patina:repatinate") {
        const settings = await P.settings.getSettings();
        const prev = await P.cache.getTheme(msg.domain, settings.aestheticId);
        await P.cache.deleteTheme(msg.domain, settings.aestheticId);
        const dig = await chrome.tabs.sendMessage(msg.tabId, { type: "patina:getDigest" });
        const envelope = await generate({
          domain: msg.domain, aestheticId: settings.aestheticId, digest: dig.digest,
          variationNotes: (prev && prev.envelope.notes) || "no summary recorded"
        });
        await chrome.tabs.sendMessage(msg.tabId, { type: "patina:apply", envelope });
        sendResponse({ ok: true });

      } else if (msg.type === "patina:injectHere") {
        await chrome.scripting.executeScript({ target: { tabId: msg.tabId }, files: CONTENT_SCRIPTS });
        sendResponse({ ok: true });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // keep the channel open for the async sendResponse
});
```

- [ ] **Step 2: Run the full test suite (regression)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Manual smoke test**

Reload the unpacked extension. In the service-worker DevTools console:
```js
chrome.runtime.sendMessage({ type: "patina:status", domain: "example.com" }, console.log)
```
Expected: `{siteState: "on", aestheticId: "superhighway", cached: false, generating: false, error: null, hasKey: false}` and no uncaught errors on load (importScripts resolved all eight modules).

- [ ] **Step 4: Commit**

```bash
git add background.js
git commit -m "feat: service worker with generation queue, message routing, dynamic registration"
```

---

### Task 14: Content orchestrator + first end-to-end run

**Files:**
- Create: `content/main.js`

**Interfaces:**
- Consumes: everything in `CONTENT_SCRIPTS` order (settings, cache, presets, digest, apply, widgets) and the background message protocol from Task 13.
- Produces: the page-side lifecycle — cache-hit instant apply; cache-miss base theme → digest → generate → apply; listeners for `patina:getDigest`, `patina:apply`, `patina:disable`.

- [ ] **Step 1: Write `content/main.js`**

```js
(() => {
  if (window.top !== window) return;      // skip iframes
  if (window.__patinaLoaded) return;      // guard double-injection (registered + on-demand)
  window.__patinaLoaded = true;

  const P = globalThis.Patina;

  function onReady(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn, { once: true });
  }

  function applyEnvelope(envelope) {
    P.apply.applyCss(document, envelope.css);
    onReady(() => {
      P.widgets.applyWidgets(document, envelope.widgets);
      P.apply.observeAndReassert(document);
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "patina:getDigest") {
      sendResponse({ digest: P.digest.capDigest(P.digest.buildDigest(document, window)) });
    } else if (msg.type === "patina:apply") {
      P.apply.clearPatina(document);
      applyEnvelope(msg.envelope);
    } else if (msg.type === "patina:disable") {
      P.apply.clearPatina(document);
    }
  });

  (async () => {
    const settings = await P.settings.getSettings();
    const host = P.settings.normalizeHost(location.hostname);
    if (P.settings.getSiteState(host, settings) !== "on") return;

    const aesthetic = P.presets.getAesthetic(settings.aestheticId, settings);
    if (!aesthetic) return;

    const cached = await P.cache.getTheme(host, aesthetic.id);
    if (cached) {
      applyEnvelope(cached.envelope);
      return;
    }

    if (aesthetic.baseCss) P.apply.applyCss(document, aesthetic.baseCss);

    onReady(async () => {
      const digest = P.digest.capDigest(P.digest.buildDigest(document, window));
      const res = await chrome.runtime.sendMessage({
        type: "patina:generate", domain: host, aestheticId: aesthetic.id, digest
      }).catch(() => null);
      if (res && res.ok) applyEnvelope(res.envelope);
      else if (res && res.error) console.warn("[patina]", res.error);
    });
  })();
})();
```

- [ ] **Step 2: Manual end-to-end test (the big one)**

1. Reload the unpacked extension.
2. Grant `<all_urls>` temporarily from the service-worker console (the options UI arrives in Task 16):
   ```js
   chrome.permissions.request({ origins: ["<all_urls>"] })
   ```
   Note: `permissions.request` needs a user gesture — if it throws, use `chrome://extensions` → Patina → Details → "Site access: On all sites" instead, then run `chrome.runtime.reload()`.
3. Set a real API key from the service-worker console:
   ```js
   Patina.settings.saveSettings({ provider: { type: "anthropic", baseUrl: "", model: "claude-opus-5", apiKey: "sk-ant-..." } })
   ```
4. Visit `https://en.wikipedia.org`. Expected: starfield base theme appears immediately; within ~5–20s the page restyles further (generated theme) and widgets appear.
5. Reload the page. Expected: full theme applies instantly (cache hit), no network call to the LLM (verify in the service-worker Network panel).
6. Visit a second Wikipedia article. Expected: instant (same domain, same cache entry).

- [ ] **Step 3: Run the full test suite (regression)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add content/main.js
git commit -m "feat: content orchestrator — instant cached themes, base-theme fallback, generation flow"
```

---

### Task 15: Popup

**Files:**
- Modify: `popup.html` (replace placeholder)
- Create: `popup.css`, `popup.js`

**Interfaces:**
- Consumes: `patina:status`, `patina:repatinate`, `patina:injectHere` from Task 13; `Patina.settings`, `Patina.presets`.
- Produces: user-facing controls — status line, aesthetic picker, Re-patinate, per-site toggle, "Patinate this page" (on-demand mode only), Options link.

- [ ] **Step 1: Write `popup.html`**

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><link rel="stylesheet" href="popup.css"></head>
<body>
  <h1>Patina</h1>
  <div id="site" class="site"></div>
  <div id="status" class="status"></div>
  <label class="field">Aesthetic
    <select id="aesthetic"></select>
  </label>
  <div class="row">
    <button id="patinate" hidden>Patinate this page</button>
    <button id="repatinate">&#9851; Re-patinate</button>
    <button id="toggleSite"></button>
  </div>
  <div id="error" class="error" hidden></div>
  <a href="#" id="openOptions">Options</a>
  <script src="common/settings.js"></script>
  <script src="common/presets.js"></script>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `popup.css`**

```css
body { width: 280px; font: 13px/1.5 system-ui, sans-serif; margin: 12px; }
h1 { font-size: 16px; margin: 0 0 6px; }
.site { font-weight: 600; }
.status { color: #555; margin: 4px 0 10px; }
.field { display: block; margin-bottom: 10px; }
select { width: 100%; margin-top: 2px; }
.row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
button { cursor: pointer; }
button:disabled { cursor: default; opacity: 0.5; }
.error { color: #b00020; margin-bottom: 8px; white-space: pre-wrap; }
```

- [ ] **Step 3: Write `popup.js`**

```js
const P = globalThis.Patina;
const $ = (id) => document.getElementById(id);

let tab = null;
let host = null;

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab && tab.url && /^https?:/.test(tab.url) ? new URL(tab.url) : null;
  host = url ? P.settings.normalizeHost(url.hostname) : null;
  $("site").textContent = host || "(unsupported page)";

  const settings = await P.settings.getSettings();
  const select = $("aesthetic");
  select.innerHTML = "";
  for (const a of [...P.presets.PRESETS, ...settings.customAesthetics]) {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.name;
    opt.selected = a.id === settings.aestheticId;
    select.appendChild(opt);
  }

  if (!host) {
    for (const id of ["patinate", "repatinate", "toggleSite"]) $(id).disabled = true;
    return;
  }

  const st = await chrome.runtime.sendMessage({ type: "patina:status", domain: host });
  const everywhere = await chrome.permissions.contains({ origins: ["<all_urls>"] });

  $("status").textContent =
    st.siteState === "denylisted" ? "This site is denylisted" :
    st.siteState === "off" ? "Patina is off here" :
    st.generating ? "Generating theme…" :
    !st.hasKey ? "No API key — open Options" :
    st.error ? "Last attempt failed" :
    st.cached ? "Themed (cached)" : "Not yet themed";

  if (st.error) { $("error").hidden = false; $("error").textContent = st.error; }

  $("patinate").hidden = everywhere || st.siteState !== "on";
  $("repatinate").disabled = st.siteState !== "on" || !st.hasKey || st.generating;
  $("toggleSite").textContent = st.siteState === "off" ? "Enable on this site" : "Disable on this site";
  $("toggleSite").disabled = st.siteState === "denylisted";
}

$("aesthetic").addEventListener("change", async (e) => {
  await P.settings.saveSettings({ aestheticId: e.target.value });
  if (tab) chrome.tabs.reload(tab.id);
  window.close();
});

$("repatinate").addEventListener("click", async () => {
  $("repatinate").disabled = true;
  $("status").textContent = "Generating theme…";
  const res = await chrome.runtime.sendMessage({ type: "patina:repatinate", domain: host, tabId: tab.id });
  if (res.ok) window.close();
  else { $("error").hidden = false; $("error").textContent = res.error; $("repatinate").disabled = false; }
});

$("toggleSite").addEventListener("click", async () => {
  const settings = await P.settings.getSettings();
  const current = settings.siteOverrides[host] === "off" ? "on" : "off";
  await P.settings.saveSettings({ siteOverrides: { ...settings.siteOverrides, [host]: current } });
  chrome.tabs.reload(tab.id);
  window.close();
});

$("patinate").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "patina:injectHere", tabId: tab.id });
  window.close();
});

$("openOptions").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

init();
```

- [ ] **Step 4: Manual verification**

Reload the extension. On the Wikipedia tab from Task 14: popup shows "Themed (cached)", aesthetic picker lists all seven presets, Re-patinate is enabled. Click **Re-patinate** → popup shows "Generating theme…", closes on success, and the page's theme visibly changes direction without a reload. Click **Disable on this site** → page reloads un-themed; popup now shows "Patina is off here" with "Enable on this site". On a `chrome://` page, the popup shows "(unsupported page)" with buttons disabled.

- [ ] **Step 5: Commit**

```bash
git add popup.html popup.css popup.js
git commit -m "feat: popup with status, aesthetic picker, re-patinate, and per-site toggle"
```

---

### Task 16: Options page

**Files:**
- Modify: `options.html` (replace placeholder)
- Create: `options.css`, `options.js`

**Interfaces:**
- Consumes: `Patina.settings`, `Patina.cache`, `Patina.presets`; `chrome.permissions` for the Enable-everywhere toggle (Task 13's permission listeners handle content-script (un)registration automatically).
- Produces: provider/model/key config, Enable-everywhere toggle, global on/off, denylist editor, custom-aesthetic creator, cache viewer.

- [ ] **Step 1: Write `options.html`**

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Patina Options</title><link rel="stylesheet" href="options.css"></head>
<body>
  <h1>Patina Options</h1>

  <section>
    <h2>Coverage</h2>
    <label><input type="checkbox" id="enabled"> Patina enabled (global)</label>
    <label><input type="checkbox" id="everywhere"> Enable everywhere (grants access to all sites)</label>
    <p class="hint">Without "everywhere", use the popup's "Patinate this page" button per site.</p>
  </section>

  <section>
    <h2>LLM Provider</h2>
    <label>Provider
      <select id="providerType">
        <option value="anthropic">Anthropic</option>
        <option value="openai">OpenAI-compatible</option>
      </select>
    </label>
    <label id="baseUrlField" hidden>Base URL <input type="text" id="baseUrl" placeholder="https://api.openai.com/v1"></label>
    <label>Model <input type="text" id="model" placeholder="claude-opus-5"></label>
    <p class="hint" id="modelHint">Anthropic: claude-opus-5 (best) or claude-haiku-4-5 (fast/cheap).</p>
    <label>API key <input type="password" id="apiKey"></label>
    <button id="saveProvider">Save provider</button>
    <span id="providerSaved" class="saved" hidden>Saved ✓</span>
  </section>

  <section>
    <h2>Custom aesthetics</h2>
    <label>Name <input type="text" id="customName" placeholder="Cottagecore"></label>
    <label>Describe it <textarea id="customSpec" rows="4"
      placeholder="Soft floral palette, hand-drawn borders, serif type, pressed-flower dividers..."></textarea></label>
    <button id="addCustom">Add aesthetic</button>
    <ul id="customList"></ul>
  </section>

  <section>
    <h2>Denylist</h2>
    <p class="hint">One pattern per line. "*.gov" matches a suffix; "chase.com" matches the domain and subdomains.</p>
    <textarea id="denylist" rows="8"></textarea>
    <button id="saveDenylist">Save denylist</button>
    <span id="denylistSaved" class="saved" hidden>Saved ✓</span>
  </section>

  <section>
    <h2>Cached themes</h2>
    <table id="cacheTable">
      <thead><tr><th>Site</th><th>Aesthetic</th><th>Size</th><th>Generated</th><th></th></tr></thead>
      <tbody></tbody>
    </table>
  </section>

  <script src="common/settings.js"></script>
  <script src="common/cache.js"></script>
  <script src="common/presets.js"></script>
  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `options.css`**

```css
body { max-width: 640px; margin: 24px auto; font: 14px/1.6 system-ui, sans-serif; padding: 0 16px; }
section { border: 1px solid #ddd; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
h1 { font-size: 20px; } h2 { font-size: 15px; margin-top: 0; }
label { display: block; margin: 8px 0; }
input[type="text"], input[type="password"], textarea { width: 100%; box-sizing: border-box; }
.hint { color: #666; font-size: 12px; }
.saved { color: #0a7a0a; margin-left: 8px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #eee; font-size: 13px; }
```

- [ ] **Step 3: Write `options.js`**

```js
const P = globalThis.Patina;
const $ = (id) => document.getElementById(id);

function flash(id) { const el = $(id); el.hidden = false; setTimeout(() => { el.hidden = true; }, 1500); }
function slugify(name) { return "custom-" + name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

async function render() {
  const settings = await P.settings.getSettings();

  $("enabled").checked = settings.enabled;
  $("everywhere").checked = await chrome.permissions.contains({ origins: ["<all_urls>"] });

  $("providerType").value = settings.provider.type;
  $("baseUrl").value = settings.provider.baseUrl;
  $("model").value = settings.provider.model;
  $("apiKey").value = settings.provider.apiKey;
  $("baseUrlField").hidden = settings.provider.type !== "openai";

  $("denylist").value = settings.denylist.join("\n");

  const list = $("customList");
  list.innerHTML = "";
  for (const c of settings.customAesthetics) {
    const li = document.createElement("li");
    li.textContent = c.name + " ";
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.addEventListener("click", async () => {
      await P.settings.saveSettings({ customAesthetics: settings.customAesthetics.filter((x) => x.id !== c.id) });
      render();
    });
    li.appendChild(del);
    list.appendChild(li);
  }

  const tbody = $("cacheTable").querySelector("tbody");
  tbody.innerHTML = "";
  for (const t of await P.cache.listThemes()) {
    const tr = document.createElement("tr");
    const aesthetic = P.presets.getAesthetic(t.aestheticId, settings);
    tr.innerHTML = `<td>${t.domain}</td><td>${aesthetic ? aesthetic.name : t.aestheticId}</td>` +
      `<td>${Math.round((t.record.meta.size || 0) / 1024)}KB</td>` +
      `<td>${new Date(t.record.meta.createdAt).toLocaleDateString()}</td>`;
    const td = document.createElement("td");
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.addEventListener("click", async () => { await P.cache.deleteTheme(t.domain, t.aestheticId); render(); });
    td.appendChild(del);
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

$("enabled").addEventListener("change", async (e) => { await P.settings.saveSettings({ enabled: e.target.checked }); });

$("everywhere").addEventListener("change", async (e) => {
  if (e.target.checked) {
    const granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
    e.target.checked = granted; // background's onAdded listener registers content scripts
  } else {
    await chrome.permissions.remove({ origins: ["<all_urls>"] }); // onRemoved unregisters
  }
});

$("providerType").addEventListener("change", (e) => {
  $("baseUrlField").hidden = e.target.value !== "openai";
  $("modelHint").textContent = e.target.value === "anthropic"
    ? "Anthropic: claude-opus-5 (best) or claude-haiku-4-5 (fast/cheap)."
    : "Any model id your endpoint serves, e.g. gpt-4o or llama3.";
});

$("saveProvider").addEventListener("click", async () => {
  await P.settings.saveSettings({
    provider: {
      type: $("providerType").value,
      baseUrl: $("baseUrl").value.trim(),
      model: $("model").value.trim(),
      apiKey: $("apiKey").value.trim()
    }
  });
  flash("providerSaved");
});

$("addCustom").addEventListener("click", async () => {
  const name = $("customName").value.trim();
  const spec = $("customSpec").value.trim();
  if (!name || !spec) return;
  const settings = await P.settings.getSettings();
  const id = slugify(name);
  if (settings.customAesthetics.some((c) => c.id === id) || P.presets.getAesthetic(id, settings)) return;
  await P.settings.saveSettings({ customAesthetics: [...settings.customAesthetics, { id, name, spec }] });
  $("customName").value = ""; $("customSpec").value = "";
  render();
});

$("saveDenylist").addEventListener("click", async () => {
  const denylist = $("denylist").value.split("\n").map((s) => s.trim()).filter(Boolean);
  await P.settings.saveSettings({ denylist });
  flash("denylistSaved");
});

render();
```

- [ ] **Step 4: Manual verification**

Open the options page. Enter your Anthropic key + model, Save → "Saved ✓". Toggle **Enable everywhere** → Chrome shows the permission prompt; accept; toggle stays checked (and `chrome://extensions` shows site access "On all sites"). Add a custom aesthetic ("Cottagecore" + description) → it appears in the list and in the popup's aesthetic picker. The cache table lists the Wikipedia theme from Task 14 with a working Delete. Add `wikipedia.org` to the denylist, save, reload Wikipedia → un-themed; popup says "This site is denylisted"; remove it again.

- [ ] **Step 5: Commit**

```bash
git add options.html options.css options.js
git commit -m "feat: options page — provider config, everywhere toggle, customs, denylist, cache viewer"
```

---

### Task 17: End-to-end QA pass and README

**Files:**
- Create: `README.md`
- Create: `docs/qa-checklist.md`

**Interfaces:**
- Consumes: the whole extension.
- Produces: repeatable QA script + user-facing documentation (including the privacy disclosure required for any future store listing).

- [ ] **Step 1: Write `docs/qa-checklist.md`**

```markdown
# Patina QA Checklist

Run after any significant change. Prereqs: unpacked install, Anthropic key configured, "Enable everywhere" ON unless a step says otherwise.

## Test sites
- https://en.wikipedia.org — classic semantic HTML
- https://news.ycombinator.com — table layout
- https://tailwindcss.com — utility-class CSS
- https://www.youtube.com — SPA navigation

## First-visit flow
- [ ] New domain: base theme appears immediately (no flash of the original site)
- [ ] Generated theme + widgets apply within ~30s without reload
- [ ] Service-worker console shows no errors

## Cache behavior
- [ ] Reload: full theme applies instantly; no LLM network request
- [ ] Second page on same domain: instant, no generation
- [ ] Switching aesthetic and back: both directions instant after first generation each

## Re-patinate
- [ ] Popup → Re-patinate: new theme visibly different direction, applied without reload
- [ ] Cache viewer shows updated generation date

## Controls
- [ ] Per-site disable → reload un-themed; re-enable restores cached theme
- [ ] Global toggle off → nothing themes anywhere
- [ ] Denylist: add a test domain → un-themed + popup says denylisted; *.gov never themes
- [ ] No API key: base themes still apply; popup says "No API key — open Options"

## On-demand mode
- [ ] Options → "Enable everywhere" OFF → new sites load un-themed
- [ ] Popup → "Patinate this page" themes the current tab only

## SPA behavior (YouTube)
- [ ] Theme survives in-app navigation (style element re-asserted)

## Custom aesthetics
- [ ] Create one via options; select in popup; site generates and caches under it

## Sanitizer spot-check
- [ ] Options cache viewer: inspect a cached entry via service-worker console
      (`Patina.cache.listThemes().then(console.log)`) — css contains no `@import` and no non-`data:` `url(`
```

- [ ] **Step 2: Write `README.md`**

```markdown
# Patina

Restyles the web to match your aesthetic. Pick a patina — Terminal, 8-bit,
Information Superhighway, Psychedelic, Enterprise (LCARS), Soviet, Murica, or
one you invent — and every site gets the finish.

An LLM generates a site-specific theme (CSS + retro widget placements) the
first time you visit a site; Patina caches it permanently, so every later
visit is instant, consistent, and free. Don't like the result? One click
re-patinates the site in a different direction.

## Install (developer mode)

1. `chrome://extensions` → enable Developer mode → Load unpacked → this folder.
2. Open Patina's Options: pick a provider (Anthropic or any OpenAI-compatible
   endpoint), paste your API key, choose a model.
3. Toggle "Enable everywhere" (or use the popup's "Patinate this page" per site).

## How it works

- Content scripts apply cached themes at document_start; a service worker owns
  LLM calls, validation, CSS sanitization, and the per-(site, aesthetic) cache.
- The LLM only ever produces data (CSS + widget JSON). All executable code
  ships in this package (MV3 remote-code compliant).
- Generated CSS is sanitized before it ever touches a page: no @import, no
  external url() (data: URIs only), no full-viewport fixed overlays, 50KB cap.

## Privacy

- Your API key is stored locally (`chrome.storage.local`) and sent only to the
  provider you configured.
- On first visit to a site, a small structural digest of the page (landmark
  tags, common class names, a few computed colors/fonts, page title) is sent
  to your configured LLM provider to generate the theme. Page text and form
  content are never included.
- Banking/health/government sites are denylisted by default (editable).

## Development

- No build step. Tests: `npm test` (Node ≥ 18.13, uses `node --test`).
- Spec: `docs/superpowers/specs/2026-08-12-patina-design.md`
- QA: `docs/qa-checklist.md`
```

- [ ] **Step 3: Execute the QA checklist**

Run every item in `docs/qa-checklist.md` against the four test sites. Fix anything that fails before proceeding (each fix is its own commit). Expected: all boxes check.

- [ ] **Step 4: Run the full test suite one last time**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/qa-checklist.md
git commit -m "docs: README with privacy disclosure and repeatable QA checklist"
```
