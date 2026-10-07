const mongoose = require("mongoose");
const { randomBytes } = require("crypto");
const Booking = require("../models/Booking");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const UserDashboardDismissal = require("../models/UserDashboardDismissal");
const { ensureBookingConversation, appendBookingSystemMessage } = require("../services/bookingMessaging");
const { sendPushNotification } = require("../services/oneSignal");
const {
  calculateDistanceKm,
  calculateDurationAdjustedTaskOffer,
  calculateTravelFare,
  calculateTravelFeeDiscount,
  calculateTotalPrice,
} = require("../services/bookingPricing");
const { awardSettledBookingStamp, restoreVoucherForBooking } = require("../services/rewards");
const { getGlobalSettings } = require("../services/systemSettings");
const { searchServiceLocations, reverseGeocodeServiceLocation } = require("../services/geocoder");
const {
  canArriveForSameDayBooking,
  DEFAULT_ESTIMATED_DURATION_MINUTES,
  getBookingOccupiedWindow,
  getBookingRequestExpiration,
  getScheduledServiceTime,
  hasScheduleConflict,
  isValidEstimatedDurationMinutes,
} = require("../services/bookingLifecycle");

const TIME_SLOTS = new Set(["7:30 AM", "9:00 AM", "10:30 AM", "1:30 PM", "3:00 PM", "4:30 PM", "6:00 PM"]);
const PH_TIMEZONE_OFFSET_HOURS = 8;
const STATUS_VALUES = new Set(["approved", "en_route", "in_progress", "canceled", "declined", "complete", "settled"]);
const STATUS_ALIASES = {
  "pending request": "pending",
  confirmed: "approved",
  "on the way": "en_route",
  "in progress": "in_progress",
  rejected: "declined",
  "declined by provider": "declined",
  cancelled: "canceled",
  completed: "complete",
  settled: "settled",
};
const STATUS_LABELS = {
  pending: "Pending Request",
  approved: "Confirmed",
  en_route: "On the Way",
  in_progress: "In Progress",
  cancel_requested: "Cancellation Requested",
  canceled: "Cancelled",
  declined: "Declined by Provider",
  complete: "Completed",
  in_revision: "In Revision",
  disputed: "Disputed",
  closed: "Completed",
  settled: "Settled",
  expired: "Expired",
};

const GRACE_PERIOD_MS = 10 * 60 * 1000;
const CASH_SETTLEMENT_GRACE_MS = 48 * 60 * 60 * 1000;
const ACTIVE_BOOKING_STATUSES = [
  "pending", "approved", "en_route", "in_progress", "cancel_requested",
  "Pending Request", "Confirmed", "On the Way", "In Progress", "Cancellation Requested",
];

async function notifyBooking(options) {
  try {
    await sendPushNotification(options);
  } catch (error) {
    console.warn("OneSignal booking notification failed:", error.message);
  }
}

function bookingUrl(role, bookingId) {
  const page = role === "provider" ? "/provider-bookings" : "/bookings";
  return `${page}?bookingId=${encodeURIComponent(String(bookingId))}`;
}

async function updateCounterOfferMessageStatus(bookingId, counterOfferId, status, respondedBy, respondedAt) {
  const conversation = await Conversation.findOne({ bookingId }).select("_id");
  if (!conversation) return;
  await Message.updateOne(
    {
      conversationId: conversation._id,
      eventType: "counter_offer",
      "eventData.counterOfferId": String(counterOfferId),
      "eventData.status": "pending",
    },
    {
      $set: {
        "eventData.status": status,
        "eventData.counteredBy": respondedBy,
        "eventData.respondedAt": respondedAt,
      },
    }
  );
}

function normalizeBookingStatus(value) {
  const normalizedStatus = String(value || "").trim().toLowerCase();
  return STATUS_ALIASES[normalizedStatus] || normalizedStatus;
}

function cancellationResponseWindow(serviceDate, timeSlot) {
  const appointmentTime = new Date(serviceDate);
  const match = String(timeSlot || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let hours = Number(match[1]) % 12;
    if (match[3].toUpperCase() === "PM") hours += 12;
    appointmentTime.setUTCHours(hours - PH_TIMEZONE_OFFSET_HOURS, Number(match[2]), 0, 0);
  }
  const hoursUntilService = (appointmentTime.getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursUntilService <= 24) return 2 * 60 * 60 * 1000;
  if (hoursUntilService <= 48) return 6 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function parseServiceDate(value) {
  const dateOnlyMatch = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnlyMatch
    ? new Date(Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3])))
    : new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isServiceSlotInPast(serviceDate, timeSlot) {
  const match = String(timeSlot || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return false;

  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  const appointmentTime = new Date(serviceDate);
  appointmentTime.setUTCHours(hours - PH_TIMEZONE_OFFSET_HOURS, Number(match[2]), 0, 0);
  return appointmentTime.getTime() <= Date.now();
}

function serializeBooking(booking) {
  const client = booking.clientId && typeof booking.clientId === "object" ? booking.clientId : null;
  const provider = booking.providerId && typeof booking.providerId === "object" ? booking.providerId : null;
  const statusCode = normalizeBookingStatus(booking.status);
  const repairDescription = booking.repairDescription || booking.description || booking.task || "";
  const serviceDate = booking.serviceDate || booking.date || booking.createdAt;
  const timeSlot = booking.timeSlot || booking.time || "";
  const offeredPrice = booking.offeredPrice ?? booking.offer ?? 0;
  const estimatedDurationMinutes = booking.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES;
  const travelDistanceKm = booking.travelDistanceKm ?? null;
  const travelFee = booking.travelFee ?? 0;
  const tipAmount = booking.tipAmount ?? 0;
  const totalPrice = calculateTotalPrice(offeredPrice, travelFee, tipAmount);
  const photoUrls = booking.photoUrl ? [booking.photoUrl] : [];
  const statusHistory = booking.statusHistory?.length
    ? booking.statusHistory.map((event) => ({ status: STATUS_LABELS[event.status] || event.status, at: event.at }))
    : [{ status: STATUS_LABELS.pending, at: booking.createdAt }];
  return {
    id: String(booking._id),
    clientId: String(client?._id || booking.clientId),
    providerId: String(provider?._id || booking.providerId),
    client: client?.fullName || client?.username || client?.email || "Client",
    clientProfileImage: client?.profileImage || "",
    worker: provider?.fullName || provider?.username || provider?.email || "Provider",
    workerProfileImage: provider?.profileImage || "",
    cred: provider?.professions?.join(" · ") || "Service provider",
    professions: provider?.professions || [],
    category: provider?.professions?.join(", ") || "Service provider",
    serviceCategory: provider?.professions?.join(", ") || "Service provider",
    task: repairDescription,
    description: repairDescription,
    repairDescription,
    address: booking.address || "Address to be confirmed",
    serviceGeoLocation: booking.serviceGeoLocation || null,
    date: new Date(serviceDate).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }),
    serviceDate: new Date(serviceDate).toISOString(),
    time: timeSlot,
    timeSlot,
    price: `P${totalPrice.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`,
    offer: offeredPrice,
    offeredPrice,
    taskOffer: offeredPrice,
    estimatedDurationMinutes,
    travelDistanceKm,
    travelFee,
    travelFeeBeforeDiscount: booking.travelFeeBeforeDiscount ?? travelFee,
    travelFeeDiscount: booking.travelFeeDiscount ?? 0,
    voucherId: booking.voucherId ? String(booking.voucherId) : null,
    tipAmount,
    totalPrice,
    paymentMethod: booking.paymentMethod || "cash",
    cashPaidConfirmedAt: booking.cashPaidConfirmedAt || null,
    cashReceivedConfirmedAt: booking.cashReceivedConfirmedAt || null,
    clientConfirmedCash: Boolean(booking.clientConfirmedCash || booking.cashPaidConfirmedAt),
    providerConfirmedCash: Boolean(booking.providerConfirmedCash || booking.cashReceivedConfirmedAt),
    workCompletedAt: booking.workCompletedAt || booking.completionSubmittedAt || null,
    settledAt: booking.settledAt || null,
    cashReceipt: booking.cashReceipt || null,
    completionNote: booking.completionNote || "",
    completionPhotos: booking.completionPhotos || [],
    completionSubmittedAt: booking.completionSubmittedAt || null,
    revisionRequests: (booking.revisionRequests || []).map((request) => ({
      id: String(request._id),
      note: request.note,
      photos: request.photos || [],
      status: request.status,
      responseNote: request.responseNote || "",
      createdAt: request.createdAt,
      respondedAt: request.respondedAt || null,
      addressedAt: request.addressedAt || null,
    })),
    urgency: booking.urgency,
    photoUrl: booking.photoUrl || "",
    photoUrls,
    status: STATUS_LABELS[statusCode] || "Pending Request",
    statusCode,
    requestExpiresAt: booking.requestExpiresAt || null,
    cancellationReason: booking.cancellationReason || "",
    cancellationRequestedBy: booking.cancellationRequestedBy || "",
    cancellationRequestedAt: booking.cancellationRequestedAt || null,
    cancellationExpiresAt: booking.cancellationExpiresAt || null,
    cancellationResolvedAt: booking.cancellationResolvedAt || null,
    cancellationOutcome: booking.cancellationOutcome || "",
    clientRating: booking.clientRating ?? null,
    clientReview: booking.clientReview || "",
    clientReviewPhotos: booking.clientReviewPhotos || [],
    reviewedAt: booking.reviewedAt || null,
    statusHistory,
    providerUpdates: (booking.providerUpdates || []).map((update) => ({
      id: String(update._id),
      type: update.type,
      note: update.note,
      proposedServiceDate: update.proposedServiceDate || null,
      proposedTimeSlot: update.proposedTimeSlot || "",
      status: update.status,
      requestedAt: update.requestedAt,
      respondedAt: update.respondedAt || null,
    })),
    lateNotice: booking.lateNotice?.eta ? {
      sourceBookingId: String(booking.lateNotice.sourceBookingId || ""),
      delayMinutes: booking.lateNotice.delayMinutes,
      eta: booking.lateNotice.eta,
      status: booking.lateNotice.status || "pending",
      notifiedAt: booking.lateNotice.notifiedAt || null,
      respondedAt: booking.lateNotice.respondedAt || null,
    } : null,
    counterOffers: (booking.counterOffers || []).map((offer) => ({
      id: String(offer._id),
      proposedBy: offer.proposedBy,
      proposedPrice: offer.proposedPrice ?? offeredPrice,
      counterOfferDurationMinutes: offer.counterOfferDurationMinutes ?? estimatedDurationMinutes,
      note: offer.note || "",
      status: offer.status,
      createdAt: offer.createdAt,
      respondedAt: offer.respondedAt || null,
    })),
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

function normalizeServiceGeoLocation(value) {
  let location = value;
  if (typeof location === "string") {
    try {
      location = JSON.parse(location);
    } catch {
      return null;
    }
  }
  const coordinates = location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  if (coordinates.some((coordinate) =>
    (typeof coordinate !== "number" && typeof coordinate !== "string") ||
    (typeof coordinate === "string" && !/^-?\d+(?:\.\d+)?$/.test(coordinate.trim()))
  )) return null;
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180 ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90
  ) return null;
  return { type: "Point", coordinates: [longitude, latitude] };
}

