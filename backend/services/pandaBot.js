const mongoose = require("mongoose");
const { Type } = require("@google/genai");
const knownProfessions = require("../../shared/professions.json");

const systemInstruction = `You are PandaBot, the official AI customer support and matching assistant for TaskPanda, an on-demand service marketplace. Be friendly, concise, actionable, and use a warm panda-mascot tone; a panda emoji may be used sparingly. Use supplied account context to answer questions about the caller's own recent bookings, their exact status, cash confirmations, settlement, and receipt number; never claim access to records not included in that context. If no matching booking is supplied, say you could not find it in the recent records and direct the user to Bookings. Explain the Pending, Confirmed, On the Way, In Progress, Completed, and Settled booking flow. Use supplied reward context for the caller's current bamboo stamp progress and active stamp vouchers; one settled booking earns one stamp, and five stamps earn a PHP 50 travel-fee voucher. Give general account-security guidance and explain that disputes should be reported through the relevant booking in the app. For local matching, use only the provider records supplied with the request. Match at the city and region level across the whole city; do not restrict recommendations to the user's barangay or imply that the user is searching only within one barangay. Recommend only providers whose IDs are in that data, match their category and location to the user's request, and use their provided ratings and review counts exactly. Never invent a provider, rating, review count, service area, availability, booking, receipt, or reward state. If no supplied provider is a reasonable local match, say so and direct the user to Explore. Recommendations are location-aware across regions and cities, never limited to a single city. Return only JSON with a concise message string and a providerIds array containing zero to three IDs copied from the supplied providers.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    message: { type: Type.STRING },
    providerIds: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["message", "providerIds"],
};

function normalizePart(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 100);
}

function normalizeCity(value) {
  return normalizePart(value)
    .replace(/^(?:city|municipality)\s+of\s+/i, "")
    .replace(/\s+(?:city|municipality)$/i, "")
    .trim();
}

function normalizeUserLocation(rawLocation) {
  let city = "";
  let province = "";

  if (typeof rawLocation === "string") {
    const parts = rawLocation.split(",").map(normalizePart).filter(Boolean);
    city = normalizeCity(parts.length > 1 ? parts[parts.length - 2] : parts[0]);
    province = parts.length > 1 ? normalizePart(parts[parts.length - 1]) : "";
  } else if (rawLocation && typeof rawLocation === "object" && !Array.isArray(rawLocation)) {
    city = normalizeCity(rawLocation.city || rawLocation.municipality || rawLocation.town);
    province = normalizePart(rawLocation.province || rawLocation.region);
  }

  const label = [city, province].filter(Boolean).join(", ");
  if (!city && !province) return null;
  return { city, province, label };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildProviderFilter(location) {
  const filter = {
    role: "provider",
    registrationComplete: true,
    isSuspended: mongoose.trusted({ $ne: true }),
    archivedAt: null,
    "geoLocation.type": "Point",
  };

  if (location.city) {
    const cityPattern = `^(?:city of )?${escapeRegex(location.city)}(?: city| municipality)?$`;
    filter.city = new RegExp(cityPattern, "i");
  }
  if (location.province) filter.province = new RegExp(`^${escapeRegex(location.province)}$`, "i");
  return filter;
}

function normalizeCoordinates(value) {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((coordinate) => typeof coordinate === "number")
  ) return null;
  const [longitude, latitude] = value;
  if (
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90
  ) return null;
  return [longitude, latitude];
}

function buildNearbyProviderPipeline(coordinates, profession, includeReviewed, limit = 3) {
  const query = {
    role: "provider",
    registrationComplete: true,
    isSuspended: { $ne: true },
    archivedAt: null,
    "geoLocation.type": "Point",
  };

  if (profession) {
    query.professions = {
      $in: [new RegExp(`^${escapeRegex(profession)}$`, "i")],
    };
  }
  if (includeReviewed) {
    query.averageRating = { $gt: 0 };
    query.totalReviews = { $gt: 0 };
  } else {
    query.averageRating = { $in: [0, null] };
    query.totalReviews = { $in: [0, null] };
  }

  return [
    {
      $geoNear: {
        near: { type: "Point", coordinates },
        key: "geoLocation",
        distanceField: "distanceMeters",
        maxDistance: 5000,
        spherical: true,
        query,
      },
    },
    {
      $sort: includeReviewed
        ? { averageRating: -1, totalReviews: -1, distanceMeters: 1 }
        : { distanceMeters: 1, createdAt: -1 },
    },
    { $limit: Math.max(0, Math.min(3, Math.floor(Number(limit) || 0))) },
    {
      $project: {
        _id: 1,
        fullName: 1,
        username: 1,
        professions: 1,
        averageRating: 1,
        totalReviews: 1,
        city: 1,
        province: 1,
        distanceKm: { $round: [{ $divide: ["$distanceMeters", 1000] }, 1] },
      },
    },
  ];
}

function buildProviderContext(providers) {
  return providers.map((provider) => ({
    id: String(provider._id),
    name: provider.fullName || provider.username || "Local provider",
    categories: Array.isArray(provider.professions) ? provider.professions : [],
    rating: Number(provider.averageRating || 0),
    reviewCount: Number(provider.totalReviews || 0),
    location: [provider.city, provider.province].filter(Boolean).join(", "),
  }));
}

function findRequestedProfession(providers, message) {
  const providerProfessions = providers.flatMap((provider) => (
    Array.isArray(provider.professions) ? provider.professions : []
  ));
  const professions = [...new Set([...knownProfessions, ...providerProfessions]
    .filter((profession) => typeof profession === "string" && profession.trim()))]
    .sort((left, right) => right.length - left.length);
  const normalizedMessage = String(message || "");

  return professions.find((profession) => {
    const escapedProfession = escapeRegex(profession.trim());
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapedProfession}(?:s|es)?(?=$|[^\\p{L}\\p{N}])`, "iu")
      .test(normalizedMessage);
  }) || "";
}

