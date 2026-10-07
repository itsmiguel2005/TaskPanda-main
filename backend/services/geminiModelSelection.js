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
      .filter((model) => (model?.supportedGenerationMethods || model?.supportedActions)?.includes("generateContent"))
      .map((model) => String(model.name || "").replace(/^models\//, "")),
  );
  return preferredModels.filter((model) => available.has(model));
}

async function listGeminiModels(apiKey, fetchImpl = fetch) {
  const models = [];
  let pageToken = "";

  do {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetchImpl(url, {
      headers: { "x-goog-api-key": apiKey },
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data?.error?.message || "Gemini model listing failed.");
      error.status = response.status;
      throw error;
    }
    if (!Array.isArray(data.models)) {
      throw new TypeError("Gemini returned an invalid model list.");
    }
    models.push(...data.models);
    pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : "";
  } while (pageToken);

  return models;
}

module.exports = { listGeminiModels, selectAvailableGenerateContentModels };