const populatePaths = [
  { path: "clientId", select: "fullName username email profileImage" },
  { path: "providerId", select: "fullName username email professions profileImage" },
];

async function recalculateProviderRatingSummary(providerId) {
  const summary = await Booking.aggregate([
    {
      $match: {
        providerId: new mongoose.Types.ObjectId(String(providerId)),
        status: { $in: ["complete", "closed", "settled", "Completed", "Settled"] },
        clientRating: { $ne: null },
      },
    },
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        averageRating: { $avg: "$clientRating" },
      },
    },
  ]);

  const totalReviews = Number(summary[0]?.totalReviews || 0);
  const averageRating = totalReviews > 0 ? Number(Number(summary[0].averageRating || 0).toFixed(1)) : 0;

  await User.findByIdAndUpdate(
    providerId,
    {
      averageRating,
      totalReviews,
    },
    { new: true }
  );

  return { averageRating, totalReviews };
}

async function handleListBookings(req, res) {
  try {
    const requestedClientId = req.query.clientId ? String(req.query.clientId) : "";
    const requestedProviderId = req.query.providerId ? String(req.query.providerId) : "";
    const requestedStatus = req.query.status ? String(req.query.status) : "";
    if (requestedClientId && !mongoose.isValidObjectId(requestedClientId)) return res.status(400).json({ message: "Invalid clientId filter." });
    if (requestedProviderId && !mongoose.isValidObjectId(requestedProviderId)) return res.status(400).json({ message: "Invalid providerId filter." });
    const normalizedStatus = normalizeBookingStatus(requestedStatus);
    if (requestedStatus && !["pending", "approved", "en_route", "in_progress", "cancel_requested", "canceled", "declined", "expired", "complete", "in_revision", "disputed", "closed", "settled"].includes(normalizedStatus)) return res.status(400).json({ message: "Invalid status filter." });

    const filter = {};
    if (normalizedStatus) {
      filter.status = normalizedStatus;
    } else {
      filter.status = mongoose.trusted({ $in: ["pending", "approved", "en_route", "in_progress", "cancel_requested", "canceled", "declined", "expired", "complete", "in_revision", "disputed", "closed", "settled", "Pending Request", "Confirmed", "On the Way", "In Progress", "Cancellation Requested", "Declined", "Declined by Provider", "Cancelled", "Completed", "Settled", "Expired"] });
    }
    if (req.user.role === "provider") {
      filter.providerId = req.user._id;
      if (requestedProviderId && requestedProviderId !== String(req.user._id)) return res.status(403).json({ message: "You can only view your own provider bookings." });
    } else {
      filter.clientId = req.user._id;
      if (requestedClientId && requestedClientId !== String(req.user._id)) return res.status(403).json({ message: "You can only view your own client bookings." });
    }

    const dashboardMode = req.query.dashboard === "true";
    let dismissedBookingIds = [];
    if (dashboardMode) {
      const dismissals = await UserDashboardDismissal.find({ userId: req.user._id, kind: "booking" })
        .select("targetId")
        .lean();
      dismissedBookingIds = dismissals.map((dismissal) => String(dismissal.targetId));
      if (dismissedBookingIds.length) {
        filter._id = mongoose.trusted({ $nin: dismissals.map((dismissal) => dismissal.targetId) });
      }
    }

    const bookings = await Booking.find(filter).sort({ createdAt: -1, _id: -1 }).populate(populatePaths);
    let reviewStats = null;
    if (dashboardMode && req.user.role === "provider") {
      const [aggregate] = await Booking.aggregate([
        { $match: { providerId: req.user._id, clientRating: { $type: "number" } } },
        { $group: { _id: null, averageRating: { $avg: "$clientRating" }, totalReviews: { $sum: 1 } } },
      ]);
      reviewStats = {
        averageRating: Number(aggregate?.averageRating || 0),
        totalReviews: Number(aggregate?.totalReviews || 0),
      };
    }
    return res.json({ bookings: bookings.map(serializeBooking), dismissedBookingIds, reviewStats });
  } catch (error) {
    console.error("List bookings error:", error);
    return res.status(500).json({
      message: error?.message || "Could not submit the booking.",
      details: process.env.NODE_ENV !== "production" ? String(error?.stack || error) : undefined,
    });
  }
}

async function handleDismissDashboardBookings(req, res) {
  const bookingIds = req.body?.bookingIds;
  if (!Array.isArray(bookingIds) || bookingIds.length > 500 || bookingIds.some((id) => !mongoose.isValidObjectId(id))) {
    return res.status(400).json({ message: "Provide up to 500 valid booking IDs." });
  }

  try {
    const statuses = req.user.role === "provider"
      ? ["settled", "canceled", "declined", "expired", "Settled", "Cancelled", "Declined by Provider", "Expired"]
      : ["complete", "closed", "settled", "canceled", "declined", "Completed", "Closed", "Settled", "Cancelled", "Declined by Provider"];
    const ownerField = req.user.role === "provider" ? "providerId" : "clientId";
    const eligibleBookings = await Booking.find({
      _id: mongoose.trusted({ $in: bookingIds }),
      [ownerField]: req.user._id,
      status: mongoose.trusted({ $in: statuses }),
    }).select("_id").lean();

    if (eligibleBookings.length) {
      await UserDashboardDismissal.bulkWrite(
        eligibleBookings.map((booking) => ({
          updateOne: {
            filter: { userId: req.user._id, kind: "booking", targetId: booking._id },
            update: { $setOnInsert: { userId: req.user._id, kind: "booking", targetId: booking._id } },
            upsert: true,
          },
        })),
        { ordered: false }
      );
    }

    return res.json({ dismissedBookingIds: eligibleBookings.map((booking) => String(booking._id)) });
  } catch (error) {
    if (error?.code === 11000) {
      const existingDismissals = await UserDashboardDismissal.find({
        userId: req.user._id,
        kind: "booking",
        targetId: mongoose.trusted({ $in: bookingIds }),
      }).select("targetId").lean();
      return res.json({ dismissedBookingIds: existingDismissals.map((item) => String(item.targetId)) });
    }
    console.error("Dashboard booking dismissal error:", error);
    return res.status(500).json({ message: "Could not dismiss the booking from your dashboard." });
  }
}

async function handleRestoreDashboardBookings(req, res) {
  try {
    await UserDashboardDismissal.deleteMany({ userId: req.user._id, kind: "booking" });
    return res.json({ restored: true });
  } catch (error) {
    console.error("Dashboard booking restore error:", error);
    return res.status(500).json({ message: "Could not restore dismissed dashboard bookings." });
  }
}

async function handleProviderAvailability(req, res) {
  const providerId = String(req.params.providerId || "");
  if (!mongoose.isValidObjectId(providerId)) return res.status(400).json({ message: "Choose a valid provider." });
  if (req.user.role !== "client") return res.status(403).json({ message: "Only clients can check provider availability." });

  try {
    const hasLatitude = req.query.latitude !== undefined;
    const hasLongitude = req.query.longitude !== undefined;
    if (hasLatitude !== hasLongitude) {
      return res.status(400).json({ message: "Choose a valid service location pin." });
    }
    const serviceGeoLocation = hasLatitude
      ? normalizeServiceGeoLocation({
        type: "Point",
        coordinates: [req.query.longitude, req.query.latitude],
      })
      : null;
    if (hasLatitude && !serviceGeoLocation) {
      return res.status(400).json({ message: "Choose a valid service location pin." });
    }

    const travelQuote = await getBookingTravelQuote(req.user, providerId, null, serviceGeoLocation);
    if (travelQuote.errorStatus) return res.status(travelQuote.errorStatus).json({ message: travelQuote.message });
    const provider = travelQuote.provider;
    if (!provider) return res.status(404).json({ message: "That provider is no longer available." });

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const bookings = await Booking.find({
      providerId: provider._id,
      serviceDate: mongoose.trusted({ $gte: startOfToday }),
      status: mongoose.trusted({ $in: ACTIVE_BOOKING_STATUSES }),
    }).select("_id serviceDate timeSlot estimatedDurationMinutes serviceGeoLocation").lean();

    return res.json({
      bookedSlots: bookings.map((booking) => {
        const occupiedWindow = getBookingOccupiedWindow(booking);
        return {
          id: String(booking._id),
          date: new Date(booking.serviceDate).toISOString().slice(0, 10),
          timeSlot: booking.timeSlot,
          estimatedDurationMinutes: booking.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES,
          serviceGeoLocation: booking.serviceGeoLocation || null,
          startAt: occupiedWindow?.startAt.toISOString() || null,
          occupiedUntil: occupiedWindow?.endAt.toISOString() || null,
        };
      }),
      travelDistanceKm: travelQuote.travelDistanceKm,
      travelFee: travelQuote.travelFee,
      travelBaseFee: travelQuote.travelBaseFee,
      travelFeePerKm: travelQuote.travelFeePerKm,
    });
  } catch (error) {
    console.error("Provider availability error:", error);
    return res.status(500).json({ message: "Could not load provider availability." });
  }
}

