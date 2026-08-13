(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.curtain = mod;
})(globalThis, function () {
  const CURTAIN_ID = "patina-curtain";
  const DEFAULT_TIMEOUT_MS = 15000;

  // Per-patina interstitial looks. Anything not listed (customs) gets the brand default.
  const LOOKS = {
    superhighway: { bg: "#000018", asset: "stars", color: "#66ccff", accent: "#ffff66",
      font: '"Comic Sans MS", "Comic Sans", cursive', title: "Entering the Information Superhighway" },
    terminal: { bg: "#050805", asset: "scanlines", color: "#33ff33", accent: "#ffb000",
      font: '"Courier New", monospace', title: "PATINATING" },
    "8bit": { bg: "#0a0a0a", color: "#ffffff", accent: "#f1c40f",
      font: '"Courier New", monospace', title: "NOW LOADING" },
    psychedelic: { bg: "#4a148c", asset: "tiedye", color: "#ffffff", accent: "#ffb340",
      font: '"Cooper Black", Georgia, serif', title: "Getting groovy" },
    enterprise: { bg: "#000000", color: "#ff9c00", accent: "#ff9966",
      font: '"Arial Narrow", "Helvetica Neue", sans-serif', title: "WORKING · APPLYING PATINA 47291.3" },
    soviet: { bg: "#f2e8d5", color: "#cc2222", accent: "#1a1a1a",
      font: 'Impact, "Arial Narrow", sans-serif', title: "ПАТИНИРОВАНИЕ" },
    murica: { bg: "#3c3b6e", color: "#ffffff", accent: "#b22234",
      font: 'Impact, "Arial Black", sans-serif', title: "FREEDOM LOADING ★" }
  };
  const DEFAULT_LOOK = { bg: "#f2ead9", color: "#8a5426", accent: "#2e8f80",
    font: "Georgia, serif", title: "Patinating" };

  function show(doc, aesthetic, opts = {}) {
    if (doc.getElementById(CURTAIN_ID)) return;
    globalThis.Patina.apply.injectAssetTokens(doc);
    const win = doc.defaultView;
    const look = LOOKS[aesthetic.id] || DEFAULT_LOOK;

    const style = doc.createElement("style");
    style.setAttribute("data-patina", "curtain-css");
    style.textContent = `
#${CURTAIN_ID} { position: fixed; inset: 0; z-index: 2147483647; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px; background-color: ${look.bg};
  ${look.asset ? `background-image: var(--patina-asset-${look.asset});` : ""} }
#${CURTAIN_ID} .pc-title { font-family: ${look.font}; color: ${look.color}; font-size: 30px; text-align: center; padding: 0 24px; }
#${CURTAIN_ID} .pc-dots { color: ${look.accent}; font-size: 26px; letter-spacing: 8px; }
#${CURTAIN_ID} .pc-dots span { animation: patina-curtain-dot 1.2s infinite; }
#${CURTAIN_ID} .pc-dots span:nth-child(2) { animation-delay: 0.2s; }
#${CURTAIN_ID} .pc-dots span:nth-child(3) { animation-delay: 0.4s; }
#${CURTAIN_ID} .pc-sub { font: 12px/1.4 monospace; color: ${look.color}; opacity: 0.75; text-align: center; padding: 0 24px; }
#${CURTAIN_ID} .pc-skip { margin-top: 20px; font: 12px monospace; color: ${look.color};
  background: transparent; border: 1px solid ${look.color}; border-radius: 3px; padding: 5px 14px; cursor: pointer; opacity: 0.85; }
@keyframes patina-curtain-dot { 0%, 60%, 100% { opacity: 0.2; } 30% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { #${CURTAIN_ID} .pc-dots span { animation: none; } }`;

    const wrap = doc.createElement("div");
    wrap.id = CURTAIN_ID;
    wrap.setAttribute("data-patina", "curtain");

    const title = doc.createElement("div");
    title.className = "pc-title";
    title.textContent = look.title;

    const dots = doc.createElement("div");
    dots.className = "pc-dots";
    dots.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 3; i++) {
      const d = doc.createElement("span");
      d.textContent = "●";
      dots.appendChild(d);
    }

    const sub = doc.createElement("div");
    sub.className = "pc-sub";
    sub.textContent = `applying ${aesthetic.name} to ${win.location.hostname}`;

    const skip = doc.createElement("button");
    skip.className = "pc-skip";
    skip.textContent = "Show the page now";
    skip.addEventListener("click", () => hide(doc));

    wrap.append(title, dots, sub, skip);
    (doc.head || doc.documentElement).appendChild(style);
    // body doesn't exist yet at document_start; documentElement renders fine
    (doc.body || doc.documentElement).appendChild(wrap);

    win.__patinaCurtainTimer = setTimeout(() => hide(doc), opts.timeoutMs || DEFAULT_TIMEOUT_MS);
  }

  function hide(doc) {
    const win = doc.defaultView;
    if (win && win.__patinaCurtainTimer) { clearTimeout(win.__patinaCurtainTimer); win.__patinaCurtainTimer = null; }
    const el = doc.getElementById(CURTAIN_ID);
    if (el) el.remove();
    for (const s of [...doc.querySelectorAll("[data-patina='curtain-css']")]) s.remove();
  }

  return { CURTAIN_ID, LOOKS, show, hide };
});
