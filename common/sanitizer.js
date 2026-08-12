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
      const zeroOffsets = ["top", "right", "bottom", "left"].filter((side) =>
        new RegExp(side + "\\s*:\\s*0(px|%)?\\s*(;|$)", "i").test(body)
      ).length;
      const covers = /(100vw|100vh|inset\s*:\s*0)/i.test(body) ||
        (/width\s*:\s*100%/i.test(body) && /height\s*:\s*100%/i.test(body)) ||
        zeroOffsets === 4;
      return fixed && covers ? drop(rule) : rule;
    });

    return { ok: true, css: css.trim(), removed };
  }

  return { MAX_CSS_BYTES, sanitizeCss };
});
