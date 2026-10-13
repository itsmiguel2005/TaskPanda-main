const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const RefundRequest = require("../models/Refund");
const User = require("../models/User");
const { appendBookingSystemMessage } = require("../services/bookingMessaging");
const { sendPushNotification } = require("../services/oneSignal");
const { restoreVoucherForRefund } = require("../services/rewards");
const { calculateTotalPrice } = require("../services/bookingPricing");
const { logAuditAction } = require("../utils/logAuditAction");
const {
  getRefundDeadline,
  isRefundableBookingStatus,
  isCurrencyAmount,
  isWithinRefundWindow,
  wasCashPaidManuallyConfirmed,
  resolveRefundDecision,
} = require("../services/refundPolicy");

const REFUND_PAGE_SIZE = 25;
const RESOLUTION_LOCK_MS = 5 * 60 * 1000;
const BOOKING_STATUS_ALIASES = {
  completed: "complete",
  settled: "settled",
  disputed: "disputed",
  closed: "closed",
};

function normalizeRefundableStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return BOOKING_STATUS_ALIASES[status] || status;
}

function personName(person, fallback) {
  return person?.fullName
    || [person?.firstName, person?.lastName].filter(Boolean).join(" ")
    || person?.username
    || person?.email
    || fallback;
}

function serializeRefund(refund) {
  const booking = refund.bookingId && typeof refund.bookingId === "object" ? refund.bookingId : null;
  const client = refund.clientId && typeof refund.clientId === "object" ? refund.clientId : null;
  const provider = refund.providerId && typeof refund.providerId === "object" ? refund.providerId : null;
  return {
    id: String(refund._id),
    booking: booking ? {
      id: String(booking._id),
      task: booking.repairDescription || "Service booking",
      status: booking.status || "",
      serviceDate: booking.serviceDate || null,
      workCompletedAt: booking.workCompletedAt || booking.completionSubmittedAt || null,
      total: calculateTotalPrice(booking.offeredPrice || 0, booking.travelFee || 0, booking.tipAmount || 0),
      completionNote: booking.completionNote || "",
      completionPhotos: booking.completionPhotos || [],
      voucherId: booking.voucherId ? String(booking.voucherId) : null,
      travelFeeDiscount: Number(booking.travelFeeDiscount || 0),
    } : { id: String(refund.bookingId) },
    client: {
      id: String(client?._id || refund.clientId),
      name: personName(client, "Client"),
      email: client?.email || "",
    },
    provider: {
      id: String(provider?._id || refund.providerId),
      name: personName(provider, "Provider"),
      email: provider?.email || "",
    },
    reason: refund.reason,
    description: refund.description,
    proofPhotos: refund.proofPhotos || [],
    requestedCashAmount: Number(refund.requestedCashAmount || 0),
    approvedCashAmount: Number(refund.approvedCashAmount || 0),
    cashPaidConfirmedAtRequest: refund.cashPaidConfirmedAtRequest === true,
    bookingStatusBeforeRequest: refund.bookingStatusBeforeRequest,
    voucherRestored: refund.voucherRestored === true,
    cashRepaymentStatus: refund.cashRepaymentStatus || "not_required",
    resolutionAction: refund.resolutionAction || "",
    status: refund.status,
    adminNotes: refund.adminNotes || "",
    resolvedBy: refund.resolvedBy || "",
    resolvedAt: refund.resolvedAt || null,
    createdAt: refund.createdAt || null,
    updatedAt: refund.updatedAt || null,
  };
}

async function sendRefundNotification(options) {
  try {
    await sendPushNotification(options);
  } catch (error) {
    console.warn("Refund notification delivery failed:", error.message);
  }
}

