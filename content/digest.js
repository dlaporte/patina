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

  // Machine-generated class names (CSS modules, Facebook-style hashes) are useless
  // as theming selectors. Heuristic: no word separators AND (contains a digit, or is
  // long and nearly vowel-free). "sidebar"/"mt-4"/"card__header" pass; "x1n2onr6" doesn't.
  function looksMinified(name) {
    if (/[-_]/.test(name)) return false;
    if (/\d/.test(name)) return true;
    return name.length >= 8 && (name.match(/[aeiou]/g) || []).length <= 2;
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

    const minifiedCount = topClasses.filter((c) => looksMinified(c.name)).length;

    return {
      title: doc.title || "",
      host: win.location ? win.location.hostname : "",
      landmarks,
      topClasses,
      styles,
      darkMode: isDarkColor(styles.body && styles.body["background-color"]),
      classesLookMinified: topClasses.length > 0 && minifiedCount / topClasses.length > 0.4
    };
  }

  function capDigest(digest, maxBytes = 4096) {
    const d = { ...digest, topClasses: [...(digest.topClasses || [])] };
    while (JSON.stringify(d).length > maxBytes && d.topClasses.length > 5) {
      d.topClasses = d.topClasses.slice(0, Math.max(5, Math.floor(d.topClasses.length / 2)));
    }
    return d;
  }

  return { buildDigest, isDarkColor, looksMinified, capDigest };
});
