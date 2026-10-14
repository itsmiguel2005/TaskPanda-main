const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { normalizeName } = require("../services/pandaBot");

const ACTIVE_BOOKING_STATUSES = [
  "PENDING", "APPROVED", "ON_THE_WAY", "IN_PROGRESS",
  "pending", "approved", "en_route", "in_progress",
  "Pending Request", "Confirmed", "On the Way", "In Progress",
];
const REFUND_OR_DISPUTE_STATUSES = [
  "REFUND_PENDING", "DISPUTED", "refund_pending", "disputed", "Disputed",
];
const CANCELLATION_STATUSES = ["CANCELLED", "canceled", "cancelled", "Cancelled"];

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

function isBookingTrackingFollowUp(conversationHistory) {
  if (!Array.isArray(conversationHistory)) return false;
  const assistantMessages = conversationHistory.filter((entry) => entry?.role === "assistant");
  return assistantMessages[assistantMessages.length - 1]?.contextBookingTracking === true;
}

function buildUserRelevantBookingsFilter(clientId, now = new Date()) {
  const cancelledSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return {
    clientId,
    $or: [
      { status: mongoose.trusted({ $in: ACTIVE_BOOKING_STATUSES }) },
      { status: mongoose.trusted({ $in: REFUND_OR_DISPUTE_STATUSES }) },
      {
        status: mongoose.trusted({ $in: CANCELLATION_STATUSES }),
        updatedAt: mongoose.trusted({ $gte: cancelledSince }),
      },
    ],
  };
}

async function fetchUserRelevantBookings(clientId) {
  return Booking.find(buildUserRelevantBookingsFilter(clientId))
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

function buildBookingDetails(booking) {
  return [
    `Provider Name: ${getProviderName(booking)}`,
    `Service Category: ${getBookingProfession(booking)}`,
    `Booking Status: ${getBookingStatusLabel(booking.status)}`,
    `Scheduled Date/Time: ${getScheduledDateTime(booking)}`,
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

function buildBookingTrackingResponse(bookings, message = "") {
  if (!bookings.length) {
    return "You currently have no active, pending, disputed, refund-pending, or recently canceled bookings.";
  }
  if (bookings.length === 1) {
    return buildBookingDetails(bookings[0]);
  }

  const selectedBookings = findBookingSelectionMatches(bookings, message);
  if (selectedBookings.length === 1) {
    return buildBookingDetails(selectedBookings[0]);
  }

  const choices = (selectedBookings.length ? selectedBookings : bookings)
    .map((booking, index) => (
      `${index + 1}) ${getProviderName(booking)} (${getBookingProfession(booking)}) - ${getBookingStatusLabel(booking.status)}`
    ))
    .join(", ");
  const prompt = selectedBookings.length
    ? "I found more than one booking matching that provider or profession. Which scheduled booking do you mean?"
    : "Which provider name or profession would you like to check?";
  const intro = selectedBookings.length
    ? `I found ${selectedBookings.length} matching bookings`
    : `I found ${bookings.length} bookings`;
  return `${intro}: ${choices}. ${prompt}`;
}

async function handleBookingTrackingRequest(req, res, message) {
  const bookings = await fetchUserRelevantBookings(req.user._id);
  const selectedBookings = findBookingSelectionMatches(bookings, message);
  return res.json({
    type: "text",
    response: buildBookingTrackingResponse(bookings, message),
    contextBookingTracking: bookings.length > 1 && selectedBookings.length !== 1,
  });
}

module.exports = {
  buildBookingDetails,
  buildBookingTrackingResponse,
  buildUserRelevantBookingsFilter,
  fetchUserRelevantBookings,
  findBookingSelectionMatches,
  handleBookingTrackingRequest,
  isBookingTrackingFollowUp,
  isBookingTrackingRequest,
};
