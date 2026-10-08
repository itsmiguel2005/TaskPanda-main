const express = require("express");
const { GoogleGenAI } = require("@google/genai");
const mongoose = require("mongoose");
const { createRateLimiter } = require("../middleware/rateLimits");
const { requireAuth } = require("../middleware/requireAuth");
const Booking = require("../models/Booking");
const Favorite = require("../models/Favorite");
const User = require("../models/User");
const { calculateDistanceKm } = require("../services/bookingPricing");
const { getGlobalSettings } = require("../services/systemSettings");
const {
  generateContentWithFallback,
  listGeminiModels,
  selectAvailableGenerateContentModels,
} = require("../services/geminiModelSelection");
const {
  buildBookingContext,
  buildFavoriteRecommendations,
  buildProviderContext,
  buildProviderFilter,
  buildRewardContext,
  buildTopRatedRecommendations,
  addTravelFeeEstimates,
  findFavoriteNameMatches,
  findProviderChoiceMatches,
  findProviderNameMatches,
  formatServiceDate,
  getAvailableTimeSlots,
  isAvailabilityDateFollowUp,
  getRecentContextProviderIds,
  getRecentContextRequestedDate,
  getPhilippineDateOffset,
  getProviderNameSearchTerms,
  isFavoriteReference,
  isProviderChoiceFollowUp,
  isProviderAvailabilityRequest,
  buildNearbyProviderPipeline,
  findRequestedProfession,
  isProviderRecommendationRequest,
  isFavoriteProviderListRequest,
  normalizeCoordinates,
  normalizeUserLocation,
  parseRequestedServiceDate,
  parsePandaBotResponse,
  responseSchema,
  selectProvidersForRequest,
  systemInstruction,
} = require("../services/pandaBot");

const router = express.Router();
const limitAiSupport = createRateLimiter(20, 15 * 60 * 1000, "Too many support requests. Please try again later.");
const MAX_MESSAGE_LENGTH = 4000;
const ACTIVE_BOOKING_STATUSES = [
  "pending", "approved", "en_route", "in_progress", "cancel_requested",
  "Pending Request", "Confirmed", "On the Way", "In Progress", "Cancellation Requested",
];
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

function buildRecommendationFallback(location, providers, message, searchUnavailable = "") {
  if (searchUnavailable) {
    return {
      type: "text",
      response: "🐼 Gemini is temporarily unavailable. I need your saved profile map pin to search nearby providers; please update your profile location and try again.",
    };
  }
  const verified = buildTopRatedRecommendations(location, providers, message);
  if (verified.type === "recommendation_cards") {
    return {
      ...verified,
      intro: `🐼 Gemini is temporarily unavailable, but these are database-verified matches. ${verified.intro}`,
    };
  }
  return {
    type: "text",
    response: `🐼 Gemini is temporarily unavailable. ${verified.response}`,
  };
}