async function handleRequestRefund(req, res) {
  if (req.user.role !== "client") {
    return res.status(403).json({ message: "Only the client can request a refund." });
  }

  const bookingId = String(req.params.id || "");
  const reason = String(req.body.reason || "");
  const description = String(req.body.description || "").trim();
  const requestedCashAmount = Number(req.body.requestedAmount);
  const proofPhotos = (Array.isArray(req.files) ? req.files : []).map((file) => `/uploads/${file.filename}`);
  if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: "Choose a valid booking." });
  if (!["INCOMPLETE_WORK", "POOR_QUALITY", "OVERCHARGED", "OTHER"].includes(reason)) {
    return res.status(400).json({ message: "Choose a valid refund reason." });
  }
  if (!description || description.length > 2000) {
    return res.status(400).json({ message: "Describe the refund issue in 1 to 2,000 characters." });
  }
  if (!isCurrencyAmount(requestedCashAmount)) {
    return res.status(400).json({ message: "Enter a non-negative cash refund amount with no more than two decimal places." });
  }

  let createdRefundId;
  let bookingMovedToPending = false;
  try {
    const booking = await Booking.findOne({ _id: bookingId, clientId: req.user._id });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    const bookingStatus = normalizeRefundableStatus(booking.status);
    if (!isRefundableBookingStatus(bookingStatus)) {
      return res.status(409).json({ message: "A refund can only be requested for a completed, disputed, or settled booking." });
    }
    if (!isWithinRefundWindow(booking)) {
      const deadline = getRefundDeadline(booking);
      return res.status(409).json({
        message: deadline
          ? "The 48-hour refund request window has expired."
          : "This booking has no recorded completion time and cannot be checked for refund eligibility.",
      });
    }

    const total = calculateTotalPrice(booking.offeredPrice || 0, booking.travelFee || 0, booking.tipAmount || 0);
    if (requestedCashAmount > total) {
      return res.status(400).json({ message: "The requested cash refund cannot exceed the booking total." });
    }
    const cashPaidConfirmed = wasCashPaidManuallyConfirmed(booking);
    const hasRedeemedTravelVoucher = Boolean(booking.voucherId && Number(booking.travelFeeDiscount || 0) > 0);
    if (!cashPaidConfirmed && requestedCashAmount > 0) {
      return res.status(409).json({ message: "Cash was not confirmed as paid, so only restoration of a used travel-fee voucher can be requested." });
    }
    if (requestedCashAmount === 0 && !hasRedeemedTravelVoucher) {
      return res.status(400).json({ message: "Enter a cash amount greater than zero unless this booking used a travel-fee voucher." });
    }

    const refund = await RefundRequest.create({
      bookingId: booking._id,
      clientId: booking.clientId,
      providerId: booking.providerId,
      reason,
      description,
      proofPhotos,
      requestedCashAmount,
      bookingStatusBeforeRequest: bookingStatus,
      cashPaidConfirmedAtRequest: cashPaidConfirmed,
    });
    createdRefundId = refund._id;
    const updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        clientId: req.user._id,
        status: booking.status,
        $or: [
          { refundStatus: mongoose.trusted({ $in: ["none", "rejected"] }) },
          { refundStatus: mongoose.trusted({ $exists: false }) },
        ],
      },
      {
        $set: {
          status: "refund_pending",
          refundRequestId: refund._id,
          previousRefundableStatus: bookingStatus,
          refundStatus: "pending",
        },
        $push: { statusHistory: { status: "refund_pending", at: new Date() } },
      },
      { new: true, runValidators: true }
    );
    if (!updatedBooking) {
      await RefundRequest.deleteOne({ _id: refund._id });
      createdRefundId = undefined;
      return res.status(409).json({ message: "This booking changed or already has an unresolved refund request. Refresh and try again." });
    }
    bookingMovedToPending = true;

    const bookingIdValue = String(booking._id);
    await Promise.all([
      sendRefundNotification({
        roles: ["admin"],
        title: "Refund request needs review",
        body: `A client requested a refund for ${booking.repairDescription || "a completed booking"}.`,
        url: `/admin?section=refunds&refundId=${encodeURIComponent(String(refund._id))}`,
        data: { event: "refund.requested", refundId: String(refund._id), bookingId: bookingIdValue },
      }),
      sendRefundNotification({
        userIds: [String(booking.providerId)],
        title: "Refund request received",
        body: "The client requested a refund. An admin will review the request.",
        url: `/provider-bookings?bookingId=${encodeURIComponent(bookingIdValue)}`,
        data: { event: "refund.requested", refundId: String(refund._id), bookingId: bookingIdValue },
      }),
    ]);
    try {
      await appendBookingSystemMessage(
        updatedBooking,
        "The client submitted a refund request. An admin will review the details; any cash repayment, if approved, is handled directly between the provider and client.",
        req.user._id,
        "refund_request",
        { refundId: String(refund._id), reason, requestedCashAmount }
      );
    } catch (messageError) {
      console.error("Refund request booking message error:", messageError);
    }

    return res.status(201).json({
      refund: serializeRefund({ ...refund.toObject(), bookingId: updatedBooking }),
      bookingStatus: "refund_pending",
    });
  } catch (error) {
    if (createdRefundId && !bookingMovedToPending) {
      try {
        await RefundRequest.deleteOne({ _id: createdRefundId, status: "PENDING" });
      } catch (cleanupError) {
        console.error("Unlinked refund request cleanup failed:", cleanupError);
      }
    }
    console.error("Refund request creation failed:", error);
    return res.status(500).json({ message: "Could not submit the refund request." });
  }
}

