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
    for (const id of ["patinate", "repatinate", "toggleSite"]) $(id).disabled = true;
    return;
  }

  const st = await chrome.runtime.sendMessage({ type: "patina:status", domain: host });
  const everywhere = await chrome.permissions.contains({ origins: ["<all_urls>"] });

  $("status").textContent =
    st.siteState === "denylisted" ? "This site is denylisted" :
    st.siteState === "off" ? "Patina is off here" :
    st.generating ? "Generating theme…" :
    !st.hasKey ? "No API key — open Options" :
    st.error ? "Last attempt failed" :
    st.cached ? "Themed (cached)" : "Not yet themed";

  if (st.error) { $("error").hidden = false; $("error").textContent = st.error; }

  $("patinate").hidden = everywhere || st.siteState !== "on";
  $("repatinate").disabled = st.siteState !== "on" || !st.hasKey || st.generating;
  $("toggleSite").textContent = st.siteState === "off" ? "Enable on this site" : "Disable on this site";
  $("toggleSite").disabled = st.siteState === "denylisted";
}

$("aesthetic").addEventListener("change", async (e) => {
  await P.settings.saveSettings({ aestheticId: e.target.value });
  if (tab) chrome.tabs.reload(tab.id);
  window.close();
});

$("repatinate").addEventListener("click", async () => {
  $("repatinate").disabled = true;
  $("status").textContent = "Generating theme…";
  const res = await chrome.runtime.sendMessage({ type: "patina:repatinate", domain: host, tabId: tab.id });
  if (res.ok) window.close();
  else { $("error").hidden = false; $("error").textContent = res.error; $("repatinate").disabled = false; }
});

$("toggleSite").addEventListener("click", async () => {
  const settings = await P.settings.getSettings();
  const current = settings.siteOverrides[host] === "off" ? "on" : "off";
  await P.settings.saveSettings({ siteOverrides: { ...settings.siteOverrides, [host]: current } });
  chrome.tabs.reload(tab.id);
  window.close();
});

$("patinate").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "patina:injectHere", tabId: tab.id });
  window.close();
});

$("openOptions").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

init();
