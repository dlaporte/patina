(() => {
  if (window.top !== window) return;      // skip iframes
  if (window.__patinaLoaded) {
    // Already injected (registered + on-demand overlap, or a repeat Apply):
    // don't re-register listeners, but do re-run the theming lifecycle so a
    // newly selected patina takes effect.
    if (typeof window.__patinaRun === "function") window.__patinaRun();
    return;
  }
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
      P.apply.clearPatina(document); // also lifts the curtain (it carries data-patina)
      applyEnvelope(msg.envelope);
    } else if (msg.type === "patina:showCurtain") {
      (async () => {
        const settings = await P.settings.getSettings();
        if (!settings.interstitial) return;
        const aesthetic = P.presets.getAesthetic(settings.aestheticId, settings);
        if (aesthetic) P.curtain.show(document, aesthetic);
      })();
    } else if (msg.type === "patina:hideCurtain") {
      P.curtain.hide(document);
    } else if (msg.type === "patina:disable") {
      P.apply.clearPatina(document);
    }
  });

  window.__patinaRun = async () => {
    const settings = await P.settings.getSettings();
    const host = P.settings.normalizeHost(location.hostname);
    if (P.settings.getSiteState(host, settings) !== "on") { P.apply.clearPatina(document); return; }

    const aesthetic = P.presets.getAesthetic(settings.aestheticId, settings);
    if (!aesthetic) return;

    // A re-run may be switching patinas: sweep the previous theme/widgets first
    // (no-op on a fresh page).
    P.apply.clearPatina(document);

    const cached = await P.cache.getTheme(host, aesthetic.id);
    if (cached) {
      applyEnvelope(cached.envelope);
      return;
    }

    if (aesthetic.baseCss) P.apply.applyCss(document, aesthetic.baseCss);

    // First visit: cover the page with the patina's interstitial while the theme
    // generates. The curtain self-lifts on timeout and is skippable; we lift it
    // here on completion or failure so the reveal is always fully themed.
    const useCurtain = settings.interstitial && !!settings.provider.apiKey;
    if (useCurtain) P.curtain.show(document, aesthetic);

    onReady(async () => {
      try {
        const digest = P.digest.capDigest(P.digest.buildDigest(document, window));
        const res = await chrome.runtime.sendMessage({
          type: "patina:generate", domain: host, aestheticId: aesthetic.id, digest
        }).catch((e) => { console.warn("[patina] generate request failed:", e && e.message); return null; });
        if (res && res.ok) applyEnvelope(res.envelope);
        else if (res && res.error) console.warn("[patina]", res.error);
      } finally {
        if (useCurtain) P.curtain.hide(document);
      }
    });
  };
  window.__patinaRun();
})();