async function handleListAdminRefunds(req, res) {
  const requestedStatus = String(req.query.status || "PENDING").toUpperCase();
  const page = Math.min(10000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
  if (!["PENDING", "APPROVED", "REJECTED", "ALL"].includes(requestedStatus)) {
    return res.status(400).json({ message: "Choose a valid refund status filter." });
  }

  try {
    const filter = requestedStatus === "ALL" ? {} : { status: requestedStatus };
    const [refunds, total] = await Promise.all([
      RefundRequest.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * REFUND_PAGE_SIZE)
        .limit(REFUND_PAGE_SIZE)
        .populate("bookingId", "repairDescription status serviceDate offeredPrice travelFee tipAmount workCompletedAt completionSubmittedAt completionNote completionPhotos voucherId travelFeeDiscount")
        .populate("clientId", "fullName firstName lastName username email")
        .populate("providerId", "fullName firstName lastName username email")
        .lean(),
      RefundRequest.countDocuments(filter),
    ]);
    return res.json({
      refunds: refunds.map(serializeRefund),
      pagination: {
        page,
        pageSize: REFUND_PAGE_SIZE,
        total,
        pages: Math.max(1, Math.ceil(total / REFUND_PAGE_SIZE)),
      },
    });
  } catch (error) {
    console.error("Admin refund list lookup failed:", error);
    return res.status(500).json({ message: "Could not load refund requests." });
  }
}

async function releaseResolutionLock(refundId, adminEmail, preserveDecision = false) {
  const unset = {
    resolutionLockAt: 1,
    resolutionLockBy: 1,
  };
  if (!preserveDecision) {
    unset.resolutionLockAction = 1;
    unset.resolutionLockAmount = 1;
  }
  await RefundRequest.updateOne(
    { _id: refundId, status: "PENDING", resolutionLockBy: adminEmail },
    { $unset: unset }
  );
}

async function rollbackBookingResolution(booking, refund, finalStatus, resolvedAt) {
  const update = {
    $set: { status: "refund_pending", refundStatus: "pending", isRefunded: false, refundAmount: 0 },
    $unset: { previousRefundableStatus: 1 },
    $pull: { statusHistory: { status: finalStatus, at: resolvedAt } },
    $push: { statusHistory: { status: "refund_pending", at: new Date() } },
  };
  const result = await Booking.updateOne(
    { _id: booking._id, refundRequestId: refund._id, status: finalStatus },
    update
  );
  if (result.modifiedCount !== 1) {
    throw new Error("The booking could not be returned to refund review after a failed resolution.");
  }
}

