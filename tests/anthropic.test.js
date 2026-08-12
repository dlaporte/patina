const test = require("node:test");
const assert = require("node:assert");
const { generateTheme, API_URL } = require("../llm/anthropic.js");

function okResponse(envelope) {
  return {
    ok: true,
    json: async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(envelope) }]
    })
  };
}

test("sends a correctly-shaped request and parses the envelope", async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, headers: init.headers, body: JSON.parse(init.body) };
    return okResponse({ css: "body{}", widgets: [], notes: "n" });
  };
  const env = await generateTheme(
    { apiKey: "sk-test", model: "claude-opus-5", system: "SYS", user: "USR", schema: { type: "object" } },
    fakeFetch
  );
  assert.equal(env.css, "body{}");
  assert.equal(captured.url, API_URL);
  assert.equal(captured.headers["x-api-key"], "sk-test");
  assert.equal(captured.headers["anthropic-version"], "2023-06-01");
  assert.equal(captured.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(captured.body.model, "claude-opus-5");
  assert.equal(captured.body.max_tokens, 16000);
  assert.equal(captured.body.system[0].text, "SYS");
  assert.deepEqual(captured.body.system[0].cache_control, { type: "ephemeral" });
  assert.equal(captured.body.messages[0].content, "USR");
  assert.deepEqual(captured.body.output_config.format, { type: "json_schema", schema: { type: "object" } });
});

test("throws on refusal stop reason", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ stop_reason: "refusal", content: [] }) });
  await assert.rejects(
    generateTheme({ apiKey: "k", model: "m", system: "s", user: "u", schema: {} }, fakeFetch),
    /refusal/
  );
});

test("throws with status and body excerpt on non-2xx", async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, text: async () => '{"error":"bad key"}' });
  await assert.rejects(
    generateTheme({ apiKey: "k", model: "m", system: "s", user: "u", schema: {} }, fakeFetch),
    /401.*bad key/
  );
});

test("throws a clear error on max_tokens truncation", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"css":' }] }) });
  await assert.rejects(
    generateTheme({ apiKey: "k", model: "m", system: "s", user: "u", schema: {} }, fakeFetch),
    /truncated/
  );
});