async function handleReportRunningLate(req, res) {
  const bookingId = String(req.params.id || "");
  const delayMinutes = Number(req.body.delayMinutes);
  if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: "Choose a valid booking." });
  if (req.user.role !== "provider") return res.status(403).json({ message: "Only the provider can report a delay." });
  if (!Number.isInteger(delayMinutes) || delayMinutes < 1 || delayMinutes > 720) {
    return res.status(400).json({ message: "Enter an expected delay from 1 minute to 12 hours." });
  }

  try {
    const currentBooking = await Booking.findOne({
      _id: bookingId,
      providerId: req.user._id,
      status: "in_progress",
    }).select("_id providerId serviceDate timeSlot");
    if (!currentBooking) return res.status(409).json({ message: "You can report a delay only for a task currently in progress." });

    const currentStart = getScheduledServiceTime(currentBooking.serviceDate, currentBooking.timeSlot);
    if (!currentStart) return res.status(409).json({ message: "The current booking schedule is invalid." });
    const scheduledBookings = await findProviderBookingsForSchedule(
      currentBooking.providerId,
      currentBooking.serviceDate,
      currentBooking._id
    );
    const nextBooking = scheduledBookings
      .filter((booking) => ["approved", "Confirmed"].includes(booking.status))
      .map((booking) => ({ booking, startAt: getScheduledServiceTime(booking.serviceDate, booking.timeSlot) }))
      .filter(({ startAt }) => startAt && startAt > currentStart)
      .sort((first, second) => first.startAt - second.startAt)[0];
    if (!nextBooking) {
      return res.status(409).json({ message: "There is no later confirmed booking to notify for this schedule." });
    }
    const affectedBooking = await Booking.findById(nextBooking.booking._id);
    if (!affectedBooking) return res.status(409).json({ message: "The next booking is no longer available." });
    if (affectedBooking.lateNotice?.status === "pending") {
      return res.status(409).json({ message: "The next client already has a pending delay notice." });
    }

    const now = new Date();
    const etaBase = Math.max(nextBooking.startAt.getTime(), now.getTime());
    affectedBooking.lateNotice = {
      sourceBookingId: currentBooking._id,
      delayMinutes,
      eta: new Date(etaBase + delayMinutes * 60 * 1000),
      status: "pending",
      notifiedAt: now,
    };
    await affectedBooking.save();

    const etaText = affectedBooking.lateNotice.eta.toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
      timeStyle: "short",
    });
    const delayMessage = `Your provider reported a ${delayMinutes}-minute delay. Updated estimated arrival: ${etaText}. Choose whether to wait or request a new time; you may also use the usual cancellation option.`;
    const systemMessage = await appendBookingSystemMessage(
      affectedBooking,
      delayMessage,
      req.user._id,
      "running_late",
      {
        sourceBookingId: String(currentBooking._id),
        delayMinutes,
        eta: affectedBooking.lateNotice.eta,
        status: "pending",
      }
    );
    await notifyBooking({
      userIds: [String(affectedBooking.clientId)],
      title: "Your provider is running late",
      body: delayMessage,
      url: `/client/messages?conversation=${encodeURIComponent(String(systemMessage.conversationId))}`,
      data: {
        event: "booking.running_late",
        bookingId: String(affectedBooking._id),
        sourceBookingId: String(currentBooking._id),
        conversationId: String(systemMessage.conversationId),
        delayMinutes,
        eta: affectedBooking.lateNotice.eta.toISOString(),
      },
    });
    await affectedBooking.populate(populatePaths);
    return res.json({ booking: serializeBooking(affectedBooking) });
  } catch (error) {
    console.error("Running-late report error:", error);
    return res.status(500).json({ message: "Could not notify the next client about the delay." });
  }
}

async function handleRespondToLateNotice(req, res) {
  const bookingId = String(req.params.id || "");
  const action = String(req.body.action || "");
  if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: "Choose a valid booking." });
  if (req.user.role !== "client") return res.status(403).json({ message: "Only the client can respond to a delay notice." });
  if (!["wait", "reschedule"].includes(action)) return res.status(400).json({ message: "Choose whether to wait or request a new time." });

  try {
    const booking = await Booking.findOne({ _id: bookingId, clientId: req.user._id });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (!booking.lateNotice?.eta || booking.lateNotice.status !== "pending") {
      return res.status(409).json({ message: "This delay notice is no longer awaiting a response." });
    }

    booking.lateNotice.status = action === "wait" ? "waiting" : "reschedule_requested";
    booking.lateNotice.respondedAt = new Date();
    await booking.save();

    const responseMessage = action === "wait"
      ? "The client will wait for the updated estimated arrival."
      : "The client requested a new appointment time after the delay notice.";
    try {
      await appendBookingSystemMessage(
        booking,
        responseMessage,
        req.user._id,
        "late_response",
        { action, sourceBookingId: String(booking.lateNotice.sourceBookingId || "") }
      );
    } catch (messageError) {
      console.error("Running-late response message error:", messageError);
    }
    await notifyBooking({
      userIds: [String(booking.providerId)],
      title: action === "wait" ? "Client will wait" : "Client requested a new time",
      body: action === "wait" ? "The client accepted the updated estimated arrival." : "Contact the client to agree on a new appointment time.",
      url: bookingUrl("provider", booking._id),
      data: { event: "booking.late_response", bookingId: String(booking._id), action },
    });
    await booking.populate(populatePaths);
    return res.json({ booking: serializeBooking(booking) });
  } catch (error) {
    console.error("Running-late response error:", error);
    return res.status(500).json({ message: "Could not save your response to the delay notice." });
  }
}

async function handleServiceLocationSearch(req, res) {
  if (req.user.role !== "client") return res.status(403).json({ message: "Only clients can search for service locations." });
  const query = String(req.query.q || "").trim();
  if (query.length < 3 || query.length > 200) {
    return res.status(400).json({ message: "Enter an address between 3 and 200 characters." });
  }
  try {
    const results = await searchServiceLocations(query);
    return res.json({ results });
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ message: error.message });
    console.error("Service location search error:", error);
    return res.status(502).json({ message: "Address search is temporarily unavailable. Try again or place the pin on the map." });
  }
}

async function handleServiceLocationReverseLookup(req, res) {
  if (req.user.role !== "client") return res.status(403).json({ message: "Only clients can look up service locations." });
  const { latitude, longitude } = req.query;
  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ message: "Choose a valid map location." });
  }
  try {
    const result = await reverseGeocodeServiceLocation(latitude, longitude);
    return res.json({ result });
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ message: error.message });
    console.error("Service location reverse lookup error:", error);
    return res.status(502).json({ message: "The address for this pin could not be found. You can enter it manually." });
  }
}

async function getBookingTravelQuote(client, providerId, settings, serviceGeoLocation = null) {
  const provider = await User.findOne({
    _id: providerId,
    role: "provider",
    registrationComplete: true,
    isSuspended: mongoose.trusted({ $ne: true }),
    archivedAt: null,
  }).select("_id geoLocation");
  if (!provider) return { errorStatus: 404, message: "That provider is no longer available." };

  const originCoordinates = serviceGeoLocation?.coordinates || client.geoLocation?.coordinates;
  const calculatedDistanceKm = calculateDistanceKm(originCoordinates, provider.geoLocation?.coordinates);
  if (calculatedDistanceKm == null) {
    return { errorStatus: 400, message: "A map location is required for the service address and provider to calculate the travel fare." };
  }

  const travelDistanceKm = Math.round(calculatedDistanceKm * 100) / 100;
  const travelSettings = settings || await getGlobalSettings();
  if (travelDistanceKm > travelSettings.maxTravelDistanceKm) {
    return {
      errorStatus: 400,
      message: `This provider is beyond the current ${travelSettings.maxTravelDistanceKm} km travel limit.`,
    };
  }
  return {
    provider,
    travelDistanceKm,
    travelFee: calculateTravelFare(travelDistanceKm, {
      baseFee: travelSettings.travelBaseFee,
      feePerKm: travelSettings.travelFeePerKm,
    }),
    travelBaseFee: travelSettings.travelBaseFee,
    travelFeePerKm: travelSettings.travelFeePerKm,
  };
}