async function notifyRefundResolution({ booking, refundId, action, approvedCashAmount, voucherRestored, adminNotes }) {
  const bookingId = String(booking._id);
  await Promise.all([
    sendRefundNotification({
      userIds: [String(booking.clientId)],
      title: action === "REJECT" ? "Refund request declined" : "Refund request resolved",
      body: action === "REJECT"
        ? "An admin reviewed and declined the refund request. Open the booking for the admin's note."
        : approvedCashAmount > 0
          ? `An admin agreed to a cash repayment of ₱${approvedCashAmount.toLocaleString("en-PH", { maximumFractionDigits: 2 })} from the provider directly to you.`
          : "An admin approved the voucher-only refund. No physical cash repayment is due.",
      url: `/bookings?bookingId=${encodeURIComponent(bookingId)}`,
      data: { event: "refund.resolved", refundId: String(refundId), bookingId, outcome: action },
    }),
    sendRefundNotification({
      userIds: [String(booking.providerId)],
      title: action === "REJECT" ? "Refund request declined" : "Refund request resolved",
      body: action === "REJECT"
        ? "An admin reviewed and declined the refund request."
        : approvedCashAmount > 0
          ? `An admin recorded a ₱${approvedCashAmount.toLocaleString("en-PH", { maximumFractionDigits: 2 })} cash repayment obligation for you to return directly to the client.`
          : "An admin approved the voucher-only refund. No physical cash repayment is due.",
      url: `/provider-bookings?bookingId=${encodeURIComponent(bookingId)}`,
      data: { event: "refund.resolved", refundId: String(refundId), bookingId, outcome: action },
    }),
  ]);
  try {
    await appendBookingSystemMessage(
      booking,
      action === "REJECT"
        ? `An admin declined the refund request. Admin note: ${adminNotes}`
        : approvedCashAmount > 0
          ? `An admin agreed that the provider must return ₱${approvedCashAmount.toLocaleString("en-PH", { maximumFractionDigits: 2 })} directly to the client. This is a recorded obligation; TaskPanda does not transfer or reverse cash.`
          : voucherRestored
            ? "An admin approved the refund by restoring the used travel-fee voucher. No physical cash repayment is due."
            : "An admin approved the refund. No physical cash repayment is due.",
      booking.providerId,
      "refund_resolution",
      { refundId: String(refundId), action, approvedCashAmount, voucherRestored, adminNotes }
    );
  } catch (messageError) {
    console.error("Refund resolution booking message error:", messageError);
  }
}

