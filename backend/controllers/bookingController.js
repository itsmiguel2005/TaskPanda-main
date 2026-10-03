const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const User = require("../models/User");
const { ensureBookingConversation, appendBookingSystemMessage } = require("../services/bookingMessaging");
const { sendPushNotification } = require("../services/oneSignal");
const { calculateDistanceKm, calculateTravelFare, calculateTotalPrice } = require("../services/bookingPricing");

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
};

const GRACE_PERIOD_MS = 10 * 60 * 1000;
const CASH_SETTLEMENT_GRACE_MS = 48 * 60 * 60 * 1000;

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
    date: new Date(serviceDate).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }),
    serviceDate: new Date(serviceDate).toISOString(),
    time: timeSlot,
    timeSlot,
    price: `P${totalPrice.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`,
    offer: offeredPrice,
    offeredPrice,
    taskOffer: offeredPrice,
    travelDistanceKm,
    travelFee,
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
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
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
    if (requestedStatus && !["pending", "approved", "en_route", "in_progress", "cancel_requested", "canceled", "declined", "complete", "in_revision", "disputed", "closed", "settled"].includes(normalizedStatus)) return res.status(400).json({ message: "Invalid status filter." });

    const filter = {};
    if (normalizedStatus) {
      filter.status = normalizedStatus;
    } else {
      filter.status = mongoose.trusted({ $in: ["pending", "approved", "en_route", "in_progress", "cancel_requested", "canceled", "declined", "complete", "in_revision", "disputed", "closed", "settled", "Pending Request", "Confirmed", "On the Way", "In Progress", "Cancellation Requested", "Declined", "Declined by Provider", "Cancelled", "Completed", "Settled"] });
    }
    if (req.user.role === "provider") {
      filter.providerId = req.user._id;
      if (requestedProviderId && requestedProviderId !== String(req.user._id)) return res.status(403).json({ message: "You can only view your own provider bookings." });
    } else {
      filter.clientId = req.user._id;
      if (requestedClientId && requestedClientId !== String(req.user._id)) return res.status(403).json({ message: "You can only view your own client bookings." });
    }

    const bookings = await Booking.find(filter).sort({ createdAt: -1, _id: -1 }).populate(populatePaths);
    return res.json({ bookings: bookings.map(serializeBooking) });
  } catch (error) {
    console.error("List bookings error:", error);
    return res.status(500).json({
      message: error?.message || "Could not submit the booking.",
      details: process.env.NODE_ENV !== "production" ? String(error?.stack || error) : undefined,
    });
  }
}

async function handleProviderAvailability(req, res) {
  const providerId = String(req.params.providerId || "");
  if (!mongoose.isValidObjectId(providerId)) return res.status(400).json({ message: "Choose a valid provider." });
  if (req.user.role !== "client") return res.status(403).json({ message: "Only clients can check provider availability." });

  try {
    const travelQuote = await getBookingTravelQuote(req.user, providerId);
    if (travelQuote.errorStatus) return res.status(travelQuote.errorStatus).json({ message: travelQuote.message });
    const provider = travelQuote.provider;
    if (!provider) return res.status(404).json({ message: "That provider is no longer available." });

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const activeStatuses = ["pending", "approved", "en_route", "in_progress", "cancel_requested", "Pending Request", "Confirmed", "On the Way", "In Progress", "Cancellation Requested"];
    const bookings = await Booking.find({
      providerId: provider._id,
      serviceDate: mongoose.trusted({ $gte: startOfToday }),
      status: mongoose.trusted({ $in: activeStatuses }),
    }).select("serviceDate timeSlot").lean();

    return res.json({
      bookedSlots: bookings.map((booking) => ({
        date: new Date(booking.serviceDate).toISOString().slice(0, 10),
        timeSlot: booking.timeSlot,
      })),
      travelDistanceKm: travelQuote.travelDistanceKm,
      travelFee: travelQuote.travelFee,
    });
  } catch (error) {
    console.error("Provider availability error:", error);
    return res.status(500).json({ message: "Could not load provider availability." });
  }
}