async function handleCreateBooking(req, res) {
  if (req.user.role !== "client") return res.status(403).json({ message: "Only clients can create bookings." });

  let settings;
  try {
    settings = req.systemSettings || await getGlobalSettings();
  } catch (error) {
    console.error("Booking settings lookup error:", error);
    return res.status(503).json({ message: "Booking settings are temporarily unavailable. Please try again." });
  }
  if (settings.maintenanceMode) {
    return res.status(503).json({ message: "New bookings are temporarily paused while we perform maintenance. Please try again shortly." });
  }

  const providerId = String(req.body.providerId || req.body.provider || "").trim();
  const repairDescription = String(req.body.repairDescription || req.body.description || req.body.task || req.body.serviceDetails || "").trim();
  const address = String(req.body.address || req.body.location || "").trim();
  const requestedServiceGeoLocation = normalizeServiceGeoLocation(req.body.serviceGeoLocation);
  if (req.body.serviceGeoLocation && !requestedServiceGeoLocation) {
    return res.status(400).json({ message: "Choose a valid service location pin." });
  }
  if (requestedServiceGeoLocation && !address) {
    return res.status(400).json({ message: "Add the exact address for the selected service location." });
  }
  const serviceGeoLocation = requestedServiceGeoLocation || req.user.geoLocation || null;
  const serviceAddress = address || String(req.user.address || "").trim();
  const serviceDate = parseServiceDate(req.body.serviceDate || req.body.date || req.body.service_details?.date || "");
  const timeSlot = String(req.body.timeSlot || req.body.time || req.body.service_details?.time || "").trim();
  const urgency = String(req.body.urgency || "Flexible").trim();
  const offeredPrice = Number(req.body.offeredPrice ?? req.body.offerPrice ?? req.body.offer ?? req.body.price ?? 0);
  const estimatedDurationMinutes = Number(req.body.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES);
  const tipAmount = Number(req.body.tipAmount ?? 0);
  const voucherId = String(req.body.voucherId || "").trim();
  const paymentMethod = String(req.body.paymentMethod || "cash").trim().toLowerCase();
  const termsAccepted = req.body.termsAccepted === true || req.body.termsAccepted === "true" || req.body.termsAccepted === "True";
  const safeStatus = "pending";
  delete req.body.status;

  if (!mongoose.isValidObjectId(providerId)) return res.status(400).json({ message: "Choose a valid provider." });
  if (!repairDescription || repairDescription.length > 2000) return res.status(400).json({ message: "Add a valid description of the repair." });
  if (!serviceDate) return res.status(400).json({ message: "Choose a valid service date." });
  if (!TIME_SLOTS.has(timeSlot)) return res.status(400).json({ message: "Choose an available time slot." });
  if (!Number.isFinite(offeredPrice) || offeredPrice < 100) return res.status(400).json({ message: "Your offer must be at least PHP 100." });
  if (!isValidEstimatedDurationMinutes(estimatedDurationMinutes)) return res.status(400).json({ message: "Choose a task duration from 15 minutes to 12 hours in 15-minute increments." });
  const adjustedTaskOffer = calculateDurationAdjustedTaskOffer(offeredPrice, estimatedDurationMinutes);
  if (adjustedTaskOffer < 100) return res.status(400).json({ message: "The duration-adjusted task offer must be at least PHP 100." });
  if (!Number.isFinite(tipAmount) || tipAmount < 0 || tipAmount > 1000000) return res.status(400).json({ message: "Enter a valid tip amount." });
  if (voucherId && !mongoose.isValidObjectId(voucherId)) return res.status(400).json({ message: "Choose a valid travel-fee voucher." });
  if (paymentMethod !== "cash") return res.status(400).json({ message: "Cash on completion is the only supported payment method." });
  if (!["Emergency", "Flexible"].includes(urgency)) return res.status(400).json({ message: "Choose a valid urgency." });
  if (!termsAccepted) return res.status(400).json({ message: "Accept the terms and cancellation policy before submitting." });

  try {
    await processExpiredBookingRequests();
    const travelQuote = await getBookingTravelQuote(req.user, providerId, settings, serviceGeoLocation);
    if (travelQuote.errorStatus) return res.status(travelQuote.errorStatus).json({ message: travelQuote.message });
    const { provider, travelDistanceKm } = travelQuote;
    const travelFeeBeforeDiscount = travelQuote.travelFee;
    const selectedVoucher = voucherId
      ? (req.user.vouchers || []).find((voucher) =>
        String(voucher._id) === voucherId &&
        voucher.status === "active" &&
        (!voucher.expiresAt || new Date(voucher.expiresAt) > new Date())
      )
      : null;
    if (voucherId && !selectedVoucher) {
      return res.status(409).json({ message: "That voucher is no longer available. Refresh your rewards and choose another." });
    }
    const travelFeeDiscount = selectedVoucher
      ? calculateTravelFeeDiscount(travelFeeBeforeDiscount, selectedVoucher.amount)
      : 0;
    const travelFee = Math.max(0, travelFeeBeforeDiscount - travelFeeDiscount);

    const now = new Date();
    const scheduledTime = getScheduledServiceTime(serviceDate, timeSlot);
    if (!scheduledTime || scheduledTime.getTime() <= now.getTime()) {
      return res.status(400).json({ message: "That time slot has already passed." });
    }
    if (!canArriveForSameDayBooking(serviceDate, timeSlot, travelDistanceKm, now)) {
      return res.status(409).json({ message: "That time is too soon for the provider to travel to your location. Choose a later time." });
    }

    const serviceDayStart = new Date(serviceDate);
    serviceDayStart.setUTCHours(0, 0, 0, 0);
    const serviceDayEnd = new Date(serviceDayStart);
    serviceDayEnd.setUTCDate(serviceDayEnd.getUTCDate() + 1);

    const existingBookings = await findProviderBookingsForSchedule(provider._id, serviceDate);
    if (hasScheduleConflict({
      serviceDate,
      timeSlot,
      estimatedDurationMinutes,
      serviceGeoLocation,
    }, existingBookings)) {
      return res.status(409).json({ message: "That time does not leave enough room for the task duration, travel between pinned client locations, and the 30-minute safety buffer." });
    }

    const existingBooking = await Booking.findOne({
      providerId: provider._id,
      serviceDate: mongoose.trusted({ $gte: serviceDayStart, $lt: serviceDayEnd }),
      timeSlot,
      status: mongoose.trusted({ $in: ACTIVE_BOOKING_STATUSES }),
    });

    if (existingBooking) {
      return res.status(409).json({ message: "That time slot is no longer available." });
    }

    const reservationId = voucherId ? randomBytes(24).toString("hex") : "";
    if (selectedVoucher) {
      const reservedVoucher = await User.findOneAndUpdate(
        mongoose.trusted({
          _id: req.user._id,
          vouchers: mongoose.trusted({
            $elemMatch: {
              _id: new mongoose.Types.ObjectId(voucherId),
              status: "active",
              $or: [
                { expiresAt: mongoose.trusted({ $exists: false }) },
                { expiresAt: null },
                { expiresAt: mongoose.trusted({ $gt: new Date() }) },
              ],
            },
          }),
        }),
        {
          $set: {
            "vouchers.$.status": "reserved",
            "vouchers.$.reservationId": reservationId,
            "vouchers.$.reservationExpiresAt": new Date(Date.now() + 2 * 60 * 1000),
          },
        },
        { new: true }
      );
      if (!reservedVoucher) {
        return res.status(409).json({ message: "That voucher was just used or expired. Refresh your rewards and try again." });
      }
    }

    let booking;
    try {
      const submittedAt = req.bookingRequestReceivedAt || new Date();
      const requestExpiresAt = getBookingRequestExpiration(serviceDate, submittedAt);
      booking = await Booking.create({
        clientId: req.user._id,
        providerId: provider._id,
        repairDescription,
        address: serviceAddress,
        serviceGeoLocation,
        serviceDate,
        timeSlot,
        estimatedDurationMinutes,
        offeredPrice: adjustedTaskOffer,
        travelDistanceKm,
        travelBaseFee: travelQuote.travelBaseFee,
        travelFeePerKm: travelQuote.travelFeePerKm,
        travelFee,
        travelFeeBeforeDiscount,
        travelFeeDiscount,
        voucherId: selectedVoucher?._id,
        voucherReservationId: reservationId || undefined,
        tipAmount,
        urgency,
        paymentMethod,
        photoUrl: req.files?.[0] ? `/uploads/${req.files[0].filename}` : "",
        status: safeStatus,
        requestExpiresAt: requestExpiresAt || undefined,
        statusHistory: [{ status: "pending", at: submittedAt }],
      });
      if (selectedVoucher) {
        const redeemedVoucher = await User.updateOne(
          mongoose.trusted({
            _id: req.user._id,
            vouchers: mongoose.trusted({
              $elemMatch: {
                _id: selectedVoucher._id,
                status: "reserved",
                reservationId,
              },
            }),
          }),
          {
            $set: {
              "vouchers.$.status": "redeemed",
              "vouchers.$.redeemedAt": new Date(),
              "vouchers.$.bookingId": booking._id,
            },
            $unset: {
              "vouchers.$.reservationId": 1,
              "vouchers.$.reservationExpiresAt": 1,
            },
          }
        );
        if (!redeemedVoucher.matchedCount) {
          const alreadyFinalized = await User.exists(
            mongoose.trusted({
              _id: req.user._id,
              vouchers: mongoose.trusted({
                $elemMatch: {
                  _id: selectedVoucher._id,
                  status: "redeemed",
                  bookingId: booking._id,
                },
              }),
            })
          );
          if (!alreadyFinalized) {
            await Booking.deleteOne({ _id: booking._id });
            throw new Error("The travel-fee voucher could not be finalized. Please retry the booking.");
          }
        }
      }
    } catch (error) {
      if (booking?._id) await Booking.deleteOne({ _id: booking._id });
      if (selectedVoucher) {
        await User.updateOne(
          mongoose.trusted({
            _id: req.user._id,
            vouchers: mongoose.trusted({
              $elemMatch: {
                _id: selectedVoucher._id,
                status: "reserved",
                reservationId,
              },
            }),
          }),
          {
            $set: { "vouchers.$.status": "active" },
            $unset: {
              "vouchers.$.reservationId": 1,
              "vouchers.$.reservationExpiresAt": 1,
            },
          }
        );
      }
      throw error;
    }

    try {
      await ensureBookingConversation(booking);
    } catch (messageError) {
      console.error("Initial booking conversation error:", messageError);
    }

    const bookingIdValue = String(booking._id);
    await notifyBooking({
      userIds: [String(booking.providerId)],
      title: "New booking request",
      body: `${req.user.fullName || "A client"} requested ${repairDescription.slice(0, 100)}.`,
      url: bookingUrl("provider", bookingIdValue),
      data: { event: "booking.created", bookingId: bookingIdValue },
    });
    if (urgency === "Emergency") {
      await notifyBooking({
        roles: ["admin"],
        title: "High-priority booking needs review",
        body: "An emergency service request was submitted.",
        url: `/admin?section=bookings&bookingId=${encodeURIComponent(bookingIdValue)}`,
        data: { event: "booking.emergency", bookingId: bookingIdValue },
      });
    }

    await booking.populate(populatePaths);
    return res.status(201).json({ booking: serializeBooking(booking) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "That time slot is already booked." });
    }
    console.error("Create booking error:", error);
    return res.status(500).json({
      message: error?.message || "Could not submit the booking.",
      details: process.env.NODE_ENV !== "production" ? String(error?.stack || error) : undefined,
    });
  }
}