async function handleResolveAdminRefund(req, res) {
  const refundId = String(req.params.id || "");
  const action = String(req.body.action || "");
  const adminNotes = String(req.body.adminNotes || "").trim();
  const rawApprovedAmount = req.body.approvedCashAmount;
  const approvedCashAmount = rawApprovedAmount === undefined || rawApprovedAmount === ""
    ? undefined
    : Number(rawApprovedAmount);
  if (!mongoose.isValidObjectId(refundId)) return res.status(400).json({ message: "Choose a valid refund request." });
  if (!["APPROVE_FULL", "APPROVE_PARTIAL", "REJECT"].includes(action)) {
    return res.status(400).json({ message: "Choose a valid refund resolution." });
  }
  if (adminNotes.length > 2000 || (action === "REJECT" && adminNotes.length < 5)) {
    return res.status(400).json({
      message: action === "REJECT"
        ? "Enter an admin justification between 5 and 2,000 characters."
        : "Admin notes must be 2,000 characters or fewer.",
    });
  }

  try {
    const existing = await RefundRequest.findById(refundId);
    if (!existing) return res.status(404).json({ message: "Refund request not found." });
    if (existing.status !== "PENDING") return res.status(409).json({ message: "This refund request has already been resolved." });

    const lockIsActive = existing.resolutionLockAt
      && existing.resolutionLockAt.getTime() > Date.now() - RESOLUTION_LOCK_MS;
    if (lockIsActive) {
      return res.status(409).json({ message: "Another admin is currently resolving this request. Refresh and try again." });
    }
    if (existing.resolutionLockAction
      && (existing.resolutionLockAction !== action
        || Number(existing.resolutionLockAmount ?? 0) !== Number(approvedCashAmount ?? 0))) {
      return res.status(409).json({ message: "A previous resolution attempt was interrupted. Retry it with the same action and cash amount." });
    }

    const decision = resolveRefundDecision({
      action,
      requestedCashAmount: existing.requestedCashAmount,
      approvedCashAmount: action === "REJECT" ? 0 : approvedCashAmount,
    });
    if (!decision.valid) return res.status(400).json({ message: decision.message });
    const adminEmail = String(req.adminEmail || "").trim().toLowerCase();
    const now = new Date();
    const refund = await RefundRequest.findOneAndUpdate(
      {
        _id: refundId,
        status: "PENDING",
        $or: [
          { resolutionLockAt: null },
          { resolutionLockAt: mongoose.trusted({ $lte: new Date(now.getTime() - RESOLUTION_LOCK_MS) }) },
        ],
      },
      {
        $set: {
          resolutionLockAt: now,
          resolutionLockBy: adminEmail,
          resolutionLockAction: action,
          resolutionLockAmount: Number(approvedCashAmount || 0),
        },
      },
      { new: true }
    );
    if (!refund) return res.status(409).json({ message: "This refund request changed while you were reviewing it. Refresh and try again." });

    const booking = await Booking.findOne({ _id: refund.bookingId });
    if (!booking || String(booking.refundRequestId || "") !== String(refund._id)) {
      await releaseResolutionLock(refund._id, adminEmail);
      return res.status(409).json({ message: "The booking no longer matches this pending refund request. Review its current status." });
    }

    const cashPaid = refund.cashPaidConfirmedAtRequest === true;
    const approvedAmount = action === "REJECT" ? 0 : Number(approvedCashAmount);
    const hasVoucherToRestore = Boolean(booking.voucherId && Number(booking.travelFeeDiscount || 0) > 0);
    const nextBookingStatus = action === "REJECT" ? refund.bookingStatusBeforeRequest : decision.outcome;
    const nextRefundStatus = action === "REJECT" ? "rejected" : decision.outcome;
    if (action !== "REJECT" && approvedAmount > 0 && !cashPaid) {
      await releaseResolutionLock(refund._id, adminEmail);
      return res.status(409).json({ message: "Cash was not confirmed as paid. This request can only restore an eligible travel-fee voucher." });
    }
    if (action !== "REJECT" && approvedAmount === 0 && !hasVoucherToRestore) {
      await releaseResolutionLock(refund._id, adminEmail);
      return res.status(409).json({ message: "There is no confirmed cash payment or used travel-fee voucher to refund." });
    }

    if (booking.status !== "refund_pending") {
      if (booking.status !== nextBookingStatus || booking.refundStatus !== nextRefundStatus) {
        await releaseResolutionLock(refund._id, adminEmail);
        return res.status(409).json({ message: "The booking no longer matches this refund resolution. Review its current status." });
      }
      let voucherRestored = refund.voucherRestored === true;
      if (action !== "REJECT" && hasVoucherToRestore) {
        voucherRestored = await restoreVoucherForRefund(booking);
      }
      const resolvedRefund = await RefundRequest.findOneAndUpdate(
        { _id: refund._id, status: "PENDING", resolutionLockBy: adminEmail },
        {
          $set: {
            status: action === "REJECT" ? "REJECTED" : "APPROVED",
            approvedCashAmount: approvedAmount,
            voucherRestored,
            cashRepaymentStatus: approvedAmount > 0 ? "due_provider_to_client" : "not_required",
            resolutionAction: action,
            adminNotes,
            resolvedBy: adminEmail,
            resolvedAt: booking.updatedAt || new Date(),
          },
          $unset: {
            resolutionLockAt: 1,
            resolutionLockBy: 1,
            resolutionLockAction: 1,
            resolutionLockAmount: 1,
          },
        },
        { new: true }
      );
      if (!resolvedRefund) throw new Error("The interrupted refund resolution could not be finalized.");
      await notifyRefundResolution({
        booking,
        refundId: refund._id,
        action,
        approvedCashAmount: approvedAmount,
        voucherRestored,
        adminNotes,
      });
      if (action !== "REJECT") {
        void logAuditAction(req, {
          category: "FINANCIAL",
          action: "REFUND_ISSUED",
          targetResource: "Booking",
          targetId: booking._id,
          details: `Refund approved for booking ${booking._id}: PHP ${approvedAmount.toFixed(2)} (refund ${refund._id}).`,
        });
      }
      return res.json({ refund: serializeRefund({ ...resolvedRefund.toObject(), bookingId: booking }) });
    }

    const updateAt = new Date();
    const updatedBooking = await Booking.findOneAndUpdate(
      { _id: booking._id, refundRequestId: refund._id, status: "refund_pending" },
      {
        $set: {
          status: nextBookingStatus,
          refundStatus: nextRefundStatus,
          isRefunded: action !== "REJECT",
          refundAmount: approvedAmount,
        },
        $unset: { previousRefundableStatus: 1 },
        $push: { statusHistory: { status: nextBookingStatus, at: updateAt } },
      },
      { new: true, runValidators: true }
    );
    if (!updatedBooking) {
      await releaseResolutionLock(refund._id, adminEmail);
      return res.status(409).json({ message: "The booking changed before the refund could be resolved. Refresh and try again." });
    }

    let voucherRestored = false;
    try {
      if (action !== "REJECT" && hasVoucherToRestore) {
        voucherRestored = await restoreVoucherForRefund(booking);
      }
      if (action !== "REJECT" && approvedAmount === 0 && !voucherRestored) {
        throw new Error("The voucher-only refund could not be completed because its voucher was not available.");
      }
      const resolvedRefund = await RefundRequest.findOneAndUpdate(
        { _id: refund._id, status: "PENDING", resolutionLockBy: adminEmail },
        {
          $set: {
            status: action === "REJECT" ? "REJECTED" : "APPROVED",
            approvedCashAmount: approvedAmount,
            voucherRestored,
            cashRepaymentStatus: approvedAmount > 0 ? "due_provider_to_client" : "not_required",
            resolutionAction: action,
            adminNotes,
            resolvedBy: adminEmail,
            resolvedAt: updateAt,
          },
          $unset: {
            resolutionLockAt: 1,
            resolutionLockBy: 1,
            resolutionLockAction: 1,
            resolutionLockAmount: 1,
          },
        },
        { new: true }
      );
      if (!resolvedRefund) throw new Error("The refund request could not be marked resolved.");

      await notifyRefundResolution({
        booking: updatedBooking,
        refundId: refund._id,
        action,
        approvedCashAmount: approvedAmount,
        voucherRestored,
        adminNotes,
      });
      if (action !== "REJECT") {
        void logAuditAction(req, {
          category: "FINANCIAL",
          action: "REFUND_ISSUED",
          targetResource: "Booking",
          targetId: updatedBooking._id,
          details: `Refund approved for booking ${updatedBooking._id}: PHP ${approvedAmount.toFixed(2)} (refund ${refund._id}).`,
        });
      }
      return res.json({ refund: serializeRefund({ ...resolvedRefund.toObject(), bookingId: updatedBooking }) });
    } catch (resolutionError) {
      try {
        await rollbackBookingResolution(booking, refund, nextBookingStatus, updateAt);
      } catch (rollbackError) {
        console.error("Refund resolution booking rollback failed:", rollbackError);
      }
      await releaseResolutionLock(refund._id, adminEmail, true);
      throw resolutionError;
    }
  } catch (error) {
    console.error("Admin refund resolution failed:", error);
    return res.status(500).json({ message: "Could not resolve the refund request. Refresh before retrying." });
  }
}

module.exports = {
  REFUND_PAGE_SIZE,
  normalizeRefundableStatus,
  serializeRefund,
  handleRequestRefund,
  handleListAdminRefunds,
  handleResolveAdminRefund,
};