function isTopRatedRequest(message, providers = []) {
  if (/\b(?:top\s+pros?|top[-\s]?rated|highest[-\s]?rated|best[-\s]?rated)\b/i.test(message)) {
    return true;
  }
  return Boolean(
    findRequestedProfession(providers, message) &&
    /\b(?:top|best|highest[-\s]?rated)\b/i.test(message)
  );
}

function isProviderRecommendationRequest(message, providers = []) {
  if (isTopRatedRequest(message, providers)) return true;
  return Boolean(
    findRequestedProfession(providers, message) &&
    /\b(?:find|show|recommend|suggest|who|looking\s+for|need|hire|book)\b/i.test(message)
  );
}

function selectProvidersForRequest(providers, message) {
  const asksForTopRated = isTopRatedRequest(message, providers);
  if (!asksForTopRated) return providers;

  const profession = findRequestedProfession(providers, message);
  return providers.filter((provider) => {
    const rating = Number(provider.averageRating);
    const reviewCount = Number(provider.totalReviews);
    const hasReviews = Number.isFinite(rating) && rating > 0 && Number.isFinite(reviewCount) && reviewCount > 0;
    const matchesProfession = !profession || (Array.isArray(provider.professions) && provider.professions.includes(profession));
    return hasReviews && matchesProfession;
  }).sort((left, right) => (
    Number(right.averageRating) - Number(left.averageRating) ||
    Number(right.totalReviews) - Number(left.totalReviews)
  ));
}

function buildTopRatedEmptyResponse(location, providers, profession = "") {
  const area = [location.city, location.province].filter(Boolean).join(", ") || "your area";
  const fallbackProfession = providers
    .flatMap((provider) => Array.isArray(provider.professions) ? provider.professions : [])
    .find((item) => typeof item === "string" && item.trim());
  const service = profession || fallbackProfession ? ` ${profession || fallbackProfession}` : "";
  return `I couldn't find${service} providers within 5 km of you in ${area}. Try Explore to browse more providers.`;
}

function buildTopRatedRecommendations(location, providers, message) {
  const profession = findRequestedProfession(providers, message);
  const matchingProfession = (provider) => !profession || (
    Array.isArray(provider.professions) &&
    provider.professions.some((item) => String(item).toLowerCase() === profession.toLowerCase())
  );
  const reviewedProviders = providers
    .filter((provider) => (
      Number(provider.averageRating) > 0 &&
      Number(provider.totalReviews) > 0 &&
      matchingProfession(provider)
    ))
    .sort((left, right) => (
      Number(right.averageRating) - Number(left.averageRating) ||
      Number(right.totalReviews) - Number(left.totalReviews) ||
      Number(left.distanceKm ?? Infinity) - Number(right.distanceKm ?? Infinity)
    ))
    .slice(0, 3);
  const selectedIds = new Set(reviewedProviders.map((provider) => String(provider._id)));
  const newProviders = providers
    .filter((provider) => (
      !selectedIds.has(String(provider._id)) &&
      Number(provider.averageRating || 0) <= 0 &&
      Number(provider.totalReviews || 0) <= 0 &&
      matchingProfession(provider)
    ))
    .sort((left, right) => (
      Number(left.distanceKm ?? Infinity) - Number(right.distanceKm ?? Infinity) ||
      new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
    ))
    .slice(0, Math.max(0, 3 - reviewedProviders.length));
  const recommendedProviders = [...reviewedProviders, ...newProviders];
  const area = [location.city, location.province].filter(Boolean).join(", ") || "your area";

  if (!recommendedProviders.length) {
    return {
      type: "text",
      response: buildTopRatedEmptyResponse(location, providers, profession),
    };
  }

  const label = profession ? `${profession}s` : "local pros";
  const ratedCount = reviewedProviders.length;
  const newCount = newProviders.length;
  const ratedIntro = ratedCount === 0
    ? `I couldn't find rated ${label}`
    : ratedCount === 1
    ? `Here is the highest-rated ${profession || "local pro"}`
    : `Here are the top ${ratedCount} ${label}`;
  const intro = `🐼 ${ratedIntro} within 5 km of you in ${area}${newCount
    ? `. I’ve added ${newCount === 1 ? "a nearby new provider" : `${newCount} nearby new providers`} with no ratings yet`
    : ""}.`;
  return {
    type: "recommendation_cards",
    intro,
    providers: recommendedProviders.map((provider) => {
      const professions = Array.isArray(provider.professions) ? provider.professions : [];
      const rating = Number(provider.averageRating);
      const reviewCount = Number(provider.totalReviews);
      const providerLocation = [provider.city, provider.province].filter(Boolean).join(", ");
      return {
        providerId: String(provider._id),
        name: provider.fullName || provider.username || "Local provider",
        category: profession || professions[0] || "TaskPanda professional",
        rating: Math.min(5, Math.max(0, rating)),
        reviewCount: Math.max(0, Math.floor(reviewCount)),
        isNew: reviewCount <= 0,
        distanceKm: provider.distanceKm != null && Number.isFinite(Number(provider.distanceKm))
          ? Number(provider.distanceKm)
          : null,
        ...(providerLocation ? { location: providerLocation } : {}),
      };
    }),
  };
}

