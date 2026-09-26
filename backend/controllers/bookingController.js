const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const User = require("../models/User");

const TIME_SLOTS = new Set(["7:30 AM", "9:00 AM", "10:30 AM", "1:30 PM", "3:00 PM", "4:30 PM", "6:00 PM"]);
const STATUS_VALUES = new Set(["approved", "canceled", "complete"]);
const STATUS_ALIASES = {
  Confirmed: "approved",
  Declined: "canceled",
  Cancelled: "canceled",
  Completed: "complete",
};
const STATUS_LABELS = {
  pending: "Pending Request",
  approved: "Confirmed",
  cancel_requested: "Cancellation Requested",
  canceled: "Cancelled",
  complete: "Completed",
};

const GRACE_PERIOD_MS = 10 * 60 * 1000;

function cancellationResponseWindow(serviceDate) {
  const hoursUntilService = (new Date(serviceDate).getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursUntilService <= 24) return 2 * 60 * 60 * 1000;
  if (hoursUntilService <= 48) return 6 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function parseServiceDate(value) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializeBooking(booking) {
  const client = booking.clientId && typeof booking.clientId === "object" ? booking.clientId : null;
  const provider = booking.providerId && typeof booking.providerId === "object" ? booking.providerId : null;
  const statusCode = STATUS_ALIASES[booking.status] || booking.status;
  const repairDescription = booking.repairDescription || booking.description || booking.task || "";
  const serviceDate = booking.serviceDate || booking.date || booking.createdAt;
  const timeSlot = booking.timeSlot || booking.time || "";
  const offeredPrice = booking.offeredPrice ?? booking.offer ?? 0;
  const photoUrls = booking.photoUrl ? [booking.photoUrl] : [];
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
    date: new Date(serviceDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
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
    const normalizedStatus = STATUS_ALIASES[requestedStatus] || requestedStatus;
    if (requestedStatus && !["pending", "approved", "cancel_requested", "canceled", "complete"].includes(normalizedStatus)) return res.status(400).json({ message: "Invalid status filter." });

    const filter = { status: normalizedStatus || mongoose.trusted({ $in: ["pending", "approved", "cancel_requested", "canceled", "complete", "Pending Request", "Confirmed", "Declined", "Cancelled", "Completed"] }) };
    if (req.user.role === "provider") {
      filter.providerId = req.user._id;
      if (requestedProviderId && requestedProviderId !== String(req.user._id)) return res.status(403).json({ message: "You can only view your own provider bookings." });
    } else {
      filter.clientId = req.user._id;
      if (requestedClientId && requestedClientId !== String(req.user._id)) return res.status(403).json({ message: "You can only view your own client bookings." });
    }
    await Booking.updateMany(
      mongoose.trusted({ ...filter, status: "cancel_requested", cancellationExpiresAt: mongoose.trusted({ $lte: new Date() }) }),
      { $set: { status: "canceled", cancellationResolvedAt: new Date() } }
    );
    const bookings = await Booking.find(filter).sort({ createdAt: -1 }).populate(populatePaths);
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
  const requestedStatus = String(req.body.status || "");
  const status = STATUS_ALIASES[requestedStatus] || requestedStatus;
  if (!mongoose.isValidObjectId(bookingId) || !STATUS_VALUES.has(status)) {
    return res.status(400).json({ message: "Choose a valid booking status." });
  }

  try {
    const filter = req.user.role === "provider"
      ? { _id: bookingId, providerId: req.user._id, status: mongoose.trusted({ $in: ["pending", "approved", "Pending Request", "Confirmed"] }) }
      : { _id: bookingId, clientId: req.user._id, status: mongoose.trusted({ $in: ["pending", "approved", "Pending Request", "Confirmed"] }) };
    if (req.user.role !== "provider" && status !== "canceled") {
      return res.status(403).json({ message: "Clients can only cancel active bookings." });
    }
    const booking = await Booking.findOneAndUpdate(filter, { status }, { new: true }).populate(populatePaths);
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

  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    const role = req.user.role === "provider" ? "provider" : "client";
    const isParticipant = String(booking[`${role}Id`]) === String(req.user._id);
    if (!isParticipant) return res.status(403).json({ message: "You can only manage cancellations for your bookings." });

    if (action === "request") {
      if (!["pending", "approved"].includes(booking.status)) return res.status(409).json({ message: "This booking is no longer active." });
      const withinGracePeriod = Date.now() - new Date(booking.createdAt).getTime() <= GRACE_PERIOD_MS;
      booking.cancellationReason = reason;
      booking.cancellationRequestedBy = role;
      booking.cancellationRequestedAt = new Date();
      booking.cancellationPreviousStatus = booking.status;
      if (withinGracePeriod) {
        booking.status = "canceled";
        booking.cancellationResolvedAt = new Date();
        booking.cancellationExpiresAt = undefined;
      } else {
        booking.status = "cancel_requested";
        booking.cancellationExpiresAt = new Date(Date.now() + cancellationResponseWindow(booking.serviceDate));
      }
    } else {
      if (booking.status !== "cancel_requested") return res.status(409).json({ message: "There is no pending cancellation request." });
      if (booking.cancellationRequestedBy === role) return res.status(403).json({ message: "The other booking participant must respond to this request." });
      if (booking.cancellationExpiresAt && booking.cancellationExpiresAt <= new Date()) {
        booking.status = "canceled";
        booking.cancellationResolvedAt = new Date();
      } else if (action === "approve") {
        booking.status = "canceled";
        booking.cancellationResolvedAt = new Date();
      } else {
        booking.status = booking.cancellationPreviousStatus || "approved";
        booking.cancellationResolvedAt = new Date();
      }
    }

    await booking.save();
    await booking.populate(populatePaths);
    return res.json({ booking: serializeBooking(booking) });
  } catch (error) {
    console.error("Cancellation error:", error);
    return res.status(500).json({ message: "Could not process the cancellation." });
  }
}

module.exports = { handleListBookings, handleCreateBooking, handleUpdateBookingStatus, handleCancellation };