router.post("/support", limitAiSupport, requireAuth, async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const favoriteReference = isFavoriteReference(message);
  const favoriteListRequest = isFavoriteProviderListRequest(message);
  const recentProviderIds = getRecentContextProviderIds(req.body?.conversationHistory);
  const recentRequestedDate = getRecentContextRequestedDate(req.body?.conversationHistory);
  const dateFollowUp = isAvailabilityDateFollowUp(message, recentProviderIds.length > 0);
  const providerChoiceFollowUp = isProviderChoiceFollowUp(message, recentProviderIds.length > 1) &&
    getProviderNameSearchTerms(message).length > 0;
  const availabilityRequest = isProviderAvailabilityRequest(message) ||
    dateFollowUp ||
    (providerChoiceFollowUp && Boolean(recentRequestedDate));
  const recommendationRequest = isProviderRecommendationRequest(message) || favoriteListRequest || availabilityRequest;
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
  let recommendationCandidates = [];
  let recommendationSearchUnavailable = "";
  let recommendationSearchContext = "";
  try {
    if (favoriteListRequest && !availabilityRequest) {
      const favoriteRows = await Favorite.find({ clientId: req.user._id })
        .select("providerId createdAt")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      const favoriteIds = favoriteRows.map((favorite) => favorite.providerId).filter(Boolean);
      const favoriteProviders = favoriteIds.length
        ? await User.find({
          _id: mongoose.trusted({ $in: favoriteIds }),
          role: "provider",
          registrationComplete: true,
          isSuspended: mongoose.trusted({ $ne: true }),
          archivedAt: null,
        })
          .select("_id fullName username professions averageRating totalReviews city province")
          .lean()
        : [];
      const providerById = new Map(favoriteProviders.map((provider) => [String(provider._id), provider]));
      const orderedFavorites = favoriteIds
        .map((id) => providerById.get(String(id)))
        .filter(Boolean)
        .map((provider) => ({ ...provider, isFavorite: true }));
      return res.json(buildFavoriteRecommendations(orderedFavorites));
    }

    const pendingProviderChoice = !availabilityRequest &&
      isProviderChoiceFollowUp(message, recentProviderIds.length > 1) &&
      getProviderNameSearchTerms(message).length > 0;
    if (pendingProviderChoice) {
      const pendingProviders = await User.find({
        _id: mongoose.trusted({
          $in: recentProviderIds.filter((id) => mongoose.isValidObjectId(id)),
        }),
        role: "provider",
        registrationComplete: true,
        isSuspended: mongoose.trusted({ $ne: true }),
        archivedAt: null,
      })
        .select("_id fullName username professions averageRating totalReviews city province")
        .lean();
      const matchingChoices = findProviderChoiceMatches(pendingProviders, message);

      if (matchingChoices.length === 1) {
        const favoriteRows = await Favorite.find({
          clientId: req.user._id,
          providerId: matchingChoices[0]._id,
        }).select("_id").lean();
        return res.json(buildFavoriteRecommendations([{
          ...matchingChoices[0],
          isFavorite: favoriteRows.length > 0,
        }]));
      }
      if (matchingChoices.length > 1) {
        const choices = matchingChoices
          .map((provider) => `${provider.fullName || provider.username} (${[provider.professions?.[0], provider.city].filter(Boolean).join(", ") || "location unavailable"})`)
          .join("; ");
        return res.json({
          type: "text",
          response: `🐼 I found more than one of those providers: ${choices}. Which one did you mean?`,
          contextProviderIds: matchingChoices.map((provider) => String(provider._id)),
        });
      }
      if (!matchingChoices.length) {
        const choices = pendingProviders
          .map((provider) => `${provider.fullName || provider.username} (${[provider.professions?.[0], provider.city].filter(Boolean).join(", ") || "location unavailable"})`)
          .join("; ");
        return res.json({
          type: "text",
          response: `🐼 I’m still choosing between these providers: ${choices}. Reply with their service, city, or part of their name so I can pick the right one.`,
          contextProviderIds: pendingProviders.map((provider) => String(provider._id)),
        });
      }
    }

    if (recommendationRequest) {
      const coordinates = normalizeCoordinates(req.user.geoLocation?.coordinates);
      const requestedDate = availabilityRequest
        ? parseRequestedServiceDate(message) || (providerChoiceFollowUp ? recentRequestedDate : "")
        : "";
      if (availabilityRequest && !requestedDate) {
        recommendationSearchUnavailable = "No service date was included. Ask the caller which date they want to book.";
        recommendationSearchContext = "The caller did not provide a date, so no availability was checked.";
      } else if (availabilityRequest) {
        const nameTerms = dateFollowUp || providerChoiceFollowUp ? [] : getProviderNameSearchTerms(message);
        const contextProviderIds = nameTerms.length ? [] : recentProviderIds;
        const favoriteRows = await Favorite.find({ clientId: req.user._id })
          .select("providerId createdAt")
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();
        const favoriteIds = favoriteRows.map((favorite) => favorite.providerId).filter(Boolean);
        const favoriteProviders = favoriteIds.length
          ? await User.find({
            _id: mongoose.trusted({ $in: favoriteIds }),
            role: "provider",
            registrationComplete: true,
            isSuspended: mongoose.trusted({ $ne: true }),
            archivedAt: null,
          })
            .select("_id fullName username professions averageRating totalReviews city province geoLocation")
            .lean()
          : [];
        const providerById = new Map(favoriteProviders.map((provider) => [String(provider._id), provider]));
        const orderedFavorites = favoriteIds
          .map((id) => providerById.get(String(id)))
          .filter(Boolean)
          .map((provider) => ({ ...provider, isFavorite: true }));
        const favoriteIdSet = new Set(favoriteIds.map(String));
        const matchingProviders = nameTerms.length
          ? await User.find({
            role: "provider",
            registrationComplete: true,
            isSuspended: mongoose.trusted({ $ne: true }),
            archivedAt: null,
            $or: nameTerms.flatMap((term) => {
              const pattern = new RegExp(`(?:^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`, "i");
              return [{ fullName: pattern }, { username: pattern }];
            }),
          })
            .select("_id fullName username professions averageRating totalReviews city province geoLocation")
            .limit(100)
            .lean()
          : [];
        const contextProviders = contextProviderIds.length
          ? await User.find({
            _id: mongoose.trusted({
              $in: contextProviderIds.filter((id) => mongoose.isValidObjectId(id)),
            }),
            role: "provider",
            registrationComplete: true,
            isSuspended: mongoose.trusted({ $ne: true }),
            archivedAt: null,
          })
            .select("_id fullName username professions averageRating totalReviews city province geoLocation")
            .lean()
          : [];
        const providersById = new Map(
          [...orderedFavorites, ...matchingProviders, ...contextProviders].map((provider) => [
            String(provider._id),
            { ...provider, isFavorite: favoriteIdSet.has(String(provider._id)) },
          ]),
        );
        const nameMatchedProviders = findProviderNameMatches([...providersById.values()], message);
        const matchedFavorites = findFavoriteNameMatches(orderedFavorites, message);
        const contextualProviders = contextProviderIds
          .map((id) => providersById.get(String(id)))
          .filter(Boolean);
        const matchingContextChoices = providerChoiceFollowUp
          ? findProviderChoiceMatches(contextualProviders, message)
          : [];
        let providerCandidates = contextualProviders;
        if (providerChoiceFollowUp) {
          providerCandidates = matchingContextChoices;
        } else if (nameTerms.length && favoriteReference) {
          providerCandidates = matchedFavorites;
        } else if (nameTerms.length) {
          providerCandidates = matchedFavorites.length ? matchedFavorites : nameMatchedProviders;
        } else if (contextualProviders.length) {
          providerCandidates = contextualProviders;
        } else if (orderedFavorites.length === 1) {
          providerCandidates = orderedFavorites;
        } else if (favoriteReference) {
          providerCandidates = orderedFavorites;
        } else {
          providerCandidates = [];
        }

        if (!providerCandidates.length) {
          if (!nameTerms.length) {
            recommendationSearchUnavailable = "No provider name or recent provider context was included. Ask which provider they mean; they do not need to provide the full name.";
            recommendationSearchContext = "The caller asked about availability without a provider name, and no recent provider card could be resolved from this conversation.";
          } else {
            recommendationSearchUnavailable = favoriteReference
              ? "No active saved favorite matched the provider name in the request. Say no matching favorite was found and ask the caller to check their saved list."
              : "No active provider matched the name or name fragment in the request. Ask the caller to check the spelling or provide another part of the provider's name; a full name is not required.";
            recommendationSearchContext = favoriteReference
              ? "The caller asked about a favorite by name, but no active saved favorite matched that name."
              : "No active provider record matched the supplied provider name fragment.";
          }
        } else if (providerCandidates.length > 1) {
          const choices = providerCandidates
            .map((provider) => `${provider.fullName || provider.username} (${[provider.professions?.[0], provider.city].filter(Boolean).join(", ") || "location unavailable"})`)
            .join("; ");
          return res.json({
            type: "text",
            response: nameTerms.length
              ? `🐼 I found more than one provider matching that name: ${choices}. Which one did you mean?`
              : `🐼 I found multiple saved providers: ${choices}. Which one did you mean?`,
            contextProviderIds: providerCandidates.map((provider) => String(provider._id)),
            contextRequestedDate: requestedDate,
          });
        } else {
          const provider = providerCandidates[0];
          if (!coordinates) {
            recommendationSearchUnavailable = "The caller has no valid saved map pin. Ask them to update their profile location before estimating travel or checking slots.";
          } else {
            const providerCoordinates = normalizeCoordinates(provider.geoLocation?.coordinates);
            const travelDistanceKm = providerCoordinates
              ? calculateDistanceKm(coordinates, providerCoordinates)
              : null;
            if (travelDistanceKm == null) {
              recommendationSearchUnavailable = "The provider or caller has no valid map pin. Ask the caller to update their profile location before checking bookable slots.";
            } else {
              const settings = await getGlobalSettings();
              if (travelDistanceKm > settings.maxTravelDistanceKm) {
                recommendationSearchUnavailable = `The selected favorite is ${travelDistanceKm.toFixed(2)} km away, beyond the current ${settings.maxTravelDistanceKm} km booking travel limit. Explain that this provider cannot currently be booked for this location.`;
                recommendationSearchContext = "The exact saved favorite was resolved, but it exceeds the current platform booking travel limit.";
              } else {
                const today = getPhilippineDateOffset(0);
                const bookingsFrom = new Date(`${today}T00:00:00.000Z`);
                bookingsFrom.setUTCDate(bookingsFrom.getUTCDate() - 1);
                const bookingsUntil = new Date(`${requestedDate}T00:00:00.000Z`);
                bookingsUntil.setUTCDate(bookingsUntil.getUTCDate() + 1);
                const activeBookings = await Booking.find({
                  providerId: provider._id,
                  serviceDate: mongoose.trusted({
                    $gte: bookingsFrom,
                    $lt: bookingsUntil,
                  }),
                  status: mongoose.trusted({ $in: ACTIVE_BOOKING_STATUSES }),
                })
                  .select("_id serviceDate timeSlot estimatedDurationMinutes serviceGeoLocation")
                  .lean();
                const serviceGeoLocation = { type: "Point", coordinates };
                const distance = Math.round(travelDistanceKm * 100) / 100;
                const availableSlots = getAvailableTimeSlots({
                  bookings: activeBookings,
                  serviceDate: requestedDate,
                  serviceGeoLocation,
                  travelDistanceKm: distance,
                });
                recommendationCandidates = addTravelFeeEstimates([{
                  ...provider,
                  distanceKm: distance,
                  isFavorite: favoriteIdSet.has(String(provider._id)),
                  searchRadiusKm: settings.maxTravelDistanceKm,
                  availabilityDate: requestedDate,
                  availableSlots,
                  availabilityDurationMinutes: 60,
                }], settings);
                const providerResolution = nameTerms.length
                  ? "matching the supplied name fragment to an active provider record"
                  : "resolving the provider ID from the most recent provider card in this conversation to an active provider record";
                recommendationSearchContext = `The provider was resolved by ${providerResolution}${favoriteIdSet.has(String(provider._id)) ? " and prioritized because that exact provider record is saved in the caller's favorites" : ""}. Availability for ${requestedDate} was checked against active bookings using the authenticated profile pin.`;
              }
            }
          }
        }
      } else if (!coordinates) {
        recommendationSearchUnavailable = "The caller has no valid saved map pin. Ask them to update their profile location before matching.";
        recommendationSearchContext = "No valid authenticated profile map pin is available.";
      } else {
        const profession = findRequestedProfession([], message);
        const reviewedProviders = await User.aggregate(
          buildNearbyProviderPipeline(coordinates, profession, true, 3),
        );
        const newProviders = reviewedProviders.length < 3
          ? await User.aggregate(
            buildNearbyProviderPipeline(coordinates, profession, false, 3 - reviewedProviders.length),
          )
          : [];
        const nearbyProviders = [...reviewedProviders, ...newProviders];
        if (nearbyProviders.length) {
          const settings = await getGlobalSettings();
          recommendationCandidates = addTravelFeeEstimates(nearbyProviders, settings);
        }
        recommendationSearchContext = "Nearby providers were searched around the authenticated profile map pin within 5 km.";
      }
    } else {
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
      recommendationCandidates = selectProvidersForRequest(providers, message);
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
      `User's active profile location: ${location.label || "not available"}`,
      `Verified provider search context: ${recommendationSearchContext || (recommendationRequest ? "Providers were searched around the authenticated profile map pin within 5 km." : "Providers were searched using the supplied city/region.")}`,
      `Eligible TaskPanda providers and verified provider details (source of truth): ${JSON.stringify(providerContext)}`,
      ...(Object.keys(accountContext).length
        ? [`Caller-owned account context (source of truth): ${JSON.stringify(accountContext)}`]
        : []),
      `User's message: ${message}`,
      `Current availability date requested: ${availabilityRequest ? (parseRequestedServiceDate(message) || "not specified") : "none"}`,
      "For repair symptoms, give cautious non-definitive triage and use the matching trade in the supplied data. Mention only travel estimates and exact open slots supplied in provider context. If exact open slots are supplied for the requested date, list them and link the response to booking that provider; state that booking rechecks slots before confirmation. Do not say availability cannot be checked when the exact open slots are in context. Select only relevant provider IDs from the supplied context, otherwise return an empty array.",
    ].join("\n\n");

    if (!process.env.GEMINI_API_KEY) {
      console.error("PandaBot is unavailable because GEMINI_API_KEY is not configured.");
      if (recommendationRequest) {
        return res.json(buildRecommendationFallback(
          location,
          recommendationCandidates,
          message,
          recommendationSearchUnavailable,
        ));
      }
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
      if (recommendationRequest) {
        return res.json(buildRecommendationFallback(
          location,
          recommendationCandidates,
          message,
          recommendationSearchUnavailable,
        ));
      }
      return res.status(502).json({ message: "AI support returned an empty response. Please try again." });
    }

    failedOperation = "Gemini response parsing";
    const { message: response, recommendations } = parsePandaBotResponse(resultText, recommendationCandidates);
    if (recommendationRequest) {
      const verified = buildTopRatedRecommendations(location, recommendationCandidates, message);
      if (verified.type === "recommendation_cards") {
        return res.json({
          type: "recommendation_cards",
          intro: response,
          providers: verified.providers,
        });
      }
      return res.json({ type: "text", response });
    }
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
    if (recommendationRequest && failedOperation.startsWith("Gemini")) {
        return res.json(buildRecommendationFallback(
          location,
          recommendationCandidates,
          message,
          recommendationSearchUnavailable,
        ));
    }
    return res.status(502).json({ message: "AI support is temporarily unavailable. Please try again." });
  }
});

module.exports = router;