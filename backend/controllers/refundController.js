const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const RefundRequest = require("../models/Refund");
const User = require("../models/User");
const { appendBookingSystemMessage } = require("../services/bookingMessaging");
const { sendPushNotification } = require("../services/oneSignal");
const { notifyAdminEvent } = require("../services/adminNotifications");
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
const CASH_REPAYMENT_WINDOW_MS = 48 * 60 * 60 * 1000;
let isProcessingRefundRepaymentDeadlines = false;
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
    providerRepaymentDueAt: refund.providerRepaymentDueAt || null,
    providerMarkedSentAt: refund.providerMarkedSentAt || null,
    clientResponseDueAt: refund.clientResponseDueAt || null,
    clientConfirmedAt: refund.clientConfirmedAt || null,
    clientAutoConfirmedAt: refund.clientAutoConfirmedAt || null,
    clientReportedAt: refund.clientReportedAt || null,
    clientReportNote: refund.clientReportNote || "",
    providerSuspensionAppliedAt: refund.providerSuspensionAppliedAt || null,
    repaymentReviewedAt: refund.repaymentReviewedAt || null,
    repaymentReviewedBy: refund.repaymentReviewedBy || "",
    repaymentReviewNotes: refund.repaymentReviewNotes || "",
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
  if (options.roles?.includes("admin")) {
    try {
      await notifyAdminEvent(options);
    } catch (error) {
      console.error("Could not save admin refund notification:", error.message);
    }
    return;
  }

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
  if (action !== "REJECT") {
    try {
      const amountMessage = approvedCashAmount > 0
        ? `An admin approved a ₱${approvedCashAmount.toLocaleString("en-PH", { maximumFractionDigits: 2 })} direct cash repayment. The provider has 48 hours to return it; TaskPanda does not transfer cash.`
        : "An admin approved your voucher-only refund. No cash repayment is due.";
      await User.updateOne(
        {
          _id: booking.clientId,
          "refundNotifications.refundId": { $ne: String(refundId) },
        },
        {
          $push: {
            refundNotifications: {
              $each: [{
                refundId: String(refundId),
                title: approvedCashAmount > 0 ? "Refund approved — repayment due" : "Refund request approved",
                message: amountMessage,
                href: `/bookings?bookingId=${encodeURIComponent(bookingId)}`,
                createdAt: new Date(),
              }],
              $slice: -25,
            },
          },
        }
      );
    } catch (notificationError) {
      console.error("Refund approval in-app notification could not be saved:", notificationError);
    }
  }
  await Promise.all([
    sendRefundNotification({
      userIds: [String(booking.clientId)],
      title: action === "REJECT" ? "Refund request declined" : approvedCashAmount > 0 ? "Refund approved — repayment due" : "Refund request approved",
      body: action === "REJECT"
        ? "An admin reviewed and declined the refund request. Open the booking for the admin's note."
        : approvedCashAmount > 0
          ? `An admin approved a direct cash repayment of ₱${approvedCashAmount.toLocaleString("en-PH", { maximumFractionDigits: 2 })}. Your provider has 48 hours to return it.`
          : "An admin approved the voucher-only refund. No physical cash repayment is due.",
      url: `/bookings?bookingId=${encodeURIComponent(bookingId)}`,
      data: { event: action === "REJECT" ? "refund.resolved" : "refund.approved", refundId: String(refundId), bookingId, outcome: action },
    }),
    sendRefundNotification({
      userIds: [String(booking.providerId)],
      title: action === "REJECT" ? "Refund request declined" : approvedCashAmount > 0 ? "Cash repayment due within 48 hours" : "Refund request approved",
      body: action === "REJECT"
        ? "An admin reviewed and declined the refund request."
        : approvedCashAmount > 0
          ? `An admin approved a ₱${approvedCashAmount.toLocaleString("en-PH", { maximumFractionDigits: 2 })} direct repayment to the client. Mark it as sent within 48 hours; TaskPanda does not transfer cash.`
          : "An admin approved the voucher-only refund. No physical cash repayment is due.",
      url: `/provider-bookings?bookingId=${encodeURIComponent(bookingId)}`,
      data: { event: action === "REJECT" ? "refund.resolved" : "refund.approved", refundId: String(refundId), bookingId, outcome: action },
    }),
  ]);
  try {
    await appendBookingSystemMessage(
      booking,
      action === "REJECT"
        ? `An admin declined the refund request. Admin note: ${adminNotes}`
        : approvedCashAmount > 0
          ? `An admin approved a ₱${approvedCashAmount.toLocaleString("en-PH", { maximumFractionDigits: 2 })} direct repayment to the client. Mark it as sent within 48 hours; TaskPanda does not transfer or reverse cash.`
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

async function handleGetRefundNotifications(req, res) {
  try {
    const user = await User.findById(req.user._id).select("refundNotifications").lean();
    if (!user) return res.status(404).json({ message: "Account not found." });
    const notifications = (user.refundNotifications || [])
      .filter((notification) => !notification.readAt)
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .map((notification) => ({
        id: String(notification._id),
        title: notification.title,
        message: notification.message,
        href: notification.href,
        createdAt: notification.createdAt,
      }));
    return res.json({ notifications });
  } catch (error) {
    console.error("Get refund notifications error:", error);
    return res.status(500).json({ message: "Could not load refund notifications." });
  }
}

async function handleMarkRefundNotificationRead(req, res) {
  if (!mongoose.isValidObjectId(req.params.notificationId)) {
    return res.status(400).json({ message: "Choose a valid refund notification." });
  }
  try {
    const result = await User.updateOne(
      mongoose.trusted({
        _id: req.user._id,
        refundNotifications: mongoose.trusted({
          $elemMatch: { _id: new mongoose.Types.ObjectId(req.params.notificationId) },
        }),
      }),
      { $set: { "refundNotifications.$.readAt": new Date() } }
    );
    if (!result.matchedCount) return res.status(404).json({ message: "Refund notification not found." });
    return res.json({ success: true });
  } catch (error) {
    console.error("Mark refund notification read error:", error);
    return res.status(500).json({ message: "Could not update this refund notification." });
  }
}

function getApprovedBookingStatus(refund) {
  return refund.resolutionAction === "APPROVE_PARTIAL" ? "partially_refunded" : "refunded";
}

async function notifyRepaymentUpdate(refund, { title, body, event }) {
  const bookingId = String(refund.bookingId);
  const targets = [
    sendRefundNotification({
      userIds: [String(refund.clientId)],
      title,
      body,
      url: `/bookings?bookingId=${encodeURIComponent(bookingId)}`,
      data: { event, refundId: String(refund._id), bookingId },
    }),
    sendRefundNotification({
      userIds: [String(refund.providerId)],
      title,
      body,
      url: `/provider-bookings?bookingId=${encodeURIComponent(bookingId)}`,
      data: { event, refundId: String(refund._id), bookingId },
    }),
  ];
  if (["refund.repayment_reported", "refund.repayment_overdue"].includes(event)) {
    targets.push(sendRefundNotification({
      roles: ["admin"],
      title,
      body,
      url: `/admin?section=refunds&refundId=${encodeURIComponent(String(refund._id))}`,
      data: { event, refundId: String(refund._id), bookingId },
    }));
  }
  await Promise.all(targets);
}

async function getAuthorizedApprovedCashRefund(req, allowedRoles) {
  const refundId = String(req.params.refundId || "");
  if (!mongoose.isValidObjectId(refundId)) {
    return { response: { status: 400, body: { message: "Choose a valid refund request." } } };
  }
  if (!allowedRoles.includes(req.user?.role)) {
    return { response: { status: 403, body: { message: "You do not have permission to update this repayment." } } };
  }
  const refund = await RefundRequest.findById(refundId);
  if (!refund || refund.status !== "APPROVED") {
    return { response: { status: 404, body: { message: "Approved refund request not found." } } };
  }
  if (refund.cashRepaymentStatus === "not_required" || Number(refund.approvedCashAmount) <= 0) {
    return { response: { status: 409, body: { message: "This refund has no cash repayment due." } } };
  }
  const ownerId = req.user.role === "provider" ? refund.providerId : refund.clientId;
  if (String(ownerId) !== String(req.user._id)) {
    return { response: { status: 404, body: { message: "Approved refund request not found." } } };
  }
  return { refund };
}

async function handleMarkProviderRepaymentSent(req, res) {
  try {
    const authorized = await getAuthorizedApprovedCashRefund(req, ["provider"]);
    if (authorized.response) return res.status(authorized.response.status).json(authorized.response.body);
    const { refund } = authorized;
    if (refund.cashRepaymentStatus !== "due_provider_to_client") {
      return res.status(409).json({ message: "This repayment is no longer awaiting the provider's sent confirmation." });
    }
    const now = new Date();
    if (refund.providerRepaymentDueAt && refund.providerRepaymentDueAt <= now) {
      return res.status(409).json({ message: "The 48-hour repayment deadline has passed. Contact TaskPanda support to resolve the case." });
    }
    const clientResponseDueAt = new Date(now.getTime() + CASH_REPAYMENT_WINDOW_MS);
    const updatedRefund = await RefundRequest.findOneAndUpdate(
      {
        _id: refund._id,
        status: "APPROVED",
        cashRepaymentStatus: "due_provider_to_client",
        providerRepaymentDueAt: mongoose.trusted({ $gt: now }),
      },
      {
        $set: {
          cashRepaymentStatus: "provider_marked_sent",
          providerMarkedSentAt: now,
          clientResponseDueAt,
        },
      },
      { new: true }
    );
    if (!updatedRefund) return res.status(409).json({ message: "The repayment deadline passed or its status changed. Refresh and try again." });
    await Booking.updateOne(
      { _id: refund.bookingId, refundRequestId: refund._id, status: "refund_repayment_pending" },
      { $set: { refundStatus: "repayment_sent" } }
    );
    await notifyRepaymentUpdate(updatedRefund, {
      title: "Provider marked repayment sent",
      body: "Please confirm that you received the approved cash repayment or report that it has not arrived within 48 hours.",
      event: "refund.repayment_sent",
    });
    return res.json({ refund: serializeRefund(updatedRefund.toObject()) });
  } catch (error) {
    console.error("Provider repayment confirmation error:", error);
    return res.status(500).json({ message: "Could not record that the repayment was sent." });
  }
}

async function handleConfirmRefundReceived(req, res) {
  try {
    const authorized = await getAuthorizedApprovedCashRefund(req, ["client"]);
    if (authorized.response) return res.status(authorized.response.status).json(authorized.response.body);
    const { refund } = authorized;
    if (!["due_provider_to_client", "provider_marked_sent", "repayment_overdue"].includes(refund.cashRepaymentStatus)) {
      return res.status(409).json({ message: "This repayment is already under review or resolved." });
    }
    const now = new Date();
    const finalStatus = getApprovedBookingStatus(refund);
    const updatedRefund = await RefundRequest.findOneAndUpdate(
      {
        _id: refund._id,
        status: "APPROVED",
        cashRepaymentStatus: refund.cashRepaymentStatus,
      },
      { $set: { cashRepaymentStatus: "confirmed_received", clientConfirmedAt: now } },
      { new: true }
    );
    if (!updatedRefund) return res.status(409).json({ message: "The repayment status changed. Refresh and try again." });
    await Booking.updateOne(
      { _id: refund.bookingId, refundRequestId: refund._id, status: mongoose.trusted({ $in: ["refund_repayment_pending", "refund_repayment_overdue"] }) },
      {
        $set: { status: finalStatus, refundStatus: finalStatus },
        $push: { statusHistory: { status: finalStatus, at: now } },
      }
    );
    await notifyRepaymentUpdate(updatedRefund, {
      title: "Client confirmed repayment received",
      body: "The client confirmed receipt of the approved repayment. The refund case is closed.",
      event: "refund.repayment_confirmed",
    });
    return res.json({ refund: serializeRefund(updatedRefund.toObject()) });
  } catch (error) {
    console.error("Refund receipt confirmation error:", error);
    return res.status(500).json({ message: "Could not confirm receipt of the repayment." });
  }
}

async function handleReportRefundNotReceived(req, res) {
  const reportNote = String(req.body.reportNote || "").trim();
  if (reportNote.length < 5 || reportNote.length > 1000) {
    return res.status(400).json({ message: "Describe what happened in 5 to 1,000 characters." });
  }
  try {
    const authorized = await getAuthorizedApprovedCashRefund(req, ["client"]);
    if (authorized.response) return res.status(authorized.response.status).json(authorized.response.body);
    const { refund } = authorized;
    if (!["due_provider_to_client", "provider_marked_sent", "repayment_overdue"].includes(refund.cashRepaymentStatus)) {
      return res.status(409).json({ message: "This repayment is already under review or resolved." });
    }
    const now = new Date();
    const updatedRefund = await RefundRequest.findOneAndUpdate(
      {
        _id: refund._id,
        status: "APPROVED",
        cashRepaymentStatus: refund.cashRepaymentStatus,
      },
      {
        $set: {
          cashRepaymentStatus: "client_reported_missing",
          clientReportedAt: now,
          clientReportNote: reportNote,
        },
      },
      { new: true }
    );
    if (!updatedRefund) return res.status(409).json({ message: "The repayment status changed. Refresh and try again." });
    await Booking.updateOne(
      { _id: refund.bookingId, refundRequestId: refund._id, status: mongoose.trusted({ $in: ["refund_repayment_pending", "refund_repayment_overdue"] }) },
      {
        $set: { status: "refund_repayment_reported", refundStatus: "client_reported_missing" },
        $push: { statusHistory: { status: "refund_repayment_reported", at: now } },
      }
    );
    await notifyRepaymentUpdate(updatedRefund, {
      title: "Client reports repayment not received",
      body: "The client reported that the approved cash repayment has not arrived. An admin needs to review this case.",
      event: "refund.repayment_reported",
    });
    try {
      const booking = await Booking.findById(refund.bookingId);
      if (booking) {
        await appendBookingSystemMessage(
          booking,
          "The client reported that the approved direct cash repayment has not been received. The case is waiting for admin review.",
          req.user._id,
          "refund_repayment_reported",
          { refundId: String(refund._id), reportNote }
        );
      }
    } catch (messageError) {
      console.error("Refund repayment report chat update failed:", messageError);
    }
    return res.json({ refund: serializeRefund(updatedRefund.toObject()) });
  } catch (error) {
    console.error("Refund non-receipt report error:", error);
    return res.status(500).json({ message: "Could not submit the non-receipt report." });
  }
}

async function handleResolveRefundRepayment(req, res) {
  const action = String(req.body.action || "");
  const notes = String(req.body.notes || "").trim();
  if (!["CONFIRM_RECEIVED", "REOPEN_WINDOW", "LIFT_SUSPENSION"].includes(action)) {
    return res.status(400).json({ message: "Choose a valid repayment review action." });
  }
  if (notes.length < 5 || notes.length > 2000) {
    return res.status(400).json({ message: "Enter review notes between 5 and 2,000 characters." });
  }
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Choose a valid refund request." });
    const refund = await RefundRequest.findById(req.params.id);
    if (!refund || refund.status !== "APPROVED") return res.status(404).json({ message: "Approved refund request not found." });
    const isSuspensionRelease = action === "LIFT_SUSPENSION"
      && refund.cashRepaymentStatus === "confirmed_received"
      && refund.providerSuspensionAppliedAt;
    if (!isSuspensionRelease && !["client_reported_missing", "repayment_overdue"].includes(refund.cashRepaymentStatus)) {
      return res.status(409).json({ message: "This repayment is not awaiting admin review." });
    }
    const now = new Date();
    const reviewedBy = String(req.adminEmail || "").trim().toLowerCase();
    const finalStatus = getApprovedBookingStatus(refund);
    const updates = action === "CONFIRM_RECEIVED"
      ? {
        cashRepaymentStatus: "confirmed_received",
        clientConfirmedAt: now,
        repaymentReviewedAt: now,
        repaymentReviewedBy: reviewedBy,
        repaymentReviewNotes: notes,
      }
      : action === "REOPEN_WINDOW" ? {
        cashRepaymentStatus: "due_provider_to_client",
        providerRepaymentDueAt: new Date(now.getTime() + CASH_REPAYMENT_WINDOW_MS),
        providerMarkedSentAt: null,
        clientResponseDueAt: null,
        clientReportedAt: null,
        clientReportNote: "",
        repaymentReviewedAt: now,
        repaymentReviewedBy: reviewedBy,
        repaymentReviewNotes: notes,
      } : {
        repaymentReviewedAt: now,
        repaymentReviewedBy: reviewedBy,
        repaymentReviewNotes: notes,
      };
    const updatedRefund = await RefundRequest.findOneAndUpdate(
      { _id: refund._id, status: "APPROVED", cashRepaymentStatus: refund.cashRepaymentStatus },
      { $set: updates },
      { new: true }
    );
    if (!updatedRefund) return res.status(409).json({ message: "The repayment case changed. Refresh and try again." });
    if (action !== "LIFT_SUSPENSION") {
      const bookingStatus = action === "CONFIRM_RECEIVED" ? finalStatus : "refund_repayment_pending";
      const bookingRefundStatus = action === "CONFIRM_RECEIVED" ? finalStatus : "due_provider_to_client";
      await Booking.updateOne(
        { _id: refund.bookingId, refundRequestId: refund._id },
        {
          $set: { status: bookingStatus, refundStatus: bookingRefundStatus },
          $push: { statusHistory: { status: bookingStatus, at: now } },
        }
      );
    }
    const shouldLiftRefundSuspension = Boolean(refund.providerSuspensionAppliedAt)
      && ["CONFIRM_RECEIVED", "REOPEN_WINDOW", "LIFT_SUSPENSION"].includes(action);
    if (shouldLiftRefundSuspension) {
      await User.updateOne(
        { _id: refund.providerId, refundSuspensionId: refund._id, isSuspended: true },
        {
          $set: { isSuspended: false },
          $unset: { suspendedAt: 1, refundSuspensionId: 1 },
          $push: {
            adminActivity: {
              $each: [{ action: "unsuspended", actorEmail: reviewedBy, reason: `Refund repayment case ${refund._id} reviewed by admin.`, createdAt: now }],
              $slice: -50,
            },
          },
        }
      );
      await RefundRequest.updateOne(
        { _id: refund._id, cashRepaymentStatus: updatedRefund.cashRepaymentStatus },
        { $unset: { providerSuspensionAppliedAt: 1 } }
      );
    }
    await notifyRepaymentUpdate(updatedRefund, {
      title: action === "CONFIRM_RECEIVED" ? "Refund repayment case resolved" : action === "LIFT_SUSPENSION" ? "Provider suspension lifted" : "48-hour repayment window reopened",
      body: action === "CONFIRM_RECEIVED"
        ? "An admin reviewed the repayment case and marked it resolved."
        : action === "LIFT_SUSPENSION"
          ? "An admin reviewed the repayment and lifted the related provider suspension."
          : "An admin reviewed the report and reopened the provider repayment window for 48 hours.",
      event: "refund.repayment_reviewed",
      admin: false,
    });
    void logAuditAction(req, {
      category: "FINANCIAL",
      action: action === "CONFIRM_RECEIVED" ? "REFUND_REPAYMENT_CONFIRMED"
        : action === "LIFT_SUSPENSION" ? "REFUND_REPAYMENT_SUSPENSION_LIFTED"
          : "REFUND_REPAYMENT_REOPENED",
      targetResource: "Booking",
      targetId: refund.bookingId,
      details: `Admin ${action.toLowerCase().replaceAll("_", " ")} for refund ${refund._id}. ${notes}`,
    });
    return res.json({ refund: serializeRefund(updatedRefund.toObject()) });
  } catch (error) {
    console.error("Admin repayment review error:", error);
    return res.status(500).json({ message: "Could not resolve the repayment case." });
  }
}

async function processRefundRepaymentDeadlines(now = new Date()) {
  if (isProcessingRefundRepaymentDeadlines) return;
  isProcessingRefundRepaymentDeadlines = true;
  try {
    const expiredProviderDeadlines = await RefundRequest.find({
      status: "APPROVED",
      cashRepaymentStatus: "due_provider_to_client",
      providerRepaymentDueAt: mongoose.trusted({ $lte: now }),
    }).select("_id bookingId clientId providerId approvedCashAmount").limit(100).lean();

    for (const refund of expiredProviderDeadlines) {
      const claimed = await RefundRequest.findOneAndUpdate(
        {
          _id: refund._id,
          status: "APPROVED",
          cashRepaymentStatus: "due_provider_to_client",
          providerRepaymentDueAt: mongoose.trusted({ $lte: now }),
        },
        { $set: { cashRepaymentStatus: "repayment_overdue" } },
        { new: true }
      );
      if (!claimed) continue;
    }

    const overdueRepayments = await RefundRequest.find({
      status: "APPROVED",
      cashRepaymentStatus: mongoose.trusted({ $in: ["repayment_overdue", "client_reported_missing"] }),
      providerRepaymentDueAt: mongoose.trusted({ $lte: now }),
      providerSuspensionAppliedAt: mongoose.trusted({ $exists: false }),
    }).select("_id bookingId clientId providerId approvedCashAmount").limit(100).lean();
    for (const refund of overdueRepayments) {
      const suspendedAt = new Date(now);
      const marked = await RefundRequest.updateOne(
        {
          _id: refund._id,
          cashRepaymentStatus: mongoose.trusted({ $in: ["repayment_overdue", "client_reported_missing"] }),
          providerRepaymentDueAt: mongoose.trusted({ $lte: now }),
          providerSuspensionAppliedAt: mongoose.trusted({ $exists: false }),
        },
        { $set: { providerSuspensionAppliedAt: suspendedAt } }
      );
      if (!marked.modifiedCount) continue;

      try {
        if (refund.cashRepaymentStatus !== "client_reported_missing") {
          const bookingUpdate = await Booking.updateOne(
            {
              _id: refund.bookingId,
              refundRequestId: refund._id,
              status: mongoose.trusted({ $in: ["refund_repayment_pending", "refund_repayment_overdue"] }),
            },
            {
              $set: { status: "refund_repayment_overdue", refundStatus: "repayment_overdue" },
              $push: { statusHistory: { status: "refund_repayment_overdue", at: now } },
            }
          );
          if (!bookingUpdate.matchedCount) {
            console.warn(`Refund repayment ${refund._id} could not update its booking to overdue.`);
          }
        }
        const suspension = await User.updateOne(
          { _id: refund.providerId, role: "provider", isSuspended: mongoose.trusted({ $ne: true }) },
          {
            $set: { isSuspended: true, suspendedAt, refundSuspensionId: refund._id, accountTokens: [] },
            $push: {
              adminActivity: {
                $each: [{
                  action: "suspended",
                  actorEmail: "system",
                  reason: `Automatic suspension: provider did not mark refund repayment ${refund._id} as sent within 48 hours.`,
                  createdAt: suspendedAt,
                }],
                $slice: -50,
              },
            },
          }
        );
        if (!suspension.modifiedCount) {
          console.warn(`Refund repayment ${refund._id} is overdue; provider was already suspended or is unavailable.`);
        }
      } catch (error) {
        await RefundRequest.updateOne(
          { _id: refund._id, providerSuspensionAppliedAt: suspendedAt },
          { $unset: { providerSuspensionAppliedAt: 1 } }
        );
        throw error;
      }
      await notifyRepaymentUpdate(refund, {
        title: "Refund repayment overdue",
        body: "The provider did not mark the repayment as sent within 48 hours. The provider account has been suspended pending admin review.",
        event: "refund.repayment_overdue",
      });
    }

    const expiredClientResponseDeadlines = await RefundRequest.find({
      status: "APPROVED",
      cashRepaymentStatus: "provider_marked_sent",
      clientResponseDueAt: mongoose.trusted({ $lte: now }),
    }).select("_id bookingId clientId providerId resolutionAction").limit(100).lean();

    for (const refund of expiredClientResponseDeadlines) {
      const finalStatus = getApprovedBookingStatus(refund);
      const claimed = await RefundRequest.findOneAndUpdate(
        {
          _id: refund._id,
          status: "APPROVED",
          cashRepaymentStatus: "provider_marked_sent",
          clientResponseDueAt: mongoose.trusted({ $lte: now }),
        },
        {
          $set: {
            cashRepaymentStatus: "auto_confirmed",
            clientAutoConfirmedAt: now,
          },
        },
        { new: true }
      );
      if (!claimed) continue;
    }

    const autoConfirmedRefunds = await RefundRequest.find({
      status: "APPROVED",
      cashRepaymentStatus: "auto_confirmed",
      bookingClosureAppliedAt: mongoose.trusted({ $exists: false }),
    }).select("_id bookingId clientId providerId resolutionAction").limit(100).lean();
    for (const refund of autoConfirmedRefunds) {
      const finalStatus = getApprovedBookingStatus(refund);
      const bookingUpdate = await Booking.updateOne(
        {
          _id: refund.bookingId,
          refundRequestId: refund._id,
          status: mongoose.trusted({ $in: ["refund_repayment_pending", finalStatus] }),
        },
        {
          $set: { status: finalStatus, refundStatus: finalStatus },
          $push: { statusHistory: { status: finalStatus, at: now } },
        }
      );
      if (!bookingUpdate.matchedCount) {
        console.error(`Refund repayment ${refund._id} could not close its booking; it will be retried.`);
        continue;
      }
      await RefundRequest.updateOne(
        { _id: refund._id, cashRepaymentStatus: "auto_confirmed" },
        { $set: { bookingClosureAppliedAt: now } }
      );
      await notifyRepaymentUpdate(refund, {
        title: "Refund repayment auto-closed",
        body: "No response was received within 48 hours after the provider marked the repayment sent. The refund case has been closed.",
        event: "refund.repayment_auto_confirmed",
      });
    }
  } catch (error) {
    console.error("Refund repayment deadline processing failed:", error);
    throw error;
  } finally {
    isProcessingRefundRepaymentDeadlines = false;
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
    const nextBookingStatus = action === "REJECT"
      ? refund.bookingStatusBeforeRequest
      : approvedAmount > 0 ? "refund_repayment_pending" : decision.outcome;
    const nextRefundStatus = action === "REJECT"
      ? "rejected"
      : approvedAmount > 0 ? "due_provider_to_client" : decision.outcome;
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
            ...(approvedAmount > 0 ? {
              providerRepaymentDueAt: new Date((booking.updatedAt || new Date()).getTime() + CASH_REPAYMENT_WINDOW_MS),
            } : {}),
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
            ...(approvedAmount > 0 ? {
              providerRepaymentDueAt: new Date(updateAt.getTime() + CASH_REPAYMENT_WINDOW_MS),
            } : {}),
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
  handleGetRefundNotifications,
  handleMarkRefundNotificationRead,
  handleMarkProviderRepaymentSent,
  handleConfirmRefundReceived,
  handleReportRefundNotReceived,
  notifyRepaymentUpdate,
  handleResolveRefundRepayment,
  processRefundRepaymentDeadlines,
  handleResolveAdminRefund,
};
