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
      const win = doc.defaultView;
      if (win.__patinaSparkles) return;
      win.__patinaSparkles = true;
      let last = 0;
      win.__patinaSparkleHandler = (e) => {
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
      };
      doc.addEventListener("mousemove", win.__patinaSparkleHandler, { passive: true });
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
        if (fn) Promise.resolve(fn({ doc, widget: w })).catch((e) => {
          console.warn("[patina] widget failed:", w.type, e);
        });
      } catch (e) {
        console.warn("[patina] widget failed:", w.type, e);
      }
    }
  }

  return { applyWidgets };
});
