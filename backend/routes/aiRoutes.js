const express = require("express");
const { GoogleGenAI } = require("@google/genai");
const { createRateLimiter } = require("../middleware/rateLimits");
const { requireAuth } = require("../middleware/requireAuth");
const Booking = require("../models/Booking");
const User = require("../models/User");
const { listGeminiModels, selectAvailableGenerateContentModels } = require("../services/geminiModelSelection");
const {
  buildBookingContext,
  buildProviderContext,
  buildProviderFilter,
  buildRewardContext,
  buildTopRatedEmptyResponse,
  isTopRatedRequest,
  normalizeUserLocation,
  parsePandaBotResponse,
  responseSchema,
  selectProvidersForRequest,
  systemInstruction,
} = require("../services/pandaBot");

const router = express.Router();
const limitAiSupport = createRateLimiter(20, 15 * 60 * 1000, "Too many support requests. Please try again later.");
const MAX_MESSAGE_LENGTH = 4000;
let ai;
let availableModelsPromise;

function getAiClient() {
  ai ||= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

async function getAvailableModels() {
  availableModelsPromise ||= (async () => {
    const listedModels = await listGeminiModels(process.env.GEMINI_API_KEY);
    const models = selectAvailableGenerateContentModels(listedModels);
    if (!models.length) {
      throw new Error("The configured Gemini API key has no supported generateContent model.");
    }
    return models;
  })().catch((error) => {
    availableModelsPromise = undefined;
    throw error;
  });
  return availableModelsPromise;
}

function getErrorStatus(error) {
  const status = Number(error?.status || error?.code);
  return Number.isFinite(status) ? status : 0;
}

router.post("/support", limitAiSupport, requireAuth, async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const location = normalizeUserLocation(req.body?.location);

  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ message: `Provide a message of 1 to ${MAX_MESSAGE_LENGTH} characters.` });
  }
  if (!location) {
    return res.status(400).json({ message: "Provide a valid user location (city, region, or both)." });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("PandaBot is unavailable because GEMINI_API_KEY is not configured.");
    return res.status(503).json({ message: "AI support is temporarily unavailable." });
  }

  let failedOperation = "provider search";
  let failedModel = "";
  try {
    const providerFilter = buildProviderFilter(location);
    let providers = await User.find(providerFilter)
      .select("fullName username professions averageRating totalReviews barangay city province")
      .sort({ averageRating: -1, totalReviews: -1 })
      .limit(12)
      .lean();

    if (!providers.length && location.city && location.province) {
      providers = await User.find(buildProviderFilter({ ...location, province: "" }))
        .select("fullName username professions averageRating totalReviews barangay city province")
        .sort({ averageRating: -1, totalReviews: -1 })
        .limit(12)
        .lean();
    }

    if (!providers.length && location.province) {
      providers = await User.find(buildProviderFilter({ ...location, city: "" }))
        .select("fullName username professions averageRating totalReviews barangay city province")
        .sort({ averageRating: -1, totalReviews: -1 })
        .limit(12)
        .lean();
    }

    const recommendationCandidates = selectProvidersForRequest(providers, message);
    if (isTopRatedRequest(message) && recommendationCandidates.length === 0) {
      return res.json({
        response: buildTopRatedEmptyResponse(location, providers),
        recommendations: [],
      });
    }

    const providerContext = buildProviderContext(recommendationCandidates);
    const needsBookingContext = /\b(?:bookings?|track|status|receipt|cash|payment|settle(?:d|ment)?|dispute)\b/i.test(message);
    const needsRewardContext = /\b(?:stamp|bamboo|reward|voucher)\b/i.test(message);
    const accountContext = {};

    if (needsBookingContext && ["client", "provider"].includes(req.user.role)) {
      failedOperation = "booking lookup";
      const bookingFilter = req.user.role === "provider"
        ? { providerId: req.user._id }
        : { clientId: req.user._id };
      const bookings = await Booking.find(bookingFilter)
        .select("_id repairDescription status serviceDate timeSlot paymentMethod clientConfirmedCash providerConfirmedCash cashPaidConfirmedAt cashReceivedConfirmedAt settledAt cashReceipt.receiptNumber")
        .sort({ createdAt: -1 })
        .limit(8)
        .lean();
      accountContext.recentBookings = buildBookingContext(bookings);
    }

    if (needsRewardContext && req.user.role === "client") {
      accountContext.rewards = buildRewardContext(req.user);
    }

    const contents = [
      `User's requested location: ${location.label}`,
      `Eligible TaskPanda providers for this location (source of truth): ${JSON.stringify(providerContext)}`,
      ...(Object.keys(accountContext).length
        ? [`Caller-owned account context (source of truth): ${JSON.stringify(accountContext)}`]
        : []),
      `User's message: ${message}`,
      "Select zero to three providers only when relevant to the request. Return their IDs in providerIds.",
    ].join("\n\n");

    failedOperation = "Gemini model discovery";
    const models = await getAvailableModels();
    let result;
    let generationError;
    for (const model of models) {
      failedModel = model;
      failedOperation = `Gemini request (${model})`;
      try {
        result = await getAiClient().models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema,
            maxOutputTokens: 600,
            temperature: 0.25,
          },
        });
        break;
      } catch (error) {
        generationError = error;
        if (![400, 404].includes(getErrorStatus(error))) throw error;
      }
    }
    if (!result) throw generationError || new Error("Gemini did not return a response.");
    const resultText = result.text?.trim();

    if (!resultText) {
      return res.status(502).json({ message: "AI support returned an empty response. Please try again." });
    }

    failedOperation = "Gemini response parsing";
    const { message: response, recommendations } = parsePandaBotResponse(resultText, recommendationCandidates);
    return res.json({ response, recommendations });
  } catch (error) {
    console.error("PandaBot support request failed:", {
      operation: failedOperation,
      model: failedModel || undefined,
      status: getErrorStatus(error) || "unknown",
      name: error?.name || "unknown error",
      message: String(error?.message || "No error message returned.")
        .replace(/([?&]key=)[^&\s]+/gi, "$1[REDACTED]")
        .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED]"),
    });
    return res.status(502).json({ message: "AI support is temporarily unavailable. Please try again." });
  }
});

module.exports = router;