function buildBookingContext(bookings) {
  const statusLabels = {
    pending: "Pending Request",
    "pending request": "Pending Request",
    approved: "Confirmed",
    confirmed: "Confirmed",
    en_route: "On the Way",
    "on the way": "On the Way",
    in_progress: "In Progress",
    "in progress": "In Progress",
    complete: "Completed",
    completed: "Completed",
    closed: "Completed",
    settled: "Settled",
    cancel_requested: "Cancellation Requested",
    canceled: "Cancelled",
    cancelled: "Cancelled",
    declined: "Declined",
    expired: "Expired",
    in_revision: "In Revision",
    disputed: "Disputed",
  };

  return bookings.map((booking) => {
    const statusCode = String(booking.status || "pending").trim().toLowerCase();
    const serviceDate = booking.serviceDate ? new Date(booking.serviceDate) : null;
    const settledAt = booking.settledAt ? new Date(booking.settledAt) : null;
    return {
      bookingRef: String(booking._id).slice(-6),
      task: String(booking.repairDescription || "").slice(0, 160),
      status: statusLabels[statusCode] || statusCode,
      serviceDate: serviceDate && Number.isFinite(serviceDate.getTime()) ? serviceDate.toISOString() : null,
      timeSlot: booking.timeSlot || "",
      paymentMethod: booking.paymentMethod || "cash",
      clientConfirmedCash: Boolean(booking.clientConfirmedCash || booking.cashPaidConfirmedAt),
      providerConfirmedCash: Boolean(booking.providerConfirmedCash || booking.cashReceivedConfirmedAt),
      settledAt: settledAt && Number.isFinite(settledAt.getTime()) ? settledAt.toISOString() : null,
      receiptNumber: booking.cashReceipt?.receiptNumber || null,
    };
  });
}

function buildRewardContext(user) {
  const vouchers = Array.isArray(user.vouchers) ? user.vouchers : [];
  return {
    stampProgress: Math.max(0, Math.min(5, Number(user.stampProgress) || 0)),
    stampsRequired: 5,
    activeStampVouchers: vouchers
      .filter((voucher) => voucher.origin === "stamp-card" && voucher.status === "active")
      .map((voucher) => ({
        amount: Number(voucher.amount) || 0,
        expiresAt: voucher.expiresAt || null,
      })),
  };
}

function parsePandaBotResponse(text, providers) {
  const parsed = JSON.parse(text);
  const message = typeof parsed.message === "string" ? parsed.message.trim() : "";
  if (!message || !Array.isArray(parsed.providerIds)) {
    throw new TypeError("PandaBot returned an invalid response shape.");
  }

  const providerById = new Map(providers.map((provider) => [String(provider._id), provider]));
  const seenIds = new Set();
  const recommendations = [];

  for (const rawId of parsed.providerIds) {
    const id = typeof rawId === "string" ? rawId : "";
    const provider = providerById.get(id);
    if (!provider || seenIds.has(id)) continue;
    seenIds.add(id);

    const professions = Array.isArray(provider.professions) ? provider.professions : [];
    const rating = Number(provider.averageRating || 0);
    const reviewCount = Number(provider.totalReviews || 0);
    recommendations.push({
      id,
      name: provider.fullName || provider.username || "Local provider",
      category: professions[0] || "TaskPanda professional",
      rating: Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : 0,
      reviewCount: Number.isFinite(reviewCount) ? Math.max(0, Math.floor(reviewCount)) : 0,
      location: [provider.city, provider.province].filter(Boolean).join(", "),
    });
    if (recommendations.length === 3) break;
  }

  return { message, recommendations };
}

module.exports = {
  buildProviderContext,
  buildProviderFilter,
  normalizeCoordinates,
  buildNearbyProviderPipeline,
  selectProvidersForRequest,
  isTopRatedRequest,
  isProviderRecommendationRequest,
  findRequestedProfession,
  buildTopRatedRecommendations,
  buildTopRatedEmptyResponse,
  buildBookingContext,
  buildRewardContext,
  normalizeUserLocation,
  parsePandaBotResponse,
  responseSchema,
  systemInstruction,
};