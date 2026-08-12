const test = require("node:test");
const assert = require("node:assert");
const { generateTheme } = require("../llm/openai.js");

function okResponse(content) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
}

test("targets {baseUrl}/chat/completions with bearer auth and json_object mode", async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, headers: init.headers, body: JSON.parse(init.body) };
    return okResponse('{"css":"body{}","widgets":[],"notes":""}');
  };
  const env = await generateTheme(
    { apiKey: "sk-o", baseUrl: "http://localhost:11434/v1/", model: "llama3", system: "SYS", user: "USR" },
    fakeFetch
  );
  assert.equal(env.css, "body{}");
  assert.equal(captured.url, "http://localhost:11434/v1/chat/completions");
  assert.equal(captured.headers.authorization, "Bearer sk-o");
  assert.deepEqual(captured.body.response_format, { type: "json_object" });
  assert.equal(captured.body.messages[0].role, "system");
  assert.equal(captured.body.messages[1].content, "USR");
});

test("defaults baseUrl to api.openai.com", async () => {
  let url;
  const fakeFetch = async (u) => { url = u; return okResponse('{"css":"a{}","widgets":[]}'); };
  await generateTheme({ apiKey: "k", model: "gpt-4o", system: "s", user: "u" }, fakeFetch);
  assert.equal(url, "https://api.openai.com/v1/chat/completions");
});

test("strips markdown code fences from the response", async () => {
  const fakeFetch = async () => okResponse('```json\n{"css":"b{}","widgets":[]}\n```');
  const env = await generateTheme({ apiKey: "k", model: "m", system: "s", user: "u" }, fakeFetch);
  assert.equal(env.css, "b{}");
});

test("throws with status on non-2xx", async () => {
  const fakeFetch = async () => ({ ok: false, status: 429, text: async () => "rate limited" });
  await assert.rejects(generateTheme({ apiKey: "k", model: "m", system: "s", user: "u" }, fakeFetch), /429/);
});
