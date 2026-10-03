const mongoose = require("mongoose");
const Booking = require("../models/Booking");

const MILESTONES = [5, 10, 25, 50];
const TRACKED_STATUSES = [
  "approved",
  "en_route",
  "in_progress",
  "in_revision",
  "disputed",
  "cancel_requested",
  "complete",
  "closed",
  "settled",
  "Confirmed",
  "On the Way",
  "In Progress",
  "Disputed",
  "Cancellation Requested",
  "Completed",
  "Settled",
];

const manilaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const TRACKED_STATUS_SET = new Set(TRACKED_STATUSES.map(normalizedStatus));

function manilaDateKey(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = manilaDateFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${values.year}-${values.month}-${values.day}`;
}

function serviceDateKey(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function slotMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  return hours * 60 + Number(match[2]);
}

function normalizedStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function completionTime(booking) {
  if (booking.workCompletedAt || booking.completionSubmittedAt) {
    return booking.workCompletedAt || booking.completionSubmittedAt;
  }
  const completionEvent = [...(booking.statusHistory || [])]
    .reverse()
    .find((event) => ["complete", "completed", "closed", "settled"].includes(normalizedStatus(event.status)));
  return completionEvent?.at || null;
}

function makeSummary(count) {
  const earned = MILESTONES.filter((milestone) => count >= milestone);
  return {
    count,
    milestone: earned.length ? earned[earned.length - 1] : null,
    nextMilestone: MILESTONES.find((milestone) => count < milestone) || null,
  };
}

function calculateProviderStreak(bookings, now = new Date()) {
  const todayKey = manilaDateKey(now);
  const scheduledBookings = (Array.isArray(bookings) ? bookings : [])
    .map((booking) => ({
      ...booking,
      statusCode: normalizedStatus(booking.status),
      serviceDay: serviceDateKey(booking.serviceDate),
    }))
    .filter((booking) => booking.serviceDay && TRACKED_STATUS_SET.has(booking.statusCode))
    .sort((a, b) => (
      b.serviceDay.localeCompare(a.serviceDay) ||
      slotMinutes(b.timeSlot) - slotMinutes(a.timeSlot) ||
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    ));

  let count = 0;
  for (const booking of scheduledBookings) {
    if (booking.serviceDay > todayKey) continue;

    const isCompleted = ["complete", "closed", "settled", "completed"].includes(booking.statusCode);
    if (!isCompleted) {
      if (booking.serviceDay < todayKey) break;
      continue;
    }

    const completedAt = completionTime(booking);
    if (
      !completedAt ||
      new Date(completedAt).getTime() > now.getTime() ||
      manilaDateKey(completedAt) !== booking.serviceDay
    ) {
      break;
    }
    count += 1;
  }

  return makeSummary(count);
}

async function getProviderStreaks(providerIds, now = new Date()) {
  const ids = [...new Set((providerIds || []).map(String).filter(Boolean))];
  if (!ids.length) return new Map();

  const bookings = await Booking.find(mongoose.trusted({
    providerId: mongoose.trusted({ $in: ids }),
    status: mongoose.trusted({ $in: TRACKED_STATUSES }),
  }))
    .select("providerId serviceDate timeSlot status workCompletedAt completionSubmittedAt statusHistory createdAt")
    .lean();
  const byProvider = new Map(ids.map((id) => [id, []]));
  for (const booking of bookings) {
    const providerId = String(booking.providerId);
    if (byProvider.has(providerId)) byProvider.get(providerId).push(booking);
  }

  return new Map([...byProvider].map(([id, providerBookings]) => [
    id,
    calculateProviderStreak(providerBookings, now),
  ]));
}

module.exports = {
  MILESTONES,
  calculateProviderStreak,
  getProviderStreaks,
};
