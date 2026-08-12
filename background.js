importScripts(
  "common/settings.js", "common/cache.js", "common/sanitizer.js",
  "common/envelope.js", "common/presets.js",
  "llm/prompt.js", "llm/anthropic.js", "llm/openai.js"
);

const P = globalThis.Patina;

const CONTENT_SCRIPTS = [
  "common/settings.js", "common/cache.js", "common/presets.js",
  "content/digest.js", "content/apply.js", "content/widgets.js", "content/main.js"
];

const inFlight = new Map(); // themeKey -> Promise<envelope>
const lastError = new Map(); // themeKey -> string

// --- Content-script registration (everywhere-automatic mode) ---
async function ensureRegistered() {
  const granted = await chrome.permissions.contains({ origins: ["<all_urls>"] });
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: ["patina"] }).catch(() => []);
  if (granted && existing.length === 0) {
    await chrome.scripting.registerContentScripts([{
      id: "patina",
      matches: ["<all_urls>"],
      js: CONTENT_SCRIPTS,
      runAt: "document_start",
      persistAcrossSessions: true
    }]);
  } else if (!granted && existing.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: ["patina"] }).catch(() => {});
  }
}
chrome.runtime.onInstalled.addListener(ensureRegistered);
chrome.runtime.onStartup.addListener(ensureRegistered);
chrome.permissions.onAdded.addListener(ensureRegistered);
chrome.permissions.onRemoved.addListener(ensureRegistered);

// --- Generation pipeline ---
async function generate({ domain, aestheticId, digest, variationNotes }) {
  const key = P.cache.themeKey(domain, aestheticId);
  if (inFlight.has(key)) return inFlight.get(key);

  const job = (async () => {
    const cached = await P.cache.getTheme(domain, aestheticId);
    if (cached && !variationNotes) return cached.envelope; // raced another tab

    const settings = await P.settings.getSettings();
    const aesthetic = P.presets.getAesthetic(aestheticId, settings);
    if (!aesthetic) throw new Error("Unknown aesthetic: " + aestheticId);
    if (!settings.provider.apiKey) throw new Error("No API key configured (open Options)");

    const system = P.prompt.buildSystemPrompt(aesthetic);
    const user = P.prompt.buildUserMessage(digest, { previousNotes: variationNotes });

    const envelope = settings.provider.type === "anthropic"
      ? await P.llm.anthropic.generateTheme({
          apiKey: settings.provider.apiKey, model: settings.provider.model,
          system, user, schema: P.prompt.ENVELOPE_SCHEMA
        })
      : await P.llm.openai.generateTheme({
          apiKey: settings.provider.apiKey, baseUrl: settings.provider.baseUrl,
          model: settings.provider.model, system, user
        });

    const check = P.envelope.validateEnvelope(envelope);
    if (!check.ok) throw new Error("Invalid envelope: " + check.errors.join("; "));
    const clean = P.sanitizer.sanitizeCss(envelope.css);
    if (!clean.ok) throw new Error("CSS rejected: " + clean.reason);
    envelope.css = clean.css;

    await P.cache.putTheme(domain, aestheticId, {
      envelope,
      meta: {
        provider: settings.provider.type, model: settings.provider.model,
        createdAt: Date.now(), size: envelope.css.length
      }
    });
    return envelope;
  })();

  inFlight.set(key, job);
  lastError.delete(key);
  try {
    return await job;
  } catch (e) {
    lastError.set(key, e.message);
    throw e;
  } finally {
    inFlight.delete(key);
  }
}

// --- Message routing ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "patina:generate") {
        const envelope = await generate(msg);
        sendResponse({ ok: true, envelope });

      } else if (msg.type === "patina:status") {
        const settings = await P.settings.getSettings();
        const key = P.cache.themeKey(msg.domain, settings.aestheticId);
        sendResponse({
          siteState: P.settings.getSiteState(msg.domain, settings),
          aestheticId: settings.aestheticId,
          cached: !!(await P.cache.getTheme(msg.domain, settings.aestheticId)),
          generating: inFlight.has(key),
          error: lastError.get(key) || null,
          hasKey: !!settings.provider.apiKey
        });

      } else if (msg.type === "patina:repatinate") {
        const settings = await P.settings.getSettings();
        const prev = await P.cache.getTheme(msg.domain, settings.aestheticId);
        await P.cache.deleteTheme(msg.domain, settings.aestheticId);
        const dig = await chrome.tabs.sendMessage(msg.tabId, { type: "patina:getDigest" });
        const envelope = await generate({
          domain: msg.domain, aestheticId: settings.aestheticId, digest: dig.digest,
          variationNotes: (prev && prev.envelope.notes) || "no summary recorded"
        });
        await chrome.tabs.sendMessage(msg.tabId, { type: "patina:apply", envelope });
        sendResponse({ ok: true });

      } else if (msg.type === "patina:injectHere") {
        await chrome.scripting.executeScript({ target: { tabId: msg.tabId }, files: CONTENT_SCRIPTS });
        sendResponse({ ok: true });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // keep the channel open for the async sendResponse
});
