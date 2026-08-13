(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.llm = root.Patina.llm || {};
  root.Patina.llm.openai = mod;
})(globalThis, function () {
  function stripFences(text) {
    return String(text).replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }

  async function generateTheme({ apiKey, baseUrl, model, system, user }, fetchImpl) {
    const doFetch = fetchImpl || fetch;
    const url = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "") + "/chat/completions";
    const res = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        response_format: { type: "json_object" }
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LLM API ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
    if (!text || !String(text).trim()) {
      throw new Error("Empty completion from provider — check the model id and base URL");
    }
    return JSON.parse(stripFences(text));
  }

  return { generateTheme };
});
