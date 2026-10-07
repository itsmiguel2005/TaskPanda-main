const mongoose = require("mongoose");
const { Type } = require("@google/genai");

const systemInstruction = `You are PandaBot, the official AI customer support and matching assistant for TaskPanda, an on-demand service marketplace. Be friendly, concise, actionable, and use a warm panda-mascot tone. Use supplied account context to answer questions about the caller's own recent bookings, their exact status, cash confirmations, settlement, and receipt number; never claim access to records not included in that context. If no matching booking is supplied, say you could not find it in the recent records and direct the user to Bookings. Explain the Pending, Confirmed, On the Way, In Progress, Completed, and Settled booking flow. Use supplied reward context for the caller's current bamboo stamp progress and active stamp vouchers; one settled booking earns one stamp, and five stamps earn a PHP 50 travel-fee voucher. Give general account-security guidance and explain that disputes should be reported through the relevant booking in the app. For local matching, use only the provider records supplied with the request. Match at the city and region level across the whole city; do not restrict recommendations to the user's barangay or imply that the user is searching only within one barangay. Recommend only providers whose IDs are in that data, match their category and location to the user's request, and use their provided ratings and review counts exactly. Never invent a provider, rating, review count, service area, availability, booking, receipt, or reward state. If no supplied provider is a reasonable local match, say so and direct the user to Explore. Recommendations are location-aware across regions and cities, never limited to a single city. Return only JSON with a concise message string and a providerIds array containing zero to three IDs copied from the supplied providers.`;

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

function selectProvidersForRequest(providers, message) {
  const asksForTopRated = isTopRatedRequest(message);
  if (!asksForTopRated) return providers;

  return providers.filter((provider) => {
    const rating = Number(provider.averageRating);
    const reviewCount = Number(provider.totalReviews);
    return Number.isFinite(rating) && rating > 0 && Number.isFinite(reviewCount) && reviewCount > 0;
  });
}

function isTopRatedRequest(message) {
  return /\b(?:top\s+pros?|top[-\s]?rated|highest[-\s]?rated|best[-\s]?rated)\b/i.test(message);
}

function buildTopRatedEmptyResponse(location, providers) {
  const area = [location.city, location.province].filter(Boolean).join(", ") || "your city";
  if (providers.length === 0) {
    return `I checked across ${area}, not just one barangay, but there are no active, location-listed professionals available to rank right now. Try Explore to search nearby areas.`;
  }

  const categories = [...new Set(providers.flatMap((provider) => Array.isArray(provider.professions) ? provider.professions : []))]
    .filter(Boolean)
    .slice(0, 3);
  const categoryText = categories.length ? ` I found local ${categories.join(", ")} profile${categories.length > 1 ? "s" : ""}` : " I found local provider profiles";
  return `I checked across ${area}, not just one barangay.${categoryText}, but they do not have customer reviews yet, so I can't fairly rank them as top pros. Open Explore to browse all citywide options.`;
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
  selectProvidersForRequest,
  isTopRatedRequest,
  buildTopRatedEmptyResponse,
  buildBookingContext,
  buildRewardContext,
  normalizeUserLocation,
  parsePandaBotResponse,
  responseSchema,
  systemInstruction,
};