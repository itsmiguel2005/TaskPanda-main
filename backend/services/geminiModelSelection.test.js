const test = require("node:test");
const assert = require("node:assert/strict");
const { listGeminiModels, selectAvailableGenerateContentModels } = require("./geminiModelSelection");

test("selects only supported text-generation models in preferred order", () => {
  assert.deepEqual(selectAvailableGenerateContentModels([
    { name: "models/gemini-2.5-flash", supportedActions: ["generateContent"] },
    { name: "models/gemini-3.8-flash", supportedActions: ["generateContent"] },
    { name: "models/gemini-3.7-flash", supportedActions: ["embedContent"] },
    { name: "models/gemini-2.0-flash", supportedActions: ["generateContent"] },
  ]), ["gemini-3.8-flash", "gemini-2.5-flash"]);
});

test("returns no model when the key exposes no preferred generateContent model", () => {
  assert.deepEqual(selectAvailableGenerateContentModels([
    { name: "models/gemini-3.8-flash", supportedActions: ["embedContent"] },
    { name: "models/gemini-2.0-flash", supportedActions: ["generateContent"] },
  ]), []);
});

test("lists models with the API key in a header and follows pagination", async () => {
  const requests = [];
  const pages = [
    { models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }], nextPageToken: "next-page" },
    { models: [{ name: "models/gemini-3.5-flash", supportedGenerationMethods: ["generateContent"] }] },
  ];
  const models = await listGeminiModels("test-key", async (url, options) => {
    requests.push({ url: new URL(url), options });
    return { ok: true, json: async () => pages.shift() };
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.searchParams.get("pageSize"), "100");
  assert.equal(requests[0].url.searchParams.get("pageToken"), null);
  assert.equal(requests[1].url.searchParams.get("pageToken"), "next-page");
  assert.equal(requests[0].url.searchParams.has("key"), false);
  assert.equal(requests[0].options.headers["x-goog-api-key"], "test-key");
  assert.deepEqual(selectAvailableGenerateContentModels(models), ["gemini-3.5-flash", "gemini-2.5-flash"]);
});

test("reports Gemini API errors from model listing", async () => {
  await assert.rejects(
    listGeminiModels("test-key", async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: "API key is not authorized." } }),
    })),
    (error) => error.status === 403 && error.message === "API key is not authorized.",
  );
});
