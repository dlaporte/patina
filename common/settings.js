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
    interstitial: true,
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
    const current = await getSettings();
    const next = Object.assign({}, current, patch);
    if (patch && patch.provider) next.provider = Object.assign({}, current.provider, patch.provider);
    if (patch && patch.siteOverrides) next.siteOverrides = Object.assign({}, current.siteOverrides, patch.siteOverrides);
    await chrome.storage.local.set({ settings: next });
    return next;
  }

  return { DEFAULTS, DEFAULT_DENYLIST, normalizeHost, isDenylisted, getSiteState, getSettings, saveSettings };
});
