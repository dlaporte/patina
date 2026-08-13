const P = globalThis.Patina;
const $ = (id) => document.getElementById(id);

let tab = null;
let host = null;

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab && tab.url && /^https?:/.test(tab.url) ? new URL(tab.url) : null;
  host = url ? P.settings.normalizeHost(url.hostname) : null;
  $("site").textContent = host || "(unsupported page)";

  const settings = await P.settings.getSettings();
  $("enabled").checked = settings.enabled;
  const select = $("aesthetic");
  select.innerHTML = "";
  for (const a of [...P.presets.PRESETS, ...settings.customAesthetics]) {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.name;
    opt.selected = a.id === settings.aestheticId;
    select.appendChild(opt);
  }

  if (!host) {
    setStatus("unsupported", "Nothing to patinate here");
    $("toggleSite").textContent = "Disable on this site";
    return; // buttons stay disabled (their initial HTML state)
  }

  const st = await chrome.runtime.sendMessage({ type: "patina:status", domain: host });

  if (st.siteState === "denylisted") setStatus("off", "This site is denylisted");
  else if (st.siteState === "off") setStatus("off", "Patina is off here");
  else if (st.generating) setStatus("generating", "Generating theme…");
  else if (!st.hasKey) setStatus("nokey", "No API key — open Options");
  else if (st.error) setStatus("error", "Last attempt failed");
  else if (st.cached) setStatus("cached", "Themed (cached)");
  else setStatus("idle", "Not yet themed");

  if (st.error) { $("error").hidden = false; $("error").textContent = st.error; }

  $("repatinate").disabled = st.siteState !== "on" || st.generating;
  $("toggleSite").textContent = st.siteState === "off" ? "Enable on this site" : "Disable on this site";
  $("toggleSite").disabled = st.siteState === "denylisted";
}

function setStatus(state, text) {
  $("statusRow").dataset.state = state;
  $("status").textContent = text;
}

// Choosing a patina in the picker is only a selection — nothing changes on the
// page until "Apply Patina" commits it. With <all_urls> granted the reload
// re-themes via the registered content scripts; in on-demand mode we inject
// into the current tab instead (re-injection re-runs the theming lifecycle).
$("repatinate").addEventListener("click", async () => {
  $("repatinate").disabled = true;
  await P.settings.saveSettings({ aestheticId: $("aesthetic").value });
  const everywhere = await chrome.permissions.contains({ origins: ["<all_urls>"] });
  if (everywhere) chrome.tabs.reload(tab.id);
  else await chrome.runtime.sendMessage({ type: "patina:injectHere", tabId: tab.id });
  window.close();
});

$("toggleSite").addEventListener("click", async () => {
  const settings = await P.settings.getSettings();
  const current = settings.siteOverrides[host] === "off" ? "on" : "off";
  await P.settings.saveSettings({ siteOverrides: { ...settings.siteOverrides, [host]: current } });
  chrome.tabs.reload(tab.id);
  window.close();
});

$("enabled").addEventListener("change", async (e) => {
  await P.settings.saveSettings({ enabled: e.target.checked });
  if (tab && host) { chrome.tabs.reload(tab.id); window.close(); }
  else init(); // no themable tab: just refresh the popup's state
});

$("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());

init();
