const express = require("express");
const { GoogleGenAI } = require("@google/genai");
const { createRateLimiter } = require("../middleware/rateLimits");
const { requireAuth } = require("../middleware/requireAuth");
const Booking = require("../models/Booking");
const User = require("../models/User");
const {
  generateContentWithFallback,
  listGeminiModels,
  selectAvailableGenerateContentModels,
} = require("../services/geminiModelSelection");
const {
  buildBookingContext,
  buildProviderContext,
  buildProviderFilter,
  buildRewardContext,
  buildTopRatedRecommendations,
  buildNearbyProviderPipeline,
  findRequestedProfession,
  isProviderRecommendationRequest,
  normalizeCoordinates,
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
  const recommendationRequest = isProviderRecommendationRequest(message);
  const location = normalizeUserLocation(req.body?.location) || (
    recommendationRequest ? { city: "", province: "", label: "" } : null
  );

  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ message: `Provide a message of 1 to ${MAX_MESSAGE_LENGTH} characters.` });
  }
  if (!location && !recommendationRequest) {
    return res.status(400).json({ message: "Provide a valid user location (city, region, or both)." });
  }

  let failedOperation = "provider search";
  let failedModel = "";
  try {
    if (recommendationRequest) {
      const coordinates = normalizeCoordinates(req.user.geoLocation?.coordinates);
      if (!coordinates) {
        return res.json({
          type: "text",
          response: "🐼 I need your saved map pin to find providers within 5 km. Update your profile location, then try again.",
        });
      }

      const profession = findRequestedProfession([], message);
      const reviewedProviders = await User.aggregate(
        buildNearbyProviderPipeline(coordinates, profession, true, 3),
      );
      const newProviders = reviewedProviders.length < 3
        ? await User.aggregate(
          buildNearbyProviderPipeline(coordinates, profession, false, 3 - reviewedProviders.length),
        )
        : [];
      return res.json(buildTopRatedRecommendations(
        location,
        [...reviewedProviders, ...newProviders],
        message,
      ));
    }

    const requestedProfession = findRequestedProfession([], message);
    const providerProjection = "fullName username professions averageRating totalReviews barangay city province";
    const providerSort = { averageRating: -1, totalReviews: -1 };
    const providerFilter = buildProviderFilter(location);
    let providers = await User.find(providerFilter)
      .select(providerProjection)
      .sort(providerSort)
      .limit(12)
      .lean();

    if (!providers.length && location.city && location.province) {
      providers = await User.find(buildProviderFilter({ ...location, province: "" }))
        .select(providerProjection)
        .sort(providerSort)
        .limit(12)
        .lean();
    }

    if (!providers.length && location.province) {
      providers = await User.find(buildProviderFilter({ ...location, city: "" }))
        .select(providerProjection)
        .sort(providerSort)
        .limit(12)
        .lean();
    }

    const recommendationCandidates = selectProvidersForRequest(providers, message);
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

    if (!process.env.GEMINI_API_KEY) {
      console.error("PandaBot is unavailable because GEMINI_API_KEY is not configured.");
      return res.status(503).json({ message: "AI support is temporarily unavailable." });
    }

    failedOperation = "Gemini model discovery";
    const models = await getAvailableModels();
    const generated = await generateContentWithFallback(models, async (model) => {
      failedModel = model;
      failedOperation = `Gemini request (${model})`;
      return getAiClient().models.generateContent({
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
    });
    const { result } = generated;
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