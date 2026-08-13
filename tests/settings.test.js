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

test("saveSettings deep-merges provider and siteOverrides patches", async () => {
  await S.saveSettings({ provider: { type: "anthropic", baseUrl: "", model: "claude-opus-5", apiKey: "sk-1" } });
  await S.saveSettings({ provider: { apiKey: "sk-2" } });
  let s = await S.getSettings();
  assert.equal(s.provider.apiKey, "sk-2");
  assert.equal(s.provider.model, "claude-opus-5");

  await S.saveSettings({ siteOverrides: { "a.com": "off" } });
  await S.saveSettings({ siteOverrides: { "b.com": "off" } });
  s = await S.getSettings();
  assert.equal(s.siteOverrides["a.com"], "off");
  assert.equal(s.siteOverrides["b.com"], "off");
});

test("patinating curtain defaults on", () => {
  assert.equal(S.DEFAULTS.interstitial, true);
});