async function handleUpdateBookingStatus(req, res) {
  const bookingId = String(req.params.id || "");
  const rawRequestedStatus = String(req.body.status || "").trim().toLowerCase();
  const requestedStatus = normalizeBookingStatus(rawRequestedStatus);
  const isDecline = requestedStatus === "declined" || (requestedStatus === "canceled" && req.body.action === "decline");
  const status = isDecline ? "declined" : requestedStatus;
  if (!mongoose.isValidObjectId(bookingId)) {
    return res.status(400).json({ message: "Choose a valid booking." });
  }
  if (!STATUS_VALUES.has(status)) {
    return res.status(400).json({
      message: `Unsupported booking status "${status || "(empty)"}". Use approved, en_route, in_progress, declined, canceled, or complete.`,
    });
  }
  if (req.user.role !== "provider") {
    return res.status(403).json({ message: "Only providers can update booking status." });
  }
  if (req.body.action && !isDecline) {
    return res.status(400).json({ message: "Choose a valid booking status action." });
  }
  if (status === "canceled" && !isDecline) return res.status(400).json({ message: "Use the cancellation request endpoint to cancel a booking." });
  if (status === "complete") return res.status(400).json({ message: "Submit a completion note through the completion proof form." });
    if (status === "settled") return res.status(400).json({ message: "Settled bookings are managed automatically after cash confirmation." });
  try {
    if (status === "approved" || status === "declined") {
      const now = new Date();
      const expiredBooking = await Booking.findOneAndUpdate(
        {
          _id: bookingId,
          providerId: req.user._id,
          status: mongoose.trusted({ $in: ["pending", "Pending Request"] }),
          requestExpiresAt: mongoose.trusted({ $lte: now }),
        },
        {
          $set: { status: "expired" },
          $push: { statusHistory: { status: "expired", at: now } },
        },
        { new: true }
      );
      if (expiredBooking) return res.status(409).json({ message: "This booking request has expired." });
    }
    if (status === "en_route") {
      const pendingReschedule = await Booking.exists({
        _id: bookingId,
        providerId: req.user._id,
        status: mongoose.trusted({ $in: ["approved", "Confirmed"] }),
        providerUpdates: mongoose.trusted({ $elemMatch: { type: "reschedule", status: "pending" } }),
      });
      if (pendingReschedule) return res.status(409).json({ message: "Wait for the client to respond to the time-change request before heading out." });
    }
    const allowedPreviousStatuses = {
      approved: ["pending", "Pending Request"],
      canceled: [],
      declined: ["pending", "Pending Request"],
      en_route: ["approved", "Confirmed"],
      in_progress: ["en_route", "On the Way"],
      complete: ["in_progress", "In Progress"],
    };
    const currentStatuses = allowedPreviousStatuses[status];
    const filter = { _id: bookingId, providerId: req.user._id, status: mongoose.trusted({ $in: currentStatuses }) };
    let now = new Date();
    if (status === "approved") {
      const pendingBooking = await Booking.findOne({
        _id: bookingId,
        providerId: req.user._id,
        status: mongoose.trusted({ $in: ["pending", "Pending Request"] }),
      }).select("serviceDate timeSlot travelDistanceKm requestExpiresAt estimatedDurationMinutes serviceGeoLocation");
      if (!pendingBooking) return res.status(404).json({ message: "Booking not found or it has already been updated." });
      now = new Date();
      if (pendingBooking.requestExpiresAt && pendingBooking.requestExpiresAt <= now) {
        await Booking.findOneAndUpdate(
          {
            _id: bookingId,
            providerId: req.user._id,
            status: mongoose.trusted({ $in: ["pending", "Pending Request"] }),
            requestExpiresAt: mongoose.trusted({ $lte: now }),
          },
          {
            $set: { status: "expired" },
            $push: { statusHistory: { status: "expired", at: now } },
          }
        );
        return res.status(409).json({ message: "This booking request has expired." });
      }
      if (!canArriveForSameDayBooking(
        pendingBooking.serviceDate,
        pendingBooking.timeSlot,
        pendingBooking.travelDistanceKm,
        now
      )) {
        return res.status(409).json({ message: "Arrival time missed—please request a schedule adjustment" });
      }
      const scheduleBookings = await findProviderBookingsForSchedule(req.user._id, pendingBooking.serviceDate, pendingBooking._id);
      if (hasScheduleConflict(pendingBooking, scheduleBookings, pendingBooking._id)) {
        return res.status(409).json({ message: "This request does not leave enough room for task duration, travel between pinned client locations, and the 30-minute safety buffer." });
      }
      filter.$or = mongoose.trusted([
        { requestExpiresAt: mongoose.trusted({ $exists: false }) },
        { requestExpiresAt: null },
        { requestExpiresAt: mongoose.trusted({ $gt: now }) },
      ]);
    } else if (status === "declined") {
      now = new Date();
      filter.$or = mongoose.trusted([
        { requestExpiresAt: mongoose.trusted({ $exists: false }) },
        { requestExpiresAt: null },
        { requestExpiresAt: mongoose.trusted({ $gt: now }) },
      ]);
    }
    const booking = await Booking.findOneAndUpdate(
      filter,
      { $set: { status }, $push: { statusHistory: { status, at: now } } },
      { new: true }
    ).populate(populatePaths);
    if (!booking) {
      if (status === "approved" || status === "declined") {
        return res.status(409).json({ message: "This booking request has expired or has already been updated." });
      }
      return res.status(404).json({ message: "Booking not found or it has already been updated." });
    }
    const systemMessages = {
      approved: "Booking approved. The provider is preparing for the task.",
      en_route: "Provider is on the way to your location.",
      in_progress: "Task has started.",
      complete: `Task completed! Please settle the cash payment of ₱${calculateTotalPrice(booking.offeredPrice, booking.travelFee || 0, booking.tipAmount || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })} directly with the provider.`,
      canceled: "Provider canceled the booking.",
      declined: "Provider declined the booking.",
    };
    try {
      await appendBookingSystemMessage(booking, systemMessages[status], req.user._id, "booking_status", {
        status,
        offeredPrice: booking.offeredPrice,
        travelFee: booking.travelFee || 0,
        tipAmount: booking.tipAmount || 0,
        totalPrice: calculateTotalPrice(booking.offeredPrice, booking.travelFee || 0, booking.tipAmount || 0),
        serviceDate: booking.serviceDate,
        timeSlot: booking.timeSlot,
        actorRole: req.user.role,
        action: status === "declined" ? "decline" : status === "canceled" ? "cancel" : undefined,
      });
    } catch (messageError) {
      console.error("Booking status system message error:", messageError);
    }
    const statusNotifications = {
      approved: ["Booking accepted", "Your provider accepted the booking."],
      en_route: ["Your provider is on the way", "Your provider is heading to your location."],
      in_progress: ["Your task has started", "Your provider marked the task as started."],
      complete: ["Task completed", "Your provider submitted completion for this task."],
      canceled: ["Booking canceled", "Your provider canceled the booking."],
      declined: ["Booking declined", "Your provider declined the booking request."],
    };
    const statusNotification = statusNotifications[status];
    if (statusNotification) {
      const bookingIdValue = String(booking._id);
      await notifyBooking({
        userIds: [String(booking.clientId?._id || booking.clientId)],
        title: statusNotification[0],
        body: statusNotification[1],
        url: bookingUrl("client", bookingIdValue),
        data: { event: `booking.${status}`, bookingId: bookingIdValue, status },
      });
    }
    return res.json({ booking: serializeBooking(booking) });
  } catch (error) {
    console.error("Update booking status error:", error);
    return res.status(500).json({ message: "Could not update the booking status." });
  }
}

async function handleSubmitCompletion(req, res) {
  const bookingId = String(req.params.id || "");
  const completionNote = String(req.body.completionNote || "").trim();
  const files = Array.isArray(req.files) ? req.files : [];
  if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: "Choose a valid booking." });
  if (req.user.role !== "provider") return res.status(403).json({ message: "Only the provider can submit completion proof." });
  if (!completionNote || completionNote.length > 2000) return res.status(400).json({ message: "Add a completion note of up to 2,000 characters." });

  try {
    const submittedAt = new Date();
    const completionPhotos = files.map((file) => `/uploads/${file.filename}`);
    const currentBooking = await Booking.findOne({
      _id: bookingId,
      providerId: req.user._id,
      status: mongoose.trusted({ $in: ["in_progress", "In Progress", "in_revision"] }),
    });
    if (!currentBooking) return res.status(409).json({ message: "Only an in-progress task or accepted revision can be marked complete." });
    const acceptedRevision = currentBooking.status === "in_revision"
      ? [...currentBooking.revisionRequests].reverse().find((revision) => revision.status === "accepted")
      : null;
    if (currentBooking.status === "in_revision" && !acceptedRevision) {
      return res.status(409).json({ message: "The provider must accept the revision request before resubmitting the work." });
    }
    const bookingFilter = {
      _id: bookingId,
      providerId: req.user._id,
      status: currentBooking.status === "in_revision" ? "in_revision" : mongoose.trusted({ $in: ["in_progress", "In Progress"] }),
    };
    if (acceptedRevision) bookingFilter.revisionRequests = mongoose.trusted({ $elemMatch: { _id: acceptedRevision._id, status: "accepted" } });
    const update = {
      $set: {
        status: "complete",
        completionNote,
        completionPhotos,
        completionSubmittedAt: submittedAt,
        workCompletedAt: submittedAt,
      },
      $push: { statusHistory: { status: "complete", at: submittedAt } },
    };
    if (acceptedRevision) {
      update.$set["revisionRequests.$.status"] = "addressed";
      update.$set["revisionRequests.$.addressedAt"] = submittedAt;
    }
    const booking = await Booking.findOneAndUpdate(
      bookingFilter,
      update,
      { new: true, runValidators: true }
    ).populate(populatePaths);
    if (!booking) return res.status(409).json({ message: "This task changed before completion proof was saved. Refresh and try again." });

    try {
      await appendBookingSystemMessage(booking, acceptedRevision ? "Provider resubmitted the task after completing the requested revision." : "Provider marked the task complete and submitted a completion summary.", req.user._id, "booking_status", {
        status: "complete",
        actorRole: "provider",
        completionNote,
        completionPhotos,
        completionSubmittedAt: submittedAt,
        revisionRound: booking.revisionRequests.length,
      });
    } catch (messageError) {
      console.error("Completion proof system message error:", messageError);
    }
    return res.json({ booking: serializeBooking(booking) });
  } catch (error) {
    console.error("Submit completion proof error:", error);
    return res.status(500).json({ message: "Could not submit completion proof." });
  }
}

async function handleCreateRevisionRequest(req, res) {
  const bookingId = String(req.params.id || "");
  const note = String(req.body.note || "").trim();
  const photos = (Array.isArray(req.files) ? req.files : []).map((file) => `/uploads/${file.filename}`);
  if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: "Choose a valid booking." });
  if (req.user.role !== "client") return res.status(403).json({ message: "Only the client can request a revision." });
  if (!note || note.length > 1000) return res.status(400).json({ message: "Describe the revision needed in up to 1,000 characters." });

  try {
    const booking = await Booking.findOne({ _id: bookingId, clientId: req.user._id });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (booking.status === "closed" || booking.cashReceipt?.receiptNumber) return res.status(409).json({ message: "This booking is settled and closed to revision requests. Use Report Post-Service Issue for further concerns." });
    if (booking.status !== "complete") return res.status(409).json({ message: "A revision can only be requested after the provider marks the task complete." });
    if (booking.revisionRequests.length >= 2) return res.status(409).json({ message: "The two-revision limit has been reached. Please use chat or contact support to resolve the remaining concern." });
    if (booking.revisionRequests.some((request) => ["open", "accepted"].includes(request.status))) return res.status(409).json({ message: "The current revision must be resolved before requesting another." });

    const createdAt = new Date();
    booking.revisionRequests.push({ requestedBy: req.user._id, note, photos, status: "open", createdAt });
    booking.status = "in_revision";
    booking.statusHistory.push({ status: "in_revision", at: createdAt });
    await booking.save();
    try {
      await appendBookingSystemMessage(booking, `Client requested a revision: ${note}`, req.user._id, "revision_request", {
        note,
        photos,
        status: "open",
        actorRole: "client",
        revisionRound: booking.revisionRequests.length,
        completionNote: booking.completionNote,
        completionPhotos: booking.completionPhotos,
        completionSubmittedAt: booking.completionSubmittedAt,
      });
    } catch (messageError) {
      console.error("Revision request system message error:", messageError);
    }
    const bookingIdValue = String(booking._id);
    await notifyBooking({
      userIds: [String(booking.providerId)],
      title: "Revision requested",
      body: "The client requested a revision to the completed task.",
      url: bookingUrl("provider", bookingIdValue),
      data: { event: "booking.revision_requested", bookingId: bookingIdValue },
    });
    await booking.populate(populatePaths);
    return res.status(201).json({ booking: serializeBooking(booking) });
  } catch (error) {
    console.error("Create revision request error:", error);
    return res.status(500).json({ message: "Could not submit the revision request." });
  }
}

