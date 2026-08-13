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
  assert.equal(await cache.getTheme("example.com", "psychedelic"), null); // different aesthetic = different key
  await cache.deleteTheme("example.com", "terminal");
  assert.equal(await cache.getTheme("example.com", "terminal"), null);
});

test("listThemes returns only theme entries, parsed", async () => {
  await chrome.storage.local.set({ settings: { junk: true } });
  await cache.putTheme("a.com", "terminal", record);
  await cache.putTheme("b.com", "psychedelic", record);
  const list = await cache.listThemes();
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((t) => t.domain).sort(), ["a.com", "b.com"]);
  assert.deepEqual(list.map((t) => t.aestheticId).sort(), ["psychedelic", "terminal"]);
});
