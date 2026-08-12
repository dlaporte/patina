const P = globalThis.Patina;
const $ = (id) => document.getElementById(id);

function flash(id) { const el = $(id); el.hidden = false; setTimeout(() => { el.hidden = true; }, 1500); }
function slugify(name) { return "custom-" + name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

async function render() {
  const settings = await P.settings.getSettings();

  $("enabled").checked = settings.enabled;
  $("everywhere").checked = await chrome.permissions.contains({ origins: ["<all_urls>"] });

  $("providerType").value = settings.provider.type;
  $("baseUrl").value = settings.provider.baseUrl;
  $("model").value = settings.provider.model;
  $("apiKey").value = settings.provider.apiKey;
  $("baseUrlField").hidden = settings.provider.type !== "openai";

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
  $("baseUrlField").hidden = e.target.value !== "openai";
  $("modelHint").textContent = e.target.value === "anthropic"
    ? "Anthropic: claude-opus-5 (best) or claude-haiku-4-5 (fast/cheap)."
    : "Any model id your endpoint serves, e.g. gpt-4o or llama3.";
});

$("saveProvider").addEventListener("click", async () => {
  await P.settings.saveSettings({
    provider: {
      type: $("providerType").value,
      baseUrl: $("baseUrl").value.trim(),
      model: $("model").value.trim(),
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
