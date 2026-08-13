const P = globalThis.Patina;
const $ = (id) => document.getElementById(id);

function flash(id) { const el = $(id); el.hidden = false; setTimeout(() => { el.hidden = true; }, 1500); }
function slugify(name) { return "custom-" + name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

// Each preset maps a user-facing provider to an adapter type + its API base URL.
// lockBase: the Anthropic adapter hardcodes its endpoint, so the URL is display-only.
const PROVIDER_PRESETS = {
  anthropic: { type: "anthropic", baseUrl: "https://api.anthropic.com/v1", lockBase: true,
    modelPlaceholder: "claude-opus-5",
    hint: "claude-opus-5 (best) or claude-haiku-4-5 (fast/cheap)." },
  openai: { type: "openai", baseUrl: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4o",
    hint: "Any OpenAI model id." },
  openrouter: { type: "openai", baseUrl: "https://openrouter.ai/api/v1",
    modelPlaceholder: "anthropic/claude-sonnet-4.5",
    hint: "Any OpenRouter model path (provider/model)." },
  ollama: { type: "openai", baseUrl: "http://localhost:11434/v1",
    modelPlaceholder: "llama3",
    hint: "A locally pulled model. The API key can be anything." },
  custom: { type: "openai", baseUrl: "",
    modelPlaceholder: "model-id",
    hint: "Any OpenAI-compatible endpoint and the model id it serves." }
};

function inferPreset(provider) {
  if (PROVIDER_PRESETS[provider.preset]) return provider.preset;
  if (provider.type === "anthropic") return "anthropic";
  const match = Object.entries(PROVIDER_PRESETS)
    .find(([, p]) => p.type === "openai" && p.baseUrl && p.baseUrl === provider.baseUrl);
  if (match) return match[0];
  return provider.baseUrl ? "custom" : "openai";
}

function applyPresetUI(presetId, storedBaseUrl) {
  const p = PROVIDER_PRESETS[presetId] || PROVIDER_PRESETS.custom;
  $("baseUrl").value = p.lockBase ? p.baseUrl : (storedBaseUrl != null ? storedBaseUrl : p.baseUrl);
  $("baseUrl").disabled = !!p.lockBase;
  $("model").placeholder = p.modelPlaceholder;
  $("modelHint").textContent = p.hint;
}

async function render() {
  const settings = await P.settings.getSettings();

  $("enabled").checked = settings.enabled;
  $("everywhere").checked = await chrome.permissions.contains({ origins: ["<all_urls>"] });

  const presetId = inferPreset(settings.provider);
  $("providerType").value = presetId;
  applyPresetUI(presetId, settings.provider.baseUrl || null);
  $("model").value = settings.provider.model;
  $("apiKey").value = settings.provider.apiKey;

  $("denylist").value = settings.denylist.join("\n");

  const list = $("customList");
  list.innerHTML = "";
  for (const c of settings.customAesthetics) {
    const li = document.createElement("li");
    li.textContent = c.name + " ";
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.addEventListener("click", async () => {
      await P.settings.saveSettings({ customAesthetics: settings.customAesthetics.filter((x) => x.id !== c.id) });
      render();
    });
    li.appendChild(del);
    list.appendChild(li);
  }

  const tbody = $("cacheTable").querySelector("tbody");
  tbody.innerHTML = "";
  for (const t of await P.cache.listThemes()) {
    const tr = document.createElement("tr");
    const aesthetic = P.presets.getAesthetic(t.aestheticId, settings);
    for (const text of [
      t.domain,
      aesthetic ? aesthetic.name : t.aestheticId,
      `${Math.round((t.record.meta.size || 0) / 1024)}KB`,
      new Date(t.record.meta.createdAt).toLocaleDateString()
    ]) {
      const cell = document.createElement("td");
      cell.textContent = text;
      tr.appendChild(cell);
    }
    const td = document.createElement("td");
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.addEventListener("click", async () => { await P.cache.deleteTheme(t.domain, t.aestheticId); render(); });
    td.appendChild(del);
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

$("enabled").addEventListener("change", async (e) => { await P.settings.saveSettings({ enabled: e.target.checked }); });

$("everywhere").addEventListener("change", async (e) => {
  if (e.target.checked) {
    const granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
    e.target.checked = granted; // background's onAdded listener registers content scripts
  } else {
    await chrome.permissions.remove({ origins: ["<all_urls>"] }); // onRemoved unregisters
  }
});

$("providerType").addEventListener("change", (e) => {
  applyPresetUI(e.target.value, null);
});

$("saveProvider").addEventListener("click", async () => {
  const presetId = $("providerType").value;
  const p = PROVIDER_PRESETS[presetId] || PROVIDER_PRESETS.custom;
  await P.settings.saveSettings({
    provider: {
      preset: presetId,
      type: p.type,
      baseUrl: p.lockBase ? "" : $("baseUrl").value.trim(),
      model: $("model").value.trim() || p.modelPlaceholder,
      apiKey: $("apiKey").value.trim()
    }
  });
  flash("providerSaved");
});

$("addCustom").addEventListener("click", async () => {
  const name = $("customName").value.trim();
  const spec = $("customSpec").value.trim();
  if (!name || !spec) return;
  const settings = await P.settings.getSettings();
  const id = slugify(name);
  if (settings.customAesthetics.some((c) => c.id === id) || P.presets.getAesthetic(id, settings)) return;
  await P.settings.saveSettings({ customAesthetics: [...settings.customAesthetics, { id, name, spec }] });
  $("customName").value = ""; $("customSpec").value = "";
  render();
});

$("saveDenylist").addEventListener("click", async () => {
  const denylist = $("denylist").value.split("\n").map((s) => s.trim()).filter(Boolean);
  await P.settings.saveSettings({ denylist });
  flash("denylistSaved");
});

render();
