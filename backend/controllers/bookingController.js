const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const User = require("../models/User");

const TIME_SLOTS = new Set(["7:30 AM", "9:00 AM", "10:30 AM", "1:30 PM", "3:00 PM", "4:30 PM", "6:00 PM"]);
const PH_TIMEZONE_OFFSET_HOURS = 8;
const STATUS_VALUES = new Set(["approved", "en_route", "in_progress", "canceled", "complete"]);
const STATUS_ALIASES = {
  confirmed: "approved",
  "on the way": "en_route",
  "in progress": "in_progress",
  declined: "canceled",
  cancelled: "canceled",
  completed: "complete",
};
const STATUS_LABELS = {
  pending: "Pending Request",
  approved: "Confirmed",
  en_route: "On the Way",
  in_progress: "In Progress",
  cancel_requested: "Cancellation Requested",
  canceled: "Cancelled",
  complete: "Completed",
};

const GRACE_PERIOD_MS = 10 * 60 * 1000;

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

function serializeBooking(booking) {
  const client = booking.clientId && typeof booking.clientId === "object" ? booking.clientId : null;
  const provider = booking.providerId && typeof booking.providerId === "object" ? booking.providerId : null;
  const statusCode = normalizeBookingStatus(booking.status);
  const repairDescription = booking.repairDescription || booking.description || booking.task || "";
  const serviceDate = booking.serviceDate || booking.date || booking.createdAt;
  const timeSlot = booking.timeSlot || booking.time || "";
  const offeredPrice = booking.offeredPrice ?? booking.offer ?? 0;
  const photoUrls = booking.photoUrl ? [booking.photoUrl] : [];
  const statusHistory = booking.statusHistory?.length
    ? booking.statusHistory.map((event) => ({ status: STATUS_LABELS[event.status] || event.status, at: event.at }))
    : [{ status: STATUS_LABELS.pending, at: booking.createdAt }];
  return {
    id: String(booking._id),
    clientId: String(client?._id || booking.clientId),
    providerId: String(provider?._id || booking.providerId),
    client: client?.fullName || client?.username || client?.email || "Client",
    worker: provider?.fullName || provider?.username || provider?.email || "Provider",
    cred: provider?.professions?.join(" · ") || "Service provider",
    task: repairDescription,
    description: repairDescription,
    repairDescription,
    address: booking.address || "Address to be confirmed",
    date: new Date(serviceDate).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }),
    serviceDate: new Date(serviceDate).toISOString(),
    time: timeSlot,
    timeSlot,
    price: `P${Number(offeredPrice).toLocaleString()}`,
    offer: offeredPrice,
    offeredPrice,
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
  { path: "clientId", select: "fullName username email" },
  { path: "providerId", select: "fullName username email professions" },
];

async function handleListBookings(req, res) {
  try {
    const requestedClientId = req.query.clientId ? String(req.query.clientId) : "";
    const requestedProviderId = req.query.providerId ? String(req.query.providerId) : "";
    const requestedStatus = req.query.status ? String(req.query.status) : "";
    if (requestedClientId && !mongoose.isValidObjectId(requestedClientId)) return res.status(400).json({ message: "Invalid clientId filter." });
    if (requestedProviderId && !mongoose.isValidObjectId(requestedProviderId)) return res.status(400).json({ message: "Invalid providerId filter." });
    const normalizedStatus = normalizeBookingStatus(requestedStatus);
    if (requestedStatus && !["pending", "approved", "en_route", "in_progress", "cancel_requested", "canceled", "complete"].includes(normalizedStatus)) return res.status(400).json({ message: "Invalid status filter." });

    const filter = { status: normalizedStatus || mongoose.trusted({ $in: ["pending", "approved", "en_route", "in_progress", "cancel_requested", "canceled", "complete", "Pending Request", "Confirmed", "On the Way", "In Progress", "Cancellation Requested", "Declined", "Cancelled", "Completed"] }) };
    if (req.user.role === "provider") {
      filter.providerId = req.user._id;
      if (requestedProviderId && requestedProviderId !== String(req.user._id)) return res.status(403).json({ message: "You can only view your own provider bookings." });
    } else {
      filter.clientId = req.user._id;
      if (requestedClientId && requestedClientId !== String(req.user._id)) return res.status(403).json({ message: "You can only view your own client bookings." });
    }
    await Booking.updateMany(
      mongoose.trusted({ ...filter, status: "cancel_requested", cancellationExpiresAt: mongoose.trusted({ $lte: new Date() }) }),
      {
        $set: { status: "canceled", cancellationResolvedAt: new Date(), cancellationOutcome: "expired" },
        $push: { statusHistory: { status: "canceled", at: new Date() } },
      }
    );
    const bookings = await Booking.find(filter).sort({ createdAt: -1, _id: -1 }).populate(populatePaths);
    return res.json({ bookings: bookings.map(serializeBooking) });
  } catch (error) {
    console.error("List bookings error:", error);
    return res.status(500).json({ message: "Could not load bookings." });
  }
}

