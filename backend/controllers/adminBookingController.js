const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const User = require("../models/User");
const { getBookingRequestExpiration } = require("../services/bookingLifecycle");

const PAGE_SIZE = 25;
const OVERRIDE_STATUSES = Object.freeze({
  pending: "pending",
  approved: "approved",
  in_progress: "in_progress",
  complete: "complete",
  settled: "settled",
  canceled: "canceled",
  declined: "declined",
  expired: "expired",
});

const STATUS_ALIASES = Object.freeze({
  pending: ["pending", "Pending Request"],
  approved: ["approved", "Confirmed"],
  in_progress: ["en_route", "in_progress", "On the Way", "In Progress"],
  complete: ["complete", "closed", "Completed"],
  settled: ["settled", "Settled"],
  canceled: ["canceled", "Cancelled"],
  declined: ["declined", "Declined", "Declined by Provider"],
  expired: ["expired", "Expired"],
});

const STATUS_LABELS = Object.freeze({
  pending: "Pending Request",
  approved: "Confirmed",
  en_route: "In Progress",
  in_progress: "In Progress",
  complete: "Completed",
  closed: "Completed",
  settled: "Settled",
  canceled: "Cancelled",
  declined: "Declined",
  expired: "Expired",
  cancel_requested: "Cancellation Requested",
  in_revision: "In Revision",
  disputed: "Disputed",
  "Pending Request": "Pending Request",
  Confirmed: "Confirmed",
  "On the Way": "In Progress",
  "In Progress": "In Progress",
  Completed: "Completed",
  Settled: "Settled",
  Cancelled: "Cancelled",
  Declined: "Declined",
  "Declined by Provider": "Declined",
  Expired: "Expired",
  "Cancellation Requested": "Cancellation Requested",
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function participant(user, fallback) {
  if (!user) return null;
  return {
    id: String(user._id),
    name: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || user.email || fallback,
    email: user.email || "",
    username: user.username || "",
    profileImage: user.profileImage || "",
    role: user.role,
  };
}

function serializeAdminBooking(booking) {
  const currentStatus = booking.status || "pending";
  const travelFeeBeforeDiscount = booking.travelFeeBeforeDiscount ?? booking.travelFee ?? 0;
  return {
    id: String(booking._id),
    task: booking.repairDescription || "Service request",
    status: currentStatus,
    statusLabel: STATUS_LABELS[currentStatus] || currentStatus,
    client: participant(booking.clientId, "Client"),
    provider: participant(booking.providerId, "Provider"),
    address: booking.address || "",
    serviceDate: booking.serviceDate || null,
    timeSlot: booking.timeSlot || "",
    createdAt: booking.createdAt || null,
    updatedAt: booking.updatedAt || null,
    photoUrl: booking.photoUrl || "",
    requestExpiresAt: booking.requestExpiresAt || null,
    urgency: booking.urgency || "Flexible",
    paymentMethod: booking.paymentMethod || "cash",
    offeredPrice: Number(booking.offeredPrice || 0),
    travelDistanceKm: booking.travelDistanceKm == null ? null : Number(booking.travelDistanceKm),
    travelBaseFee: booking.travelBaseFee == null ? null : Number(booking.travelBaseFee),
    travelFeePerKm: booking.travelFeePerKm == null ? null : Number(booking.travelFeePerKm),
    travelFee: Number(booking.travelFee || 0),
    travelFeeBeforeDiscount: Number(travelFeeBeforeDiscount),
    travelFeeDiscount: Number(booking.travelFeeDiscount || 0),
    tipAmount: Number(booking.tipAmount || 0),
    total: Number(booking.offeredPrice || 0) + Number(booking.travelFee || 0) + Number(booking.tipAmount || 0),
    workCompletedAt: booking.workCompletedAt || null,
    settledAt: booking.settledAt || null,
    cashPaidConfirmedAt: booking.cashPaidConfirmedAt || null,
    cashReceivedConfirmedAt: booking.cashReceivedConfirmedAt || null,
    clientConfirmedCash: booking.clientConfirmedCash === true,
    providerConfirmedCash: booking.providerConfirmedCash === true,
    cashReceipt: booking.cashReceipt ? {
      receiptNumber: booking.cashReceipt.receiptNumber || "",
      issuedAt: booking.cashReceipt.issuedAt || null,
      totalAmount: booking.cashReceipt.totalAmount == null ? null : Number(booking.cashReceipt.totalAmount),
    } : null,
    cancellationReason: booking.cancellationReason || "",
    cancellationRequestedAt: booking.cancellationRequestedAt || null,
    completionNote: booking.completionNote || "",
    completionPhotos: booking.completionPhotos || [],
    revisionRequests: (booking.revisionRequests || []).map((request) => ({
      requestedBy: participant(request.requestedBy, "Participant"),
      note: request.note || "",
      status: request.status || "open",
      responseNote: request.responseNote || "",
      createdAt: request.createdAt || null,
      respondedAt: request.respondedAt || null,
      photos: request.photos || [],
    })),
    providerUpdates: (booking.providerUpdates || []).map((update) => ({
      type: update.type,
      note: update.note || "",
      status: update.status || "",
      proposedServiceDate: update.proposedServiceDate || null,
      proposedTimeSlot: update.proposedTimeSlot || "",
      requestedAt: update.requestedAt || null,
      respondedAt: update.respondedAt || null,
    })),
    statusHistory: (booking.statusHistory || []).map((entry) => ({
      status: entry.status,
      label: STATUS_LABELS[entry.status] || entry.status,
      at: entry.at,
    })),
    adminOverrideHistory: (booking.adminOverrideHistory || []).map((entry) => ({
      adminEmail: entry.adminEmail,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      fromLabel: STATUS_LABELS[entry.fromStatus] || entry.fromStatus,
      toLabel: STATUS_LABELS[entry.toStatus] || entry.toStatus,
      reason: entry.reason,
      at: entry.at,
    })),
  };
}

async function handleGetAdminBookings(req, res) {
  try {
    const page = Math.min(10000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const search = String(req.query.q || "").trim().slice(0, 100);
    const status = String(req.query.status || "");
    const clauses = [];
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      const matchingUsers = await User.find({
        role: mongoose.trusted({ $in: ["client", "provider"] }),
        $or: [{ fullName: pattern }, { firstName: pattern }, { lastName: pattern }, { username: pattern }, { email: pattern }],
      }).select("_id role").lean();
      const terms = [
        { repairDescription: pattern },
        { clientId: mongoose.trusted({ $in: matchingUsers.filter((user) => user.role === "client").map((user) => user._id) }) },
        { providerId: mongoose.trusted({ $in: matchingUsers.filter((user) => user.role === "provider").map((user) => user._id) }) },
      ];
      if (mongoose.isValidObjectId(search)) terms.push({ _id: new mongoose.Types.ObjectId(search) });
      clauses.push({ $or: terms });
    }
    if (status) {
      clauses.push({ status: mongoose.trusted({ $in: STATUS_ALIASES[status] }) });
    }
    const filter = clauses.length ? { $and: clauses } : {};
    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("clientId", "fullName firstName lastName username email profileImage role")
        .populate("providerId", "fullName firstName lastName username email profileImage role")
        .populate("revisionRequests.requestedBy", "fullName firstName lastName username email")
        .lean(),
      Booking.countDocuments(filter),
    ]);
    return res.json({
      bookings: bookings.map(serializeAdminBooking),
      pagination: { page, pageSize: PAGE_SIZE, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    });
  } catch (error) {
    console.error("Admin booking list error:", error);
    return res.status(500).json({ message: "Could not load admin bookings." });
  }
}

async function handleOverrideAdminBooking(req, res) {
  const targetStatus = OVERRIDE_STATUSES[req.body?.status];
  const reason = String(req.body?.reason || "").trim();
  if (!targetStatus) return res.status(400).json({ message: "Choose a supported booking status." });
  if (reason.length < 5 || reason.length > 500) {
    return res.status(400).json({ message: "Enter an audit reason between 5 and 500 characters." });
  }

  try {
    const current = await Booking.findById(req.params.bookingId).select("status serviceDate");
    if (!current) return res.status(404).json({ message: "Booking not found." });

    const fromStatus = current.status || "pending";
    const now = new Date();
    const update = {
      $set: { status: targetStatus },
      $push: {
        statusHistory: { status: targetStatus, at: now },
        adminOverrideHistory: {
          adminEmail: req.adminEmail,
          fromStatus,
          toStatus: targetStatus,
          reason,
          at: now,
        },
      },
    };
    if (["complete", "settled"].includes(targetStatus)) {
      update.$set.workCompletedAt = now;
    }
    const unset = {};
    if (targetStatus === "settled") {
      update.$set.settledAt = now;
    } else {
      unset.settledAt = 1;
    }
    if (targetStatus === "pending") {
      const requestExpiresAt = getBookingRequestExpiration(current.serviceDate, now);
      if (requestExpiresAt) update.$set.requestExpiresAt = requestExpiresAt;
      else unset.requestExpiresAt = 1;
    } else {
      unset.requestExpiresAt = 1;
    }
    if (targetStatus !== "canceled") unset.cancellationReason = 1;
    if (Object.keys(unset).length) update.$unset = unset;
    if (targetStatus === "canceled") update.$set.cancellationReason = reason;

    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.bookingId, status: fromStatus },
      update,
      { new: true, runValidators: true }
    )
      .populate("clientId", "fullName firstName lastName username email profileImage role")
      .populate("providerId", "fullName firstName lastName username email profileImage role")
      .populate("revisionRequests.requestedBy", "fullName firstName lastName username email")
      .lean();
    if (!booking) {
      return res.status(409).json({ message: "This booking changed while you were reviewing it. Refresh and try again." });
    }
    return res.json({ booking: serializeAdminBooking(booking), message: "Booking status updated and audit note recorded." });
  } catch (error) {
    console.error("Admin booking override error:", error);
    return res.status(500).json({ message: "Could not update the booking status." });
  }
}

module.exports = { handleGetAdminBookings, handleOverrideAdminBooking };
