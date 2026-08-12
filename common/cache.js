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