async function handleRespondToRevision(req, res) {
  const bookingId = String(req.params.id || "");
  const revisionId = String(req.params.revisionId || "");
  const action = String(req.body.action || "");
  const responseNote = String(req.body.responseNote || "").trim();
  if (!mongoose.isValidObjectId(bookingId) || !mongoose.isValidObjectId(revisionId)) return res.status(400).json({ message: "Choose a valid revision request." });
  if (req.user.role !== "provider") return res.status(403).json({ message: "Only the provider can respond to a revision request." });
  if (!["accept", "dispute"].includes(action)) return res.status(400).json({ message: "Choose accept or dispute." });
  if (responseNote.length > 1000) return res.status(400).json({ message: "Response notes must be 1,000 characters or fewer." });

  try {
    const booking = await Booking.findOne({ _id: bookingId, providerId: req.user._id });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (booking.status !== "in_revision") return res.status(409).json({ message: "This booking is no longer awaiting a revision response." });
    const revision = booking.revisionRequests.id(revisionId);
    if (!revision || revision.status !== "open") return res.status(409).json({ message: "This revision request has already been addressed." });

    const respondedAt = new Date();
    revision.status = action === "accept" ? "accepted" : "disputed";
    revision.responseNote = responseNote;
    revision.respondedAt = respondedAt;
    if (action === "dispute") {
      booking.status = "disputed";
      booking.statusHistory.push({ status: "disputed", at: respondedAt });
    }
    await booking.save();
    try {
      await appendBookingSystemMessage(
        booking,
        action === "accept" ? "Provider accepted the revision request and will update the work." : "Provider disputed the revision request for manual review.",
        req.user._id,
        "revision_response",
        { revisionId: String(revision._id), action, status: revision.status, responseNote, actorRole: "provider" }
      );
    } catch (messageError) {
      console.error("Revision response system message error:", messageError);
    }
    const bookingIdValue = String(booking._id);
    await notifyBooking({
      userIds: [String(booking.clientId)],
      title: action === "dispute" ? "Revision sent for review" : "Revision accepted",
      body: action === "dispute"
        ? "The provider disputed the revision and it needs admin review."
        : "The provider accepted the requested revision.",
      url: bookingUrl("client", bookingIdValue),
      data: { event: action === "dispute" ? "booking.revision_disputed" : "booking.revision_accepted", bookingId: bookingIdValue },
    });
    if (action === "dispute") {
      await notifyBooking({
        roles: ["admin"],
        title: "Booking dispute needs review",
        body: "A provider disputed a client revision request.",
        url: `/admin?section=bookings&bookingId=${encodeURIComponent(bookingIdValue)}`,
        data: { event: "booking.disputed", bookingId: bookingIdValue },
      });
    }
    await booking.populate(populatePaths);
    return res.json({ booking: serializeBooking(booking) });
  } catch (error) {
    console.error("Revision response error:", error);
    return res.status(500).json({ message: "Could not respond to the revision request." });
  }
}

async function handleCancellation(req, res) {
  const bookingId = String(req.params.id || "");
  const action = String(req.body.action || "request");
  const reason = String(req.body.reason || "").trim();
  if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: "Choose a valid booking." });
  if (!["request", "approve", "reject"].includes(action)) return res.status(400).json({ message: "Choose a valid cancellation action." });
  if (reason.length > 500) return res.status(400).json({ message: "Cancellation reason must be 500 characters or fewer." });
  if (!["client", "provider"].includes(req.user.role)) return res.status(403).json({ message: "Only booking participants can manage cancellations." });

  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    const role = req.user.role === "provider" ? "provider" : "client";
    const isParticipant = String(booking[`${role}Id`]) === String(req.user._id);
    if (!isParticipant) return res.status(403).json({ message: "You can only manage cancellations for your bookings." });

    if (normalizeBookingStatus(booking.status) === "canceled") {
      await restoreVoucherForBooking(booking);
      await booking.populate(populatePaths);
      return res.json({ booking: serializeBooking(booking) });
    }

    if (action === "request") {
      if (!["pending", "approved"].includes(normalizeBookingStatus(booking.status))) {
        return res.status(400).json({ message: "Cannot cancel a booking once the provider is on the way or work has started." });
      }
      const withinGracePeriod = Date.now() - new Date(booking.createdAt).getTime() < GRACE_PERIOD_MS;
      if (!withinGracePeriod && !reason) return res.status(400).json({ message: "Add a brief reason for the cancellation request." });
      booking.cancellationReason = reason;
      booking.cancellationRequestedBy = role;
      booking.cancellationRequestedAt = new Date();
      booking.cancellationPreviousStatus = booking.status;
      booking.cancellationOutcome = undefined;
      if (withinGracePeriod) {
        booking.status = "canceled";
        booking.cancellationResolvedAt = new Date();
        booking.cancellationExpiresAt = undefined;
        booking.cancellationOutcome = "instant";
      } else {
        booking.status = "cancel_requested";
        booking.cancellationExpiresAt = new Date(Date.now() + cancellationResponseWindow(booking.serviceDate, booking.timeSlot));
      }
      booking.statusHistory.push({ status: booking.status, at: booking.cancellationRequestedAt });
    } else {
      if (booking.status !== "cancel_requested") return res.status(409).json({ message: "There is no pending cancellation request." });
      if (booking.cancellationRequestedBy === role) return res.status(403).json({ message: "The other booking participant must respond to this request." });
      if (booking.cancellationExpiresAt && booking.cancellationExpiresAt <= new Date()) {
        booking.status = "canceled";
        booking.cancellationResolvedAt = new Date();
        booking.cancellationOutcome = "expired";
      } else if (action === "approve") {
        booking.status = "canceled";
        booking.cancellationResolvedAt = new Date();
        booking.cancellationOutcome = "approved";
      } else {
        booking.status = booking.cancellationPreviousStatus || "approved";
        booking.cancellationResolvedAt = new Date();
        booking.cancellationOutcome = "rejected";
        booking.cancellationReason = "";
        booking.cancellationRequestedBy = undefined;
        booking.cancellationRequestedAt = undefined;
        booking.cancellationExpiresAt = undefined;
        booking.cancellationPreviousStatus = undefined;
      }
      booking.statusHistory.push({ status: booking.status, at: booking.cancellationResolvedAt });
    }

    await booking.save();
    if (normalizeBookingStatus(booking.status) === "canceled") {
      await restoreVoucherForBooking(booking);
    }
    const actorLabel = role === "client" ? "Client" : "Provider";
    const cancellationMessage = booking.status === "cancel_requested"
      ? `${actorLabel} requested to cancel the booking: ${reason}`
      : booking.cancellationOutcome === "instant"
        ? `${actorLabel} canceled the booking.`
        : booking.cancellationOutcome === "approved"
          ? `${actorLabel} approved the cancellation request. The booking was canceled.`
          : booking.cancellationOutcome === "rejected"
            ? `${actorLabel} declined the cancellation request. The booking remains active.`
            : "The cancellation request expired. The booking was canceled.";
    try {
      await appendBookingSystemMessage(booking, cancellationMessage, req.user._id, "cancellation", {
        status: booking.status,
        cancellationOutcome: booking.cancellationOutcome || "requested",
        cancellationRequestedBy: booking.cancellationRequestedBy || "",
      });
    } catch (messageError) {
      console.error("Cancellation system message error:", messageError);
    }
    const bookingIdValue = String(booking._id);
    const recipientId = role === "client" ? booking.providerId : booking.clientId;
    const isCancellationRequest = booking.status === "cancel_requested";
    const cancellationWasRejected = booking.cancellationOutcome === "rejected";
    await notifyBooking({
      userIds: [String(recipientId)],
      title: isCancellationRequest
        ? "Cancellation requested"
        : cancellationWasRejected
          ? "Cancellation request declined"
          : "Booking canceled",
      body: isCancellationRequest
        ? "The other participant requested to cancel a booking."
        : cancellationWasRejected
          ? "The cancellation request was declined; the booking remains active."
          : "The booking was canceled after a participant's request.",
      url: bookingUrl(role === "client" ? "provider" : "client", bookingIdValue),
      data: {
        event: isCancellationRequest
          ? "booking.cancellation_requested"
          : cancellationWasRejected
            ? "booking.cancellation_declined"
            : "booking.canceled",
        bookingId: bookingIdValue,
      },
    });
    await booking.populate(populatePaths);
    return res.json({ booking: serializeBooking(booking) });
  } catch (error) {
    console.error("Cancellation error:", error);
    return res.status(500).json({ message: "Could not process the cancellation." });
  }
}

async function handleBookingReview(req, res) {
  const bookingId = String(req.params.id || "");
  const rating = Number(req.body.rating);
  const review = String(req.body.review || "").trim();
  if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: "Choose a valid booking." });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: "Choose a rating from 1 to 5 stars." });
  if (review.length > 1000) return res.status(400).json({ message: "Review must be 1,000 characters or fewer." });
  if (req.user.role !== "client") return res.status(403).json({ message: "Only the client can review this booking." });

  try {
    const booking = await Booking.findOne({ _id: bookingId, clientId: req.user._id });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    const canReviewBooking = booking.status === "settled" || Boolean((booking.cashPaidConfirmedAt && booking.cashReceivedConfirmedAt) || (booking.clientConfirmedCash && booking.providerConfirmedCash));
    if (!canReviewBooking) return res.status(409).json({ message: "The booking must be fully settled before a review can be submitted." });
    if (booking.clientRating != null) return res.status(409).json({ message: "This booking already has a review." });
    booking.clientRating = rating;
    booking.clientReview = review;
    booking.clientReviewPhotos = (req.files || []).map((file) => `/uploads/${file.filename}`);
    booking.reviewedAt = new Date();
    await booking.save();
    await recalculateProviderRatingSummary(booking.providerId);
    try {
      const reviewMessageText = review
        ? `Rated this service ${rating}/5 stars: “${review}”`
        : `Rated this service ${rating}/5 stars.`;
      await appendBookingSystemMessage(
        booking,
        reviewMessageText,
        req.user._id,
        "review",
        {
          rating,
          review,
          reviewPhotos: booking.clientReviewPhotos || [],
          reviewedAt: booking.reviewedAt,
        }
      );
    } catch (messageError) {
      console.error("Booking review system message error:", messageError);
    }
    await booking.populate(populatePaths);
    return res.json({ booking: serializeBooking(booking) });
  } catch (error) {
    console.error("Booking review error:", error);
    return res.status(500).json({ message: "Could not save the booking review." });
  }
}

