const preferredModels = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

function selectAvailableGenerateContentModels(models) {
  const available = new Set(
    models
      .filter((model) => model?.supportedActions?.includes("generateContent"))
      .map((model) => String(model.name || "").replace(/^models\//, "")),
  );
  return preferredModels.filter((model) => available.has(model));
}

module.exports = { selectAvailableGenerateContentModels };
