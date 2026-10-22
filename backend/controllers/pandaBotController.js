const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const {
  getPhilippineDateOffset,
  normalizeName,
  parseRequestedServiceDate,
} = require("../services/pandaBot");

const ACTIVE_BOOKING_STATUSES = [
  "PENDING", "APPROVED", "ON_THE_WAY", "IN_PROGRESS", "CANCEL_REQUESTED",
  "pending", "approved", "en_route", "in_progress", "cancel_requested",
  "Pending Request", "Confirmed", "On the Way", "In Progress", "Cancellation Requested",
];

const BOOKING_STATUS_LABELS = {
  pending: "Pending approval",
  "pending request": "Pending approval",
  approved: "Confirmed",
  confirmed: "Confirmed",
  on_the_way: "On the way",
  en_route: "On the way",
  "on the way": "On the way",
  in_progress: "In progress",
  "in progress": "In progress",
  cancel_requested: "Cancellation requested",
  "cancellation requested": "Cancellation requested",
  refund_pending: "Refund pending",
  disputed: "Disputed",
  canceled: "Cancelled",
  cancelled: "Cancelled",
};

function isBookingTrackingRequest(message) {
  return /\b(?:my bookings?|my requests?|my services?|my provider)\b/i.test(message) ||
    /\b(?:where(?:'s| is)|when(?: will| is| can)?|what(?:'s| is))\s+my\b/i.test(message) ||
    /\b(?:track|check|view|show|find|update|status|where|when)\b.{0,60}\b(?:my booking|my request|my provider|my service|booking status|request status)\b/i.test(message) ||
    /\b(?:where(?:'s| is)|status of|update on|track)\b.{0,60}\b(?:provider|booking|request|service)\b/i.test(message);
}

function isBookingTrackingFollowUp(conversationHistory, message = "") {
  if (!Array.isArray(conversationHistory)) return false;
  const assistantMessages = conversationHistory.filter((entry) => entry?.role === "assistant");
  const latestAssistant = assistantMessages[assistantMessages.length - 1];
  if (latestAssistant?.contextBookingTracking === true) return true;
  return latestAssistant?.contextIntent === "client_booking_tracking" &&
    Boolean(getRequestedDateRangeFromMessage(message || latestUserMessage(conversationHistory)));
}

function latestUserMessage(conversationHistory) {
  if (!Array.isArray(conversationHistory)) return "";
  for (let index = conversationHistory.length - 1; index >= 0; index -= 1) {
    if (conversationHistory[index]?.role === "user" && typeof conversationHistory[index].text === "string") {
      return conversationHistory[index].text;
    }
  }
  return "";
}

function getRequestedDateRangeFromMessage(message, now = new Date()) {
  const normalized = String(message || "").toLowerCase();
  let startDate = "";
  let endDate = "";
  if (/\bnext week\b/.test(normalized) || /\bthis week\b/.test(normalized)) {
    const today = getPhilippineDateOffset(0, now);
    const [year, month, day] = today.split("-").map(Number);
    const todayUtc = new Date(Date.UTC(year, month - 1, day));
    const daysSinceMonday = (todayUtc.getUTCDay() + 6) % 7;
    const isNextWeek = /\bnext week\b/.test(normalized);
    const start = isNextWeek
      ? new Date(Date.UTC(year, month - 1, day + 7 - daysSinceMonday))
      : todayUtc;
    startDate = start.toISOString().slice(0, 10);
    endDate = isNextWeek
      ? new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : new Date(Date.UTC(year, month - 1, day + 7 - daysSinceMonday)).toISOString().slice(0, 10);
  } else {
    const requestedDate = parseRequestedServiceDate(message, now);
    if (requestedDate) {
      startDate = requestedDate;
      const [year, month, day] = requestedDate.split("-").map(Number);
      endDate = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    }
  }
  if (!startDate || !endDate) return null;
  return {
    serviceDateFrom: new Date(`${startDate}T00:00:00.000Z`),
    serviceDateUntil: new Date(`${endDate}T00:00:00.000Z`),
  };
}

function getFirstName(user) {
  return String(user?.fullName || "").trim().split(/\s+/)[0] || "";
}

function getFriendlyPrefix(user, conversationHistory = []) {
  const firstName = getFirstName(user);
  return firstName && !hasPriorAssistantMessage(conversationHistory) ? `Hey, ${firstName} — ` : "";
}

function isGreetingOrOpenQuestion(message) {
  return isSimpleGreeting(message) ||
    isCasualAcknowledgment(message) ||
    isOpenHelpQuestion(message);
}

function isOpenHelpQuestion(message) {
  return isCapabilitiesQuestion(message) ||
    /^\s*(?:can you help(?: me)?(?: with (?:something|anything))?|could you help me(?: with (?:something|anything))?|i need some help)\s*[?.!]*$/i.test(message);
}

function isCapabilitiesQuestion(message) {
  return /^\s*(?:what can you do|what can you help me with|what (?:questions )?can i ask(?: you)?|what should i ask|what are (?:some )?(?:possible )?(?:commands|examples|options)|(?:show|list) (?:me )?(?:(?:some|your|available|possible) )?(?:commands|examples|options)|(?:commands|examples|options) (?:you support|can i use))\s*[?.!]*$/i.test(message);
}

function isSimpleGreeting(message) {
  return /^\s*(?:hi|hello|hey|sup|good morning|good afternoon|good evening)\b(?:[\s,]+(?:pandabot|panda bot|there))?[\s!.?,]*$/i.test(message);
}

function isCasualAcknowledgment(message) {
  return /^\s*(?:thanks?(?: so much)?|thank you(?: so much)?|okay|ok|got it|cool|great|awesome|nice|sounds good|alright|all right)\b[\s!.?,]*$/i.test(message);
}

function hasRecentAssistantIntroduction(conversationHistory) {
  if (!Array.isArray(conversationHistory)) return false;
  return conversationHistory.some((entry) => (
    entry?.role === "assistant" && (
      entry.contextIntroduction === true ||
      entry.isIntroduction === true ||
      /\b(?:i can help (?:you )?(?:with|check|find|keep tabs)|i['’]m pandabot)\b/i.test(
        typeof entry.text === "string" ? entry.text : "",
      )
    )
  ));
}

function hasPriorAssistantMessage(conversationHistory) {
  return Array.isArray(conversationHistory) &&
    conversationHistory.some((entry) => entry?.role === "assistant");
}

function sanitizeConversationHistory(conversationHistory) {
  if (!Array.isArray(conversationHistory)) return [];
  return conversationHistory
    .filter((entry) => (
      entry &&
      (entry.role === "assistant" || entry.role === "user") &&
      typeof entry.text === "string"
    ))
    .map((entry) => ({
      role: entry.role,
      text: entry.text.slice(0, 4000),
      ...(entry.role === "assistant" && typeof entry.contextIntent === "string"
        ? { contextIntent: entry.contextIntent.slice(0, 80) }
        : {}),
      ...(entry.role === "assistant" && entry.contextIntroduction === true
        ? { contextIntroduction: true }
        : {}),
      ...(entry.role === "assistant" && entry.contextBookingTracking === true
        ? { contextBookingTracking: true }
        : {}),
      ...(entry.role === "assistant" && Array.isArray(entry.providerIds)
        ? { providerIds: entry.providerIds.filter((id) => typeof id === "string").slice(0, 3) }
        : {}),
      ...(entry.role === "assistant" && Array.isArray(entry.contextProviderIds)
        ? { contextProviderIds: entry.contextProviderIds.filter((id) => typeof id === "string").slice(0, 3) }
        : {}),
      ...(entry.role === "assistant" && typeof entry.contextRequestedDate === "string"
        ? { contextRequestedDate: entry.contextRequestedDate.slice(0, 10) }
        : {}),
    }));
}

function buildFriendlyOpening(user, message, role = "client", conversationHistory = []) {
  const firstName = getFirstName(user);
  const name = firstName && !hasPriorAssistantMessage(conversationHistory) ? ` ${firstName}` : "";
  const alreadyIntroduced = hasRecentAssistantIntroduction(conversationHistory);
  if (isCapabilitiesQuestion(message)) {
    return role === "provider"
      ? `${name ? `Of course,${name}` : "Of course"}! I can show pending requests, list your active jobs by date, check cash earnings and payment confirmations, and show your rating or verification status. Try “Show my pending requests,” “What jobs do I have tomorrow?” or “Show my earnings this week.” I can also move an eligible job to On the Way or In Progress when you identify the client; I can’t mark a job completed for you.`
      : `${name ? `Of course,${name}` : "Of course"}! I can find nearby pros, check availability, show your active bookings or favourites, and explain rewards, payments, and receipts. Try “Find a plumber near me,” “Is my plumber available tomorrow?” or “Track my booking.” I can guide you through reporting an issue, but I can’t submit it for you.`;
  }
  if (isCasualAcknowledgment(message)) {
    if (/^(?:thanks?|thank you)/i.test(message.trim())) {
      return `You’re welcome${name ? `,${name}` : ""}! Want me to check anything else?`;
    }
    return `Got it${name ? `,${name}` : ""}! What would you like to do next?`;
  }
  if (isSimpleGreeting(message)) {
    return alreadyIntroduced
      ? `Hey again${name ? `,${name}` : ""}! What can I help you with right now?`
      : `Hey${name}! How’s your day going, and what can I help you with?`;
  }
  if (alreadyIntroduced) {
    return `Of course${name ? `,${name}` : ""}—what are you trying to sort out?`;
  }
  if (/\bwhat can you help me with\b/i.test(message)) {
    const examples = role === "provider"
      ? "I can check your schedule or earnings"
      : "I can check a booking or help find a local pro";
    return `Of course${name ? `,${name}` : ""}—${examples}; what do you need a hand with?`;
  }
  const greeting = firstName ? `Of course, ${firstName}` : "Of course";
  const helpOffer = role === "provider"
    ? "I can check your schedule or earnings"
    : "I can check a booking or help find a local pro";
  return `${greeting}—${helpOffer}; what do you need a hand with?`;
}

function buildUserRelevantBookingsFilter(clientId, dateRange = null) {
  const filter = {
    clientId,
    status: mongoose.trusted({ $in: ACTIVE_BOOKING_STATUSES }),
  };
  if (dateRange) {
    filter.serviceDate = mongoose.trusted({
      $gte: dateRange.serviceDateFrom,
      $lt: dateRange.serviceDateUntil,
    });
  }
  return filter;
}

async function fetchUserRelevantBookings(clientId, dateRange = null) {
  return Booking.find(buildUserRelevantBookingsFilter(clientId, dateRange))
    .select("_id providerId status serviceDate timeSlot repairDescription")
    .populate({ path: "providerId", select: "fullName username professions" })
    .sort({ serviceDate: 1, createdAt: -1 })
    .lean();
}

function getProviderName(booking) {
  const provider = booking.providerId;
  if (!provider || typeof provider !== "object") return "Provider";
  return provider.fullName || provider.username || "Provider";
}

function getBookingProfession(booking) {
  const provider = booking.providerId;
  return booking.serviceCategory ||
    booking.category ||
    (Array.isArray(provider?.professions) ? provider.professions[0] : "") ||
    "Service category unavailable";
}

function getBookingStatusLabel(status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  return BOOKING_STATUS_LABELS[normalizedStatus] ||
    normalizedStatus.replace(/[_\s]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) ||
    "Status unavailable";
}

function getScheduledDateTime(booking) {
  const date = booking.serviceDate ? new Date(booking.serviceDate) : null;
  if (!date || !Number.isFinite(date.getTime())) return "Schedule unavailable";
  const formattedDate = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(date);
  return `${formattedDate}${booking.timeSlot ? ` at ${booking.timeSlot}` : ""}`;
}

function buildBookingDetails(booking, user, conversationHistory = []) {
  return [
    `${getFriendlyPrefix(user, conversationHistory)}I found your booking:`,
    "",
    `- **Provider:** ${getProviderName(booking)}`,
    `- **Service:** ${getBookingProfession(booking)}`,
    `- **Status:** ${getBookingStatusLabel(booking.status)}`,
    `- **Scheduled:** ${getScheduledDateTime(booking)}`,
  ].join("\n");
}

function findBookingSelectionMatches(bookings, message) {
  const normalizedMessage = ` ${normalizeName(message)} `;
  return bookings.filter((booking) => {
    const name = normalizeName(getProviderName(booking));
    const profession = normalizeName(getBookingProfession(booking));
    const nameMatches = name.split(" ").some((part) => normalizedMessage.includes(` ${part} `));
    return nameMatches ||
      (profession && normalizedMessage.includes(` ${profession} `));
  });
}

function buildBookingTrackingResponse(bookings, message = "", user = null, conversationHistory = []) {
  const firstName = hasPriorAssistantMessage(conversationHistory) ? "" : getFirstName(user);
  const greeting = firstName ? `Hey, ${firstName} — ` : "";
  if (!bookings.length) {
    if (/\btomorrow\b/i.test(message)) {
      return `${greeting}No active bookings are scheduled for tomorrow either! You're all clear.`;
    }
    if (/\btoday\b/i.test(message)) {
      return `${greeting}No active bookings are scheduled for today.`;
    }
    return `${greeting}I couldn’t find any active bookings.`;
  }
  if (bookings.length === 1) {
    return buildBookingDetails(bookings[0], user, conversationHistory);
  }

  const selectedBookings = findBookingSelectionMatches(bookings, message);
  if (selectedBookings.length === 1) {
    return buildBookingDetails(selectedBookings[0], user, conversationHistory);
  }

  const choices = (selectedBookings.length ? selectedBookings : bookings)
    .map((booking, index) => (
      `${index + 1}) ${getProviderName(booking)} (${getBookingProfession(booking)}) - ${getBookingStatusLabel(booking.status)}`
    ))
    .join(", ");
  const prompt = selectedBookings.length
    ? "I found more than one booking matching that provider or profession. Which scheduled booking should I check?"
    : "Which provider name or profession would you like me to check?";
  const intro = selectedBookings.length
    ? `I found ${selectedBookings.length} matching bookings`
    : `I found ${bookings.length} bookings`;
  return `${greeting}${intro}: ${choices}. ${prompt}`;
}

async function handleBookingTrackingRequest(req, res, message) {
  const dateRange = getRequestedDateRangeFromMessage(message);
  const bookings = await fetchUserRelevantBookings(req.user._id, dateRange);
  const selectedBookings = findBookingSelectionMatches(bookings, message);
  return res.json({
    type: "text",
    response: buildBookingTrackingResponse(bookings, message, req.user, req.body?.conversationHistory),
    contextBookingTracking: bookings.length > 1 && selectedBookings.length !== 1,
    contextIntent: "client_booking_tracking",
  });
}

module.exports = {
  buildBookingDetails,
  buildBookingTrackingResponse,
  buildFriendlyOpening,
  buildUserRelevantBookingsFilter,
  fetchUserRelevantBookings,
  getFirstName,
  getRequestedDateRangeFromMessage,
  hasPriorAssistantMessage,
  findBookingSelectionMatches,
  hasRecentAssistantIntroduction,
  handleBookingTrackingRequest,
  isBookingTrackingFollowUp,
  isBookingTrackingRequest,
  isCasualAcknowledgment,
  isCapabilitiesQuestion,
  isGreetingOrOpenQuestion,
  isOpenHelpQuestion,
  sanitizeConversationHistory,
  isSimpleGreeting,
};