async function processCashSettlementFallbacks() {
  try {
    const cutoff = new Date(Date.now() - CASH_SETTLEMENT_GRACE_MS);
    const expiredBookings = await mongoose.connection.collection("bookings").find({
      status: "complete",
      paymentMethod: "cash",
      workCompletedAt: { $lte: cutoff },
      $or: [
        { clientConfirmedCash: { $ne: true } },
        { providerConfirmedCash: { $ne: true } },
      ],
    }).toArray();

    for (const booking of expiredBookings) {
      const autoSettledAt = new Date();
      const nextStatus = "settled";
      const updatePayload = {
        status: nextStatus,
        settledAt: autoSettledAt,
        clientConfirmedCash: booking.clientConfirmedCash || true,
        providerConfirmedCash: booking.providerConfirmedCash || true,
        cashPaidConfirmedAt: booking.cashPaidConfirmedAt || autoSettledAt,
        cashReceivedConfirmedAt: booking.cashReceivedConfirmedAt || autoSettledAt,
      };
      await Booking.findByIdAndUpdate(
        booking._id,
        {
          $set: updatePayload,
          $push: { statusHistory: { status: nextStatus, at: autoSettledAt } },
        },
        { new: true }
      );
      try {
        await awardSettledBookingStamp(booking._id);
      } catch (stampError) {
        console.error("Auto-settled booking loyalty stamp error:", stampError);
      }
      try {
        await appendBookingSystemMessage(
          booking,
          "The client did not confirm cash payment within the grace period, so the booking was automatically settled and is now ready for review.",
          booking.providerId,
          "cash_settlement",
          { status: nextStatus, settledAt: autoSettledAt, autoSettled: true }
        );
      } catch (messageError) {
        console.error("Auto-settlement system message error:", messageError);
      }
    }
  } catch (error) {
    console.error("Cash settlement fallback error:", error);
  }
}

async function hasConflictingSlot(providerId, serviceDate, timeSlot, excludeBookingId, estimatedDurationMinutes = DEFAULT_ESTIMATED_DURATION_MINUTES, serviceGeoLocation = null) {
  const bookings = await findProviderBookingsForSchedule(providerId, serviceDate, excludeBookingId);
  return hasScheduleConflict({
    serviceDate,
    timeSlot,
    estimatedDurationMinutes,
    serviceGeoLocation,
  }, bookings, excludeBookingId);
}

async function findProviderBookingsForSchedule(providerId, serviceDate, excludeBookingId = "") {
  const dayStart = new Date(serviceDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const rangeStart = new Date(dayStart);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
  const rangeEnd = new Date(dayStart);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 2);
  return Booking.find({
    providerId,
    _id: mongoose.trusted({ $ne: excludeBookingId || null }),
    serviceDate: mongoose.trusted({ $gte: rangeStart, $lt: rangeEnd }),
    status: mongoose.trusted({ $in: ACTIVE_BOOKING_STATUSES }),
  }).select("_id serviceDate timeSlot estimatedDurationMinutes serviceGeoLocation status").lean();
}

async function handleProviderUpdate(req, res) {
  const bookingId = String(req.params.id || "");
  const note = String(req.body.note || "").trim();
  const proposedDateValue = String(req.body.proposedServiceDate || "").trim();
  const proposedTimeSlot = String(req.body.proposedTimeSlot || "").trim();
  const isReschedule = Boolean(proposedDateValue || proposedTimeSlot);
  if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: "Choose a valid booking." });
  if (req.user.role !== "provider") return res.status(403).json({ message: "Only providers can send booking updates." });
  if (!note || note.length > 500) return res.status(400).json({ message: "Add a note of up to 500 characters for the client." });
  if (isReschedule && (!proposedDateValue || !TIME_SLOTS.has(proposedTimeSlot))) {
    return res.status(400).json({ message: "Choose both a valid proposed date and time slot." });
  }
  const proposedServiceDate = isReschedule ? parseServiceDate(proposedDateValue) : null;
  if (isReschedule && !proposedServiceDate) return res.status(400).json({ message: "Choose a valid proposed date." });

  try {
    const booking = await Booking.findOne({ _id: bookingId, providerId: req.user._id });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (booking.status !== "approved") return res.status(409).json({ message: "Updates can only be sent before the provider is on the way." });
    if (isReschedule && booking.providerUpdates.some((update) => update.type === "reschedule" && update.status === "pending")) {
      return res.status(409).json({ message: "Wait for the client to respond to the current time-change request first." });
    }
    if (isReschedule && await hasConflictingSlot(
      booking.providerId,
      proposedServiceDate,
      proposedTimeSlot,
      booking._id,
      booking.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES,
      booking.serviceGeoLocation
    )) {
      return res.status(409).json({ message: "That proposed time slot is no longer available." });
    }
    booking.providerUpdates.push({
      type: isReschedule ? "reschedule" : "note",
      note,
      proposedServiceDate: proposedServiceDate || undefined,
      proposedTimeSlot: isReschedule ? proposedTimeSlot : undefined,
      status: isReschedule ? "pending" : "sent",
      requestedAt: new Date(),
    });
    await booking.save();
    try {
      await appendBookingSystemMessage(
        booking,
        isReschedule ? `Provider requested a new appointment time: ${note}` : `Provider update: ${note}`,
        req.user._id,
        "provider_update",
        { updateType: isReschedule ? "reschedule" : "note", note }
      );
    } catch (messageError) {
      console.error("Provider update system message error:", messageError);
    }
    const bookingIdValue = String(booking._id);
    await notifyBooking({
      userIds: [String(booking.clientId)],
      title: isReschedule ? "Schedule change requested" : "Booking update",
      body: isReschedule ? "Your provider requested a schedule change." : "Your provider sent an update about the booking.",
      url: bookingUrl("client", bookingIdValue),
      data: { event: isReschedule ? "booking.reschedule_requested" : "booking.provider_update", bookingId: bookingIdValue },
    });
    await booking.populate(populatePaths);
    return res.json({ booking: serializeBooking(booking) });
  } catch (error) {
    console.error("Provider booking update error:", error);
    return res.status(500).json({ message: "Could not send the booking update." });
  }
}

async function handleProviderUpdateResponse(req, res) {
  const bookingId = String(req.params.id || "");
  const updateId = String(req.body.updateId || "");
  const action = String(req.body.action || "");
  if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: "Choose a valid booking." });
  if (req.user.role !== "client") return res.status(403).json({ message: "Only the client can respond to a schedule request." });
  if (!mongoose.isValidObjectId(updateId) || !["accept", "reject"].includes(action)) return res.status(400).json({ message: "Choose a valid schedule response." });

  try {
    const booking = await Booking.findOne({ _id: bookingId, clientId: req.user._id });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    const update = booking.providerUpdates.id(updateId);
    if (!update || update.type !== "reschedule" || update.status !== "pending") {
      return res.status(409).json({ message: "This schedule request is no longer awaiting a response." });
    }
    if (action === "accept") {
      if (booking.status !== "approved") return res.status(409).json({ message: "The booking has already started and can no longer be rescheduled." });
      if (await hasConflictingSlot(
        booking.providerId,
        update.proposedServiceDate,
        update.proposedTimeSlot,
        booking._id,
        booking.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES,
        booking.serviceGeoLocation
      )) {
        return res.status(409).json({ message: "That proposed time slot is no longer available." });
      }
      booking.serviceDate = update.proposedServiceDate;
      booking.timeSlot = update.proposedTimeSlot;
      update.status = "accepted";
    } else {
      update.status = "rejected";
    }
    update.respondedAt = new Date();
    await booking.save();
    await booking.populate(populatePaths);
    return res.json({ booking: serializeBooking(booking) });
  } catch (error) {
    console.error("Schedule request response error:", error);
    return res.status(500).json({ message: "Could not respond to the schedule request." });
  }
}

