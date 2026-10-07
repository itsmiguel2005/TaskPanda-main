const test = require("node:test");
const assert = require("node:assert/strict");
const { selectAvailableGenerateContentModels } = require("./geminiModelSelection");

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