async function getBookingTravelQuote(client, providerId) {
  const provider = await User.findOne({ _id: providerId, role: "provider", registrationComplete: true }).select("_id geoLocation");
  if (!provider) return { errorStatus: 404, message: "That provider is no longer available." };

  const calculatedDistanceKm = calculateDistanceKm(client.geoLocation?.coordinates, provider.geoLocation?.coordinates);
  if (calculatedDistanceKm == null) {
    return { errorStatus: 400, message: "A map location is required for both accounts to calculate the travel fare." };
  }

  const travelDistanceKm = Math.round(calculatedDistanceKm * 100) / 100;
  return { provider, travelDistanceKm, travelFee: calculateTravelFare(travelDistanceKm) };
}

async function handleCreateBooking(req, res) {
  if (req.user.role !== "client") return res.status(403).json({ message: "Only clients can create bookings." });

  const providerId = String(req.body.providerId || req.body.provider || "").trim();
  const repairDescription = String(req.body.repairDescription || req.body.description || req.body.task || req.body.serviceDetails || "").trim();
  const address = String(req.body.address || req.body.location || "").trim();
  const serviceDate = parseServiceDate(req.body.serviceDate || req.body.date || req.body.service_details?.date || "");
  const timeSlot = String(req.body.timeSlot || req.body.time || req.body.service_details?.time || "").trim();
  const urgency = String(req.body.urgency || "Flexible").trim();
  const offeredPrice = Number(req.body.offeredPrice ?? req.body.offerPrice ?? req.body.offer ?? req.body.price ?? 0);
  const tipAmount = Number(req.body.tipAmount ?? 0);
  const paymentMethod = String(req.body.paymentMethod || "cash").trim().toLowerCase();
  const termsAccepted = req.body.termsAccepted === true || req.body.termsAccepted === "true" || req.body.termsAccepted === "True";
  const safeStatus = "pending";
  delete req.body.status;

  if (!mongoose.isValidObjectId(providerId)) return res.status(400).json({ message: "Choose a valid provider." });
  if (!repairDescription || repairDescription.length > 2000) return res.status(400).json({ message: "Add a valid description of the repair." });
  if (!serviceDate) return res.status(400).json({ message: "Choose a valid service date." });
  if (!TIME_SLOTS.has(timeSlot)) return res.status(400).json({ message: "Choose an available time slot." });
  if (!Number.isFinite(offeredPrice) || offeredPrice < 100) return res.status(400).json({ message: "Your offer must be at least PHP 100." });
  if (!Number.isFinite(tipAmount) || tipAmount < 0 || tipAmount > 1000000) return res.status(400).json({ message: "Enter a valid tip amount." });
  if (paymentMethod !== "cash") return res.status(400).json({ message: "Cash on completion is the only supported payment method." });
  if (!["Emergency", "Flexible"].includes(urgency)) return res.status(400).json({ message: "Choose a valid urgency." });
  if (!termsAccepted) return res.status(400).json({ message: "Accept the terms and cancellation policy before submitting." });

  try {
    const travelQuote = await getBookingTravelQuote(req.user, providerId);
    if (travelQuote.errorStatus) return res.status(travelQuote.errorStatus).json({ message: travelQuote.message });
    const { provider, travelDistanceKm, travelFee } = travelQuote;

    const slotTimeMinutes = (() => {
      const match = String(timeSlot).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (!match) return Number.POSITIVE_INFINITY;
      let hours = Number(match[1]);
      const minutes = Number(match[2]);
      const period = String(match[3]).toUpperCase();
      if (period === "AM" && hours === 12) hours = 0;
      if (period === "PM" && hours !== 12) hours += 12;
      return hours * 60 + minutes;
    })();

    const today = new Date();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const serviceDateOnly = new Date(serviceDate);
    serviceDateOnly.setUTCHours(0, 0, 0, 0);

    if (serviceDateOnly.getTime() < todayOnly.getTime()) {
      return res.status(400).json({ message: "The selected service date is in the past." });
    }

    if (serviceDateOnly.getTime() === todayOnly.getTime() && slotTimeMinutes < (today.getHours() * 60 + today.getMinutes())) {
      return res.status(400).json({ message: "That time slot has already passed." });
    }

    const serviceDayStart = new Date(serviceDate);
    serviceDayStart.setUTCHours(0, 0, 0, 0);
    const serviceDayEnd = new Date(serviceDayStart);
    serviceDayEnd.setUTCDate(serviceDayEnd.getUTCDate() + 1);

    const existingBooking = await Booking.findOne({
      providerId: provider._id,
      serviceDate: mongoose.trusted({ $gte: serviceDayStart, $lt: serviceDayEnd }),
      timeSlot,
      status: mongoose.trusted({ $in: ["pending", "approved", "en_route", "in_progress", "cancel_requested"] }),
    });

    if (existingBooking) {
      return res.status(409).json({ message: "That time slot is no longer available." });
    }

    const booking = await Booking.create({
      clientId: req.user._id,
      providerId: provider._id,
      repairDescription,
      address,
      serviceDate,
      timeSlot,
      offeredPrice,
      travelDistanceKm,
      travelFee,
      tipAmount,
      urgency,
      paymentMethod,
      photoUrl: req.files?.[0] ? `/uploads/${req.files[0].filename}` : "",
      status: safeStatus,
      statusHistory: [{ status: "pending", at: new Date() }],
    });

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
    const now = new Date();
    const booking = await Booking.findOneAndUpdate(
      filter,
      { $set: { status }, $push: { statusHistory: { status, at: now } } },
      { new: true }
    ).populate(populatePaths);
    if (!booking) return res.status(404).json({ message: "Booking not found or it has already been updated." });
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

async function hasConflictingSlot(providerId, serviceDate, timeSlot, excludeBookingId) {
  const dayStart = new Date(serviceDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  return Booking.exists({
    providerId,
    _id: mongoose.trusted({ $ne: excludeBookingId || null }),
    serviceDate: mongoose.trusted({ $gte: dayStart, $lt: dayEnd }),
    timeSlot,
    status: mongoose.trusted({ $in: ["pending", "approved", "en_route", "in_progress", "cancel_requested"] }),
  });
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
    if (isReschedule && await hasConflictingSlot(booking.providerId, proposedServiceDate, proposedTimeSlot, booking._id)) {
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
      if (await hasConflictingSlot(booking.providerId, update.proposedServiceDate, update.proposedTimeSlot, booking._id)) {
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
  const proposedPriceValue = String(req.body.proposedPrice ?? "").trim();
  const proposedDateValue = String(req.body.proposedServiceDate || "").trim();
  const proposedTimeSlot = String(req.body.proposedTimeSlot || "").trim();
  const proposedRepairDescription = String(req.body.proposedRepairDescription || "").trim();
  const note = String(req.body.note || "").trim();
  const hasPrice = proposedPriceValue !== "";
  const proposedPrice = hasPrice ? Number(proposedPriceValue) : undefined;

  if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: "Choose a valid booking." });
  if (!["client", "provider"].includes(req.user.role)) return res.status(403).json({ message: "Only booking participants can negotiate booking terms." });
  if (!hasPrice) return res.status(400).json({ message: "Enter a task offer amount to counter the booking." });
  if (proposedDateValue || proposedTimeSlot || proposedRepairDescription) {
    return res.status(400).json({ message: "Counter-offers can only change the task offer amount." });
  }
  if (hasPrice && (!Number.isFinite(proposedPrice) || proposedPrice < 100)) return res.status(400).json({ message: "Counter-offer price must be at least PHP 100." });
  if (note.length > 500) return res.status(400).json({ message: "The counter-offer note exceeds the allowed length." });

  try {
    const participantField = req.user.role === "client" ? "clientId" : "providerId";
    const booking = await Booking.findOne({ _id: bookingId, [participantField]: req.user._id });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (booking.status !== "pending") return res.status(409).json({ message: "Terms can only be negotiated before the booking is accepted." });
    if (booking.counterOffers.some((offer) => offer.status === "pending")) {
      return res.status(409).json({ message: "Wait for the other participant to respond to the current offer." });
    }
    booking.counterOffers.push({
      proposedBy: req.user.role,
      proposedPrice,
      note,
      status: "pending",
      createdAt: new Date(),
    });
    const offer = booking.counterOffers[booking.counterOffers.length - 1];
    await booking.save();
    const eventData = {
      counterOfferId: String(offer._id),
      proposedBy: offer.proposedBy,
      proposedPrice: offer.proposedPrice ?? booking.offeredPrice,
      note: offer.note || "",
      status: "pending",
    };
    const bookingIdValue = String(booking._id);
    const recipientRole = req.user.role === "client" ? "provider" : "client";
    const recipientId = recipientRole === "provider" ? booking.providerId : booking.clientId;
    await notifyBooking({
      userIds: [String(recipientId)],
      title: "Booking terms updated",
      body: `${req.user.role === "client" ? "The client" : "The provider"} proposed a change to booking terms.`,
      url: bookingUrl(recipientRole, bookingIdValue),
      data: { event: "booking.counter_offer", bookingId: bookingIdValue, counterOfferId: String(offer._id) },
    });
    await appendBookingSystemMessage(
      booking,
      `${req.user.role === "client" ? "Client" : "Provider"} proposed updated booking terms.`,
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
    const booking = await Booking.findOne({ _id: bookingId, [participantField]: req.user._id });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (booking.status !== "pending") return res.status(409).json({ message: "This booking is no longer open for negotiation." });
    const offer = booking.counterOffers.id(counterOfferId);
    if (!offer || offer.status !== "pending") return res.status(409).json({ message: "This offer is no longer pending." });
    if (offer.proposedBy === req.user.role) return res.status(403).json({ message: "The other participant must respond to this offer." });

    const now = new Date();
    if (action === "accept") {
      if (offer.proposedPrice != null) booking.offeredPrice = offer.proposedPrice;
      booking.status = "approved";
      booking.statusHistory.push({ status: "approved", at: now });
      offer.status = "accepted";
    } else {
      offer.status = "rejected";
    }
    offer.respondedAt = now;
    await booking.save();
    const bookingIdValue = String(booking._id);
    const proposerRole = offer.proposedBy;
    const proposerId = proposerRole === "provider" ? booking.providerId : booking.clientId;
    await notifyBooking({
      userIds: [String(proposerId)],
      title: action === "accept" ? "Counter-offer accepted" : "Counter-offer declined",
      body: action === "accept" ? "The other participant accepted your updated booking terms." : "The other participant declined your updated booking terms.",
      url: bookingUrl(proposerRole, bookingIdValue),
      data: { event: `booking.counter_offer_${action === "accept" ? "accepted" : "declined"}`, bookingId: bookingIdValue, counterOfferId: String(offer._id) },
    });
    const eventData = {
      counterOfferId: String(offer._id),
      proposedBy: offer.proposedBy,
      proposedPrice: offer.proposedPrice ?? booking.offeredPrice,
      proposedServiceDate: booking.serviceDate,
      proposedTimeSlot: booking.timeSlot,
      proposedRepairDescription: booking.repairDescription,
      note: offer.note || "",
      status: offer.status,
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

module.exports = { handleListBookings, handleProviderAvailability, handleCreateBooking, handleUpdateBookingStatus, handleSubmitCompletion, handleCreateRevisionRequest, handleRespondToRevision, handleCancellation, handleBookingReview, handleProviderUpdate, handleProviderUpdateResponse, handleCreateCounterOffer, handleRespondToCounterOffer, processCashSettlementFallbacks };