async function handleCreateCounterOffer(req, res) {
  const bookingId = String(req.params.id || "");
  const counterOfferIdToCounter = String(req.body.counterOfferId || "").trim();
  const proposedPriceValue = String(req.body.proposedPrice ?? "").trim();
  const proposedDateValue = String(req.body.proposedServiceDate || "").trim();
  const proposedTimeSlot = String(req.body.proposedTimeSlot || "").trim();
  const proposedRepairDescription = String(req.body.proposedRepairDescription || "").trim();
  const note = String(req.body.note || "").trim();
  const hasPrice = proposedPriceValue !== "";
  const proposedPrice = hasPrice ? Number(proposedPriceValue) : undefined;
  const requestedDuration = req.body.counterOfferDurationMinutes;

  if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: "Choose a valid booking." });
  if (counterOfferIdToCounter && !mongoose.isValidObjectId(counterOfferIdToCounter)) return res.status(400).json({ message: "Choose a valid counter-offer to respond to." });
  if (!["client", "provider"].includes(req.user.role)) return res.status(403).json({ message: "Only booking participants can negotiate booking terms." });
  if (!hasPrice) return res.status(400).json({ message: "Enter a task offer amount to counter the booking." });
  if (proposedDateValue || proposedTimeSlot || proposedRepairDescription) {
    return res.status(400).json({ message: "Counter-offers can only change the task price and, for providers, task duration." });
  }
  if (req.user.role === "client" && requestedDuration != null) return res.status(400).json({ message: "Only providers can propose a different task duration." });
  if (hasPrice && (!Number.isFinite(proposedPrice) || proposedPrice < 100)) return res.status(400).json({ message: "Counter-offer price must be at least PHP 100." });
  if (note.length > 500) return res.status(400).json({ message: "The counter-offer note exceeds the allowed length." });

  try {
    const participantField = req.user.role === "client" ? "clientId" : "providerId";
    let booking = await Booking.findOne({ _id: bookingId, [participantField]: req.user._id });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (booking.status !== "pending") return res.status(409).json({ message: "Terms can only be negotiated before the booking is accepted." });
    const pendingOffer = booking.counterOffers.find((offer) => offer.status === "pending");
    if (pendingOffer && !counterOfferIdToCounter) {
      return res.status(409).json({ message: "A counter-offer is awaiting a response. Choose Counter-offer on that offer to negotiate back." });
    }
    if (!pendingOffer && counterOfferIdToCounter) {
      return res.status(409).json({ message: "That offer is no longer awaiting a response. Refresh the conversation and try again." });
    }
    if (pendingOffer && String(pendingOffer._id) !== counterOfferIdToCounter) {
      return res.status(409).json({ message: "The current offer changed. Refresh the conversation and try again." });
    }
    if (pendingOffer?.proposedBy === req.user.role) {
      return res.status(403).json({ message: "You cannot counter your own offer. Wait for the other participant to respond." });
    }
    const currentDuration = pendingOffer?.counterOfferDurationMinutes
      ?? booking.estimatedDurationMinutes
      ?? DEFAULT_ESTIMATED_DURATION_MINUTES;
    const counterOfferDurationMinutes = req.user.role === "provider"
      ? Number(requestedDuration ?? currentDuration)
      : undefined;
    if (counterOfferDurationMinutes != null && !isValidEstimatedDurationMinutes(counterOfferDurationMinutes)) {
      return res.status(400).json({ message: "Choose a counter-offer duration from 15 minutes to 12 hours in 15-minute increments." });
    }
    const candidateDuration = counterOfferDurationMinutes ?? currentDuration;
    const scheduleBookings = await findProviderBookingsForSchedule(booking.providerId, booking.serviceDate, booking._id);
    if (hasScheduleConflict({
      serviceDate: booking.serviceDate,
      timeSlot: booking.timeSlot,
      estimatedDurationMinutes: candidateDuration,
      serviceGeoLocation: booking.serviceGeoLocation,
    }, scheduleBookings, booking._id)) {
      return res.status(409).json({ message: "That task duration leaves too little time for travel between pinned client locations and the 30-minute safety buffer. Shorten the duration or choose a different schedule." });
    }

    const counterOfferId = new mongoose.Types.ObjectId();
    const nextOffer = {
      _id: counterOfferId,
      proposedBy: req.user.role,
      proposedPrice,
      counterOfferDurationMinutes: candidateDuration,
      note,
      status: "pending",
      createdAt: new Date(),
    };
    const updateFilter = {
      _id: booking._id,
      [participantField]: req.user._id,
      status: "pending",
      counterOffers: pendingOffer
        ? mongoose.trusted({
          $elemMatch: {
            _id: pendingOffer._id,
            status: "pending",
            proposedBy: mongoose.trusted({ $ne: req.user.role }),
          },
        })
        : mongoose.trusted({ $not: mongoose.trusted({ $elemMatch: { status: "pending" } }) }),
    };
    const updateOperation = pendingOffer
      ? [{
        $set: {
          counterOffers: {
            $concatArrays: [
              {
                $map: {
                  input: { $ifNull: ["$counterOffers", []] },
                  as: "existingOffer",
                  in: {
                    $cond: [
                      { $eq: ["$$existingOffer._id", pendingOffer._id] },
                      { $mergeObjects: ["$$existingOffer", { status: "countered", respondedAt: nextOffer.createdAt }] },
                      "$$existingOffer",
                    ],
                  },
                },
              },
              { $literal: [nextOffer] },
            ],
          },
        },
      }]
      : { $push: { counterOffers: nextOffer } };
    const updatedBooking = await Booking.findOneAndUpdate(updateFilter, updateOperation, {
      new: true,
      runValidators: true,
      ...(pendingOffer ? { updatePipeline: true } : {}),
    });
    if (!updatedBooking) return res.status(409).json({ message: "Another counter-offer is already awaiting a response. Refresh the booking and try again." });
    booking.counterOffers = updatedBooking.counterOffers;
    const offer = booking.counterOffers.id(counterOfferId);
    if (pendingOffer) {
      await updateCounterOfferMessageStatus(booking._id, pendingOffer._id, "countered", req.user.role, nextOffer.createdAt);
    }
    const eventData = {
      counterOfferId: String(offer._id),
      proposedBy: offer.proposedBy,
      proposedPrice: offer.proposedPrice ?? booking.offeredPrice,
      counterOfferDurationMinutes: offer.counterOfferDurationMinutes
        ?? pendingOffer?.counterOfferDurationMinutes
        ?? booking.estimatedDurationMinutes
        ?? DEFAULT_ESTIMATED_DURATION_MINUTES,
      note: offer.note || "",
      status: "pending",
    };
    const bookingIdValue = String(booking._id);
    const recipientRole = req.user.role === "client" ? "provider" : "client";
    const recipientId = recipientRole === "provider" ? booking.providerId : booking.clientId;
    await notifyBooking({
      userIds: [String(recipientId)],
      title: "Booking terms updated",
      body: `${req.user.role === "client" ? "The client" : "The provider"} ${pendingOffer ? "sent a counter-offer" : "proposed updated booking terms"}.`,
      url: bookingUrl(recipientRole, bookingIdValue),
      data: {
        event: "booking.counter_offer",
        bookingId: bookingIdValue,
        counterOfferId: String(offer._id),
        ...(pendingOffer ? { counteredOfferId: String(pendingOffer._id) } : {}),
      },
    });
    await appendBookingSystemMessage(
      booking,
      `${req.user.role === "client" ? "Client" : "Provider"} ${pendingOffer ? "countered the offer with new" : "proposed updated"} booking terms.`,
      req.user._id,
      "counter_offer",
      eventData
    );
    await booking.populate(populatePaths);
    return res.status(201).json({ booking: serializeBooking(booking), counterOfferId: String(offer._id) });
  } catch (error) {
    console.error("Create counter-offer error:", error);
    return res.status(500).json({ message: "Could not send the counter-offer." });
  }
}

async function handleRespondToCounterOffer(req, res) {
  const bookingId = String(req.params.id || "");
  const counterOfferId = String(req.params.counterOfferId || "");
  const action = String(req.body.action || "");
  if (!mongoose.isValidObjectId(bookingId) || !mongoose.isValidObjectId(counterOfferId)) return res.status(400).json({ message: "Choose a valid booking offer." });
  if (!["accept", "reject"].includes(action)) return res.status(400).json({ message: "Choose accept or reject." });
  if (!["client", "provider"].includes(req.user.role)) return res.status(403).json({ message: "Only booking participants can respond to offers." });

  try {
    const participantField = req.user.role === "client" ? "clientId" : "providerId";
    let booking = await Booking.findOne({ _id: bookingId, [participantField]: req.user._id });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (booking.status !== "pending") return res.status(409).json({ message: "This booking is no longer open for negotiation." });
    const offer = booking.counterOffers.id(counterOfferId);
    if (!offer || offer.status !== "pending") return res.status(409).json({ message: "This offer is no longer pending." });
    if (offer.proposedBy === req.user.role) return res.status(403).json({ message: "The other participant must respond to this offer." });

    const now = new Date();
    if (action === "accept") {
      const acceptedDuration = offer.counterOfferDurationMinutes
        ?? booking.estimatedDurationMinutes
        ?? DEFAULT_ESTIMATED_DURATION_MINUTES;
      const scheduleBookings = await findProviderBookingsForSchedule(booking.providerId, booking.serviceDate, booking._id);
      if (hasScheduleConflict({
        serviceDate: booking.serviceDate,
        timeSlot: booking.timeSlot,
        estimatedDurationMinutes: acceptedDuration,
        serviceGeoLocation: booking.serviceGeoLocation,
      }, scheduleBookings, booking._id)) {
        return res.status(409).json({ message: "That counter-offer duration leaves too little time for travel between pinned client locations and the 30-minute safety buffer. The offer cannot be accepted." });
      }
      const acceptedBooking = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          [participantField]: req.user._id,
          status: "pending",
          counterOffers: mongoose.trusted({
            $elemMatch: {
              _id: offer._id,
              status: "pending",
              proposedBy: mongoose.trusted({ $ne: req.user.role }),
            },
          }),
        },
        {
          $set: {
            offeredPrice: offer.proposedPrice ?? booking.offeredPrice,
            estimatedDurationMinutes: acceptedDuration,
            status: "approved",
            "counterOffers.$.status": "accepted",
            "counterOffers.$.respondedAt": now,
          },
          $push: { statusHistory: { status: "approved", at: now } },
        },
        { new: true, runValidators: true }
      );
      if (!acceptedBooking) return res.status(409).json({ message: "This counter-offer has already been answered or the booking has changed." });
      booking = acceptedBooking;
    } else {
      offer.status = "rejected";
      offer.respondedAt = now;
      await booking.save();
    }
    const resolvedOffer = booking.counterOffers.id(counterOfferId);
    await updateCounterOfferMessageStatus(booking._id, resolvedOffer._id, resolvedOffer.status, req.user.role, now);
    const bookingIdValue = String(booking._id);
    const proposerRole = resolvedOffer.proposedBy;
    const proposerId = proposerRole === "provider" ? booking.providerId : booking.clientId;
    await notifyBooking({
      userIds: [String(proposerId)],
      title: action === "accept" ? "Counter-offer accepted" : "Counter-offer declined",
      body: action === "accept" ? "The other participant accepted your updated booking terms." : "The other participant declined your updated booking terms.",
      url: bookingUrl(proposerRole, bookingIdValue),
      data: { event: `booking.counter_offer_${action === "accept" ? "accepted" : "declined"}`, bookingId: bookingIdValue, counterOfferId: String(offer._id) },
    });
    const eventData = {
      counterOfferId: String(resolvedOffer._id),
      proposedBy: resolvedOffer.proposedBy,
      proposedPrice: resolvedOffer.proposedPrice ?? booking.offeredPrice,
      counterOfferDurationMinutes: resolvedOffer.counterOfferDurationMinutes ?? booking.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES,
      proposedServiceDate: booking.serviceDate,
      proposedTimeSlot: booking.timeSlot,
      proposedRepairDescription: booking.repairDescription,
      note: resolvedOffer.note || "",
      status: resolvedOffer.status,
    };
    await appendBookingSystemMessage(
      booking,
      action === "accept" ? "Counter-offer accepted. The updated booking terms are now confirmed." : "Counter-offer declined. The original booking terms remain in effect.",
      req.user._id,
      "counter_offer",
      eventData
    );
    if (action === "reject") {
      await appendBookingSystemMessage(
        booking,
        "The original booking request is available again. The original terms remain in effect.",
        booking.clientId,
        "booking_request",
        {
          resurfaced: true,
          repairDescription: booking.repairDescription,
          offeredPrice: booking.offeredPrice,
          estimatedDurationMinutes: booking.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES,
          travelDistanceKm: booking.travelDistanceKm ?? null,
          travelFee: booking.travelFee || 0,
          tipAmount: booking.tipAmount || 0,
          totalPrice: calculateTotalPrice(booking.offeredPrice || 0, booking.travelFee || 0, booking.tipAmount || 0),
          serviceDate: booking.serviceDate,
          timeSlot: booking.timeSlot,
          paymentMethod: booking.paymentMethod || "cash",
        }
      );
    }
    await booking.populate(populatePaths);
    return res.json({ booking: serializeBooking(booking) });
  } catch (error) {
    console.error("Counter-offer response error:", error);
    return res.status(500).json({ message: "Could not respond to the counter-offer." });
  }
}

async function processExpiredBookingRequests() {
  const now = new Date();
  const result = await Booking.updateMany(
    {
      status: mongoose.trusted({ $in: ["pending", "Pending Request"] }),
      requestExpiresAt: mongoose.trusted({ $lte: now }),
    },
    {
      $set: { status: "expired" },
      $push: { statusHistory: { status: "expired", at: now } },
    }
  );
  return result.modifiedCount;
}

module.exports = { handleListBookings, handleDismissDashboardBookings, handleRestoreDashboardBookings, handleProviderAvailability, handleReportRunningLate, handleRespondToLateNotice, handleServiceLocationSearch, handleServiceLocationReverseLookup, handleCreateBooking, handleUpdateBookingStatus, handleSubmitCompletion, handleCreateRevisionRequest, handleRespondToRevision, handleCancellation, handleBookingReview, handleProviderUpdate, handleProviderUpdateResponse, handleCreateCounterOffer, handleRespondToCounterOffer, processCashSettlementFallbacks, processExpiredBookingRequests };