async function handleCreateBooking(req, res) {
  if (req.user.role !== "client") return res.status(403).json({ message: "Only clients can create bookings." });

  const providerId = String(req.body.providerId || "");
  const repairDescription = String(req.body.repairDescription || req.body.description || req.body.task || "").trim();
  const address = String(req.body.address || "").trim();
  const serviceDate = parseServiceDate(req.body.serviceDate || req.body.date);
  const timeSlot = String(req.body.timeSlot || req.body.time || "").trim();
  const urgency = String(req.body.urgency || "Flexible").trim();
  const offeredPrice = Number(req.body.offeredPrice ?? req.body.offer);
  const termsAccepted = req.body.termsAccepted === true || req.body.termsAccepted === "true";

  if (!mongoose.isValidObjectId(providerId)) return res.status(400).json({ message: "Choose a valid provider." });
  if (!repairDescription || repairDescription.length > 2000) return res.status(400).json({ message: "Add a valid description of the repair." });
  if (!serviceDate) return res.status(400).json({ message: "Choose a valid service date." });
  if (!TIME_SLOTS.has(timeSlot)) return res.status(400).json({ message: "Choose an available time slot." });
  if (!Number.isFinite(offeredPrice) || offeredPrice < 100) return res.status(400).json({ message: "Your offer must be at least PHP 100." });
  if (!["Emergency", "Flexible"].includes(urgency)) return res.status(400).json({ message: "Choose a valid urgency." });
  if (!termsAccepted) return res.status(400).json({ message: "Accept the terms and cancellation policy before submitting." });

  try {
    const provider = await User.findOne({ _id: providerId, role: "provider", registrationComplete: true }).select("_id");
    if (!provider) return res.status(404).json({ message: "That provider is no longer available." });
    const serviceDayStart = new Date(serviceDate);
    serviceDayStart.setUTCHours(0, 0, 0, 0);
    const serviceDayEnd = new Date(serviceDayStart);
    serviceDayEnd.setUTCDate(serviceDayEnd.getUTCDate() + 1);
    const conflictingBooking = await Booking.exists({
      providerId: provider._id,
      serviceDate: mongoose.trusted({ $gte: serviceDayStart, $lt: serviceDayEnd }),
      timeSlot,
      status: mongoose.trusted({ $in: ["pending", "approved", "en_route", "in_progress", "cancel_requested", "Pending Request", "Confirmed", "On the Way", "In Progress", "Cancellation Requested"] }),
    });
    if (conflictingBooking) return res.status(409).json({ message: "That time slot is no longer available." });
    const booking = await Booking.create({
      clientId: req.user._id,
      providerId: provider._id,
      repairDescription,
      address,
      serviceDate,
      timeSlot,
      offeredPrice,
      urgency,
      photoUrl: req.files?.[0] ? `/uploads/${req.files[0].filename}` : "",
      statusHistory: [{ status: "pending", at: new Date() }],
    });
    await booking.populate(populatePaths);
    return res.status(201).json({ booking: serializeBooking(booking) });
  } catch (error) {
    console.error("Create booking error:", error);
    return res.status(500).json({ message: "Could not submit the booking." });
  }
}

async function handleUpdateBookingStatus(req, res) {
  const bookingId = String(req.params.id || "");
  const status = normalizeBookingStatus(req.body.status);
  if (!mongoose.isValidObjectId(bookingId)) {
    return res.status(400).json({ message: "Choose a valid booking." });
  }
  if (!STATUS_VALUES.has(status)) {
    return res.status(400).json({
      message: `Unsupported booking status "${status || "(empty)"}". Use approved, en_route, in_progress, canceled, or complete.`,
    });
  }
  if (req.user.role !== "provider") {
    return res.status(403).json({ message: "Only providers can update booking status." });
  }

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
      canceled: ["pending", "Pending Request"],
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
    return res.json({ booking: serializeBooking(booking) });
  } catch (error) {
    console.error("Update booking status error:", error);
    return res.status(500).json({ message: "Could not update the booking status." });
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
      if (!["pending", "approved", "en_route", "in_progress"].includes(booking.status)) return res.status(409).json({ message: "This booking is no longer active." });
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
    if (booking.status !== "complete") return res.status(409).json({ message: "Only completed bookings can be reviewed." });
    if (booking.clientRating != null) return res.status(409).json({ message: "This booking already has a review." });
    booking.clientRating = rating;
    booking.clientReview = review;
    booking.clientReviewPhotos = (req.files || []).map((file) => `/uploads/${file.filename}`);
    booking.reviewedAt = new Date();
    await booking.save();
    await booking.populate(populatePaths);
    return res.json({ booking: serializeBooking(booking) });
  } catch (error) {
    console.error("Booking review error:", error);
    return res.status(500).json({ message: "Could not save the booking review." });
  }
}

async function hasConflictingSlot(providerId, serviceDate, timeSlot, excludeBookingId) {
  const dayStart = new Date(serviceDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  return Booking.exists({
    providerId,
    _id: mongoose.trusted({ $ne: excludeBookingId }),
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

module.exports = { handleListBookings, handleCreateBooking, handleUpdateBookingStatus, handleCancellation, handleBookingReview, handleProviderUpdate, handleProviderUpdateResponse };
