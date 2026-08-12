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
