(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.llm = root.Patina.llm || {};
  root.Patina.llm.anthropic = mod;
})(globalThis, function () {
  const API_URL = "https://api.anthropic.com/v1/messages";

  async function generateTheme({ apiKey, model, system, user, schema }, fetchImpl) {
    const doFetch = fetchImpl || fetch;
    const res = await doFetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: model || "claude-opus-5",
        max_tokens: 8192,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
        output_config: { format: { type: "json_schema", schema } }
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    if (data.stop_reason === "refusal") throw new Error("Model declined the request (refusal)");
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return JSON.parse(text);
  }

  return { API_URL, generateTheme };
});
