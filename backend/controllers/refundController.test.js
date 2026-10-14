const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const RefundRequest = require("../models/Refund");
const User = require("../models/User");
const oneSignal = require("../services/oneSignal");
const bookingMessaging = require("../services/bookingMessaging");
const auditLog = require("../utils/logAuditAction");

const originals = {
  bookingFindOne: Booking.findOne,
  bookingFindOneAndUpdate: Booking.findOneAndUpdate,
  bookingUpdateOne: Booking.updateOne,
  refundCreate: RefundRequest.create,
  refundDeleteOne: RefundRequest.deleteOne,
  refundFind: RefundRequest.find,
  refundFindById: RefundRequest.findById,
  refundFindOneAndUpdate: RefundRequest.findOneAndUpdate,
  refundUpdateOne: RefundRequest.updateOne,
  userUpdateOne: User.updateOne,
  userExists: User.exists,
  sendPushNotification: oneSignal.sendPushNotification,
  appendBookingSystemMessage: bookingMessaging.appendBookingSystemMessage,
  logAuditAction: auditLog.logAuditAction,
};

oneSignal.sendPushNotification = async () => null;
bookingMessaging.appendBookingSystemMessage = async () => null;
auditLog.logAuditAction = async () => null;
const {
  handleMarkProviderRepaymentSent,
  handleConfirmRefundReceived,
  handleRequestRefund,
  handleResolveAdminRefund,
  handleResolveRefundRepayment,
  processRefundRepaymentDeadlines,
} = require("./refundController");

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test.afterEach(() => {
  Booking.findOne = originals.bookingFindOne;
  Booking.findOneAndUpdate = originals.bookingFindOneAndUpdate;
  Booking.updateOne = originals.bookingUpdateOne;
  RefundRequest.create = originals.refundCreate;
  RefundRequest.deleteOne = originals.refundDeleteOne;
  RefundRequest.find = originals.refundFind;
  RefundRequest.findById = originals.refundFindById;
  RefundRequest.findOneAndUpdate = originals.refundFindOneAndUpdate;
  RefundRequest.updateOne = originals.refundUpdateOne;
  User.updateOne = originals.userUpdateOne;
  User.exists = originals.userExists;
});

test.after(() => {
  oneSignal.sendPushNotification = originals.sendPushNotification;
  bookingMessaging.appendBookingSystemMessage = originals.appendBookingSystemMessage;
  auditLog.logAuditAction = originals.logAuditAction;
});

test("refund requests are limited to the booking's client", async () => {
  const res = response();
  await handleRequestRefund({
    params: { id: new mongoose.Types.ObjectId().toString() },
    body: {},
    files: [],
    user: { role: "provider" },
  }, res);
  assert.equal(res.statusCode, 403);
});

test("refund requests reject bookings outside the completed/disputed/settled statuses", async () => {
  const booking = { status: "canceled" };
  Booking.findOne = async () => booking;
  const res = response();
  await handleRequestRefund({
    params: { id: new mongoose.Types.ObjectId().toString() },
    body: { reason: "OTHER", requestedAmount: 10, description: "Please review this." },
    files: [],
    user: { _id: new mongoose.Types.ObjectId(), role: "client" },
  }, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /completed, disputed, or settled/);
});

test("refund requests reject cash when the client has not confirmed paying it", async () => {
  Booking.findOne = async () => ({
    _id: new mongoose.Types.ObjectId(),
    clientId: new mongoose.Types.ObjectId(),
    status: "complete",
    workCompletedAt: new Date(),
    offeredPrice: 500,
    travelFee: 20,
    tipAmount: 0,
    cashPaidConfirmedAt: null,
    clientConfirmedCash: false,
    voucherId: null,
    travelFeeDiscount: 0,
  });
  const res = response();
  await handleRequestRefund({
    params: { id: new mongoose.Types.ObjectId().toString() },
    body: { reason: "POOR_QUALITY", requestedAmount: 100, description: "The service was incomplete." },
    files: [],
    user: { _id: new mongoose.Types.ObjectId(), role: "client" },
  }, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /Cash was not confirmed as paid/);
});

test("auto-settled voucher bookings can request voucher-only review without a cash refund", async () => {
  const bookingId = new mongoose.Types.ObjectId();
  const clientId = new mongoose.Types.ObjectId();
  const refundId = new mongoose.Types.ObjectId();
  const booking = {
    _id: bookingId,
    clientId,
    providerId: new mongoose.Types.ObjectId(),
    status: "settled",
    workCompletedAt: new Date(),
    offeredPrice: 500,
    travelFee: 0,
    travelFeeDiscount: 50,
    voucherId: new mongoose.Types.ObjectId(),
    cashPaidConfirmedAt: new Date(),
    clientConfirmedCash: true,
    cashPaidAutoConfirmed: true,
  };
  let createPayload;
  let bookingUpdate;
  Booking.findOne = async () => booking;
  RefundRequest.create = async (payload) => {
    createPayload = payload;
    return { ...payload, _id: refundId, toObject() { return { ...this }; } };
  };
  Booking.findOneAndUpdate = async (_filter, update) => {
    bookingUpdate = update;
    Object.assign(booking, update.$set);
    return booking;
  };
  const res = response();
  await handleRequestRefund({
    params: { id: String(bookingId) },
    body: { reason: "OTHER", requestedAmount: 0, description: "Please restore the travel voucher." },
    files: [],
    user: { _id: clientId, role: "client" },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(createPayload.cashPaidConfirmedAtRequest, false);
  assert.equal(createPayload.requestedCashAmount, 0);
  assert.equal(bookingUpdate.$set.status, "refund_pending");
  assert.equal(res.body.bookingStatus, "refund_pending");
});

test("admin partial resolution records a direct cash repayment without a platform transfer", async () => {
  const refundId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();
  const clientId = new mongoose.Types.ObjectId();
  const providerId = new mongoose.Types.ObjectId();
  const adminEmail = "admin@example.test";
  const refund = {
    _id: refundId,
    bookingId,
    clientId,
    providerId,
    requestedCashAmount: 400,
    bookingStatusBeforeRequest: "settled",
    cashPaidConfirmedAtRequest: true,
    status: "PENDING",
    resolutionLockAt: null,
    toObject() { return { ...this }; },
  };
  const booking = {
    _id: bookingId,
    refundRequestId: refundId,
    status: "refund_pending",
    refundStatus: "pending",
    clientId,
    providerId,
    offeredPrice: 500,
    travelFee: 20,
    tipAmount: 0,
    voucherId: null,
    travelFeeDiscount: 0,
  };
  let bookingUpdate;
  let refundUpdate;
  let clientNotificationUpdate;
  RefundRequest.findById = async () => refund;
  RefundRequest.findOneAndUpdate = async (_filter, update) => {
    if (!refundUpdate) {
      refundUpdate = update;
      Object.assign(refund, update.$set);
      return refund;
    }
    refundUpdate = update;
    Object.assign(refund, update.$set);
    return refund;
  };
  RefundRequest.updateOne = async () => ({ modifiedCount: 1 });
  User.updateOne = async (filter, update) => {
    if (filter._id.equals(clientId)) clientNotificationUpdate = { filter, update };
    return { matchedCount: 1, modifiedCount: 1 };
  };
  Booking.findOne = async () => booking;
  Booking.findOneAndUpdate = async (_filter, update) => {
    bookingUpdate = update;
    Object.assign(booking, update.$set);
    return booking;
  };
  const res = response();
  await handleResolveAdminRefund({
    params: { id: String(refundId) },
    body: { action: "APPROVE_PARTIAL", approvedCashAmount: 120, adminNotes: "Provider to return cash directly." },
    adminEmail,
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(bookingUpdate.$set.status, "refund_repayment_pending");
  assert.equal(bookingUpdate.$set.refundStatus, "due_provider_to_client");
  assert.equal(bookingUpdate.$set.isRefunded, true);
  assert.equal(bookingUpdate.$set.refundAmount, 120);
  assert.equal(refundUpdate.$set.cashRepaymentStatus, "due_provider_to_client");
  assert.equal(refundUpdate.$set.approvedCashAmount, 120);
  assert.equal(res.body.refund.status, "APPROVED");
  assert.deepEqual(clientNotificationUpdate.filter["refundNotifications.refundId"], { $ne: String(refundId) });
  assert.equal(clientNotificationUpdate.update.$push.refundNotifications.$each[0].refundId, String(refundId));
  assert.equal(clientNotificationUpdate.update.$push.refundNotifications.$each[0].title, "Refund approved — repayment due");
  assert.equal(clientNotificationUpdate.update.$push.refundNotifications.$each[0].href, `/bookings?bookingId=${bookingId}`);
});

test("provider repayment confirmation starts the client's 48-hour response window", async () => {
  const refundId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();
  const clientId = new mongoose.Types.ObjectId();
  const providerId = new mongoose.Types.ObjectId();
  const refund = {
    _id: refundId,
    bookingId,
    clientId,
    providerId,
    status: "APPROVED",
    approvedCashAmount: 120,
    cashRepaymentStatus: "due_provider_to_client",
    providerRepaymentDueAt: new Date(Date.now() + 60_000),
    toObject() { return { ...this }; },
  };
  let bookingUpdate;
  RefundRequest.findById = async () => refund;
  RefundRequest.findOneAndUpdate = async (_filter, update) => {
    Object.assign(refund, update.$set);
    return refund;
  };
  Booking.updateOne = async (_filter, update) => {
    bookingUpdate = update;
    return { matchedCount: 1 };
  };

  const res = response();
  await handleMarkProviderRepaymentSent({
    params: { refundId: String(refundId) },
    body: {},
    user: { _id: providerId, role: "provider" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(refund.cashRepaymentStatus, "provider_marked_sent");
  assert.ok(refund.clientResponseDueAt instanceof Date);
  assert.ok(refund.clientResponseDueAt.getTime() > Date.now());
  assert.equal(bookingUpdate.$set.refundStatus, "repayment_sent");
});

test("client confirmation closes an overdue refund repayment after confirming receipt", async () => {
  const refundId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();
  const clientId = new mongoose.Types.ObjectId();
  const providerId = new mongoose.Types.ObjectId();
  const refund = {
    _id: refundId,
    bookingId,
    clientId,
    providerId,
    status: "APPROVED",
    approvedCashAmount: 120,
    cashRepaymentStatus: "repayment_overdue",
    resolutionAction: "APPROVE_PARTIAL",
    toObject() { return { ...this }; },
  };
  let bookingUpdate;
  RefundRequest.findById = async () => refund;
  RefundRequest.findOneAndUpdate = async (_filter, update) => {
    Object.assign(refund, update.$set);
    return refund;
  };
  Booking.updateOne = async (_filter, update) => {
    bookingUpdate = update;
    return { matchedCount: 1 };
  };

  const res = response();
  await handleConfirmRefundReceived({
    params: { refundId: String(refundId) },
    body: {},
    user: { _id: clientId, role: "client" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(refund.cashRepaymentStatus, "confirmed_received");
  assert.equal(bookingUpdate.$set.status, "partially_refunded");
});

test("admin can lift only the suspension attributed to a resolved repayment", async () => {
  const refundId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();
  const providerId = new mongoose.Types.ObjectId();
  const refund = {
    _id: refundId,
    bookingId,
    providerId,
    status: "APPROVED",
    cashRepaymentStatus: "confirmed_received",
    providerSuspensionAppliedAt: new Date(),
    toObject() { return { ...this }; },
  };
  let userUpdate;
  let refundUpdate;
  RefundRequest.findById = async () => refund;
  RefundRequest.findOneAndUpdate = async (_filter, update) => {
    Object.assign(refund, update.$set);
    return refund;
  };
  RefundRequest.updateOne = async (_filter, update) => {
    refundUpdate = update;
    return { modifiedCount: 1 };
  };
  User.updateOne = async (filter, update) => {
    userUpdate = { filter, update };
    return { modifiedCount: 1 };
  };

  const res = response();
  await handleResolveRefundRepayment({
    params: { id: String(refundId) },
    body: { action: "LIFT_SUSPENSION", notes: "Client confirmation reviewed." },
    adminEmail: "admin@example.test",
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(userUpdate.filter.refundSuspensionId, refundId);
  assert.equal(userUpdate.update.$set.isSuspended, false);
  assert.equal(refundUpdate.$unset.providerSuspensionAppliedAt, 1);
});

test("expired provider repayment deadline marks the booking overdue and suspends the provider", async () => {
  const refund = {
    _id: new mongoose.Types.ObjectId(),
    bookingId: new mongoose.Types.ObjectId(),
    clientId: new mongoose.Types.ObjectId(),
    providerId: new mongoose.Types.ObjectId(),
    status: "APPROVED",
    approvedCashAmount: 120,
    cashRepaymentStatus: "due_provider_to_client",
    providerRepaymentDueAt: new Date(Date.now() - 1_000),
  };
  const booking = { status: "refund_repayment_pending" };
  let providerSuspension;
  RefundRequest.find = (filter) => {
    const results = filter.cashRepaymentStatus === "due_provider_to_client"
      || filter.providerSuspensionAppliedAt
      ? [refund]
      : [];
    return {
      select() { return this; },
      limit() { return this; },
      lean: async () => results,
    };
  };
  RefundRequest.findOneAndUpdate = async (_filter, update) => {
    Object.assign(refund, update.$set);
    return refund;
  };
  RefundRequest.updateOne = async (_filter, update) => {
    Object.assign(refund, update.$set || {});
    if (update.$unset) {
      for (const key of Object.keys(update.$unset)) delete refund[key];
    }
    return { modifiedCount: 1 };
  };
  Booking.updateOne = async (_filter, update) => {
    Object.assign(booking, update.$set);
    return { matchedCount: 1 };
  };
  User.updateOne = async (filter, update) => {
    if (update.$set?.refundSuspensionId) providerSuspension = { filter, update };
    return { modifiedCount: 1 };
  };

  await processRefundRepaymentDeadlines(new Date());

  assert.equal(refund.cashRepaymentStatus, "repayment_overdue");
  assert.equal(booking.status, "refund_repayment_overdue");
  assert.equal(providerSuspension.update.$set.isSuspended, true);
  assert.equal(providerSuspension.update.$set.refundSuspensionId, refund._id);
  assert.ok(refund.providerSuspensionAppliedAt instanceof Date);
});

test("expired client response window automatically closes the repayment", async () => {
  const refund = {
    _id: new mongoose.Types.ObjectId(),
    bookingId: new mongoose.Types.ObjectId(),
    clientId: new mongoose.Types.ObjectId(),
    providerId: new mongoose.Types.ObjectId(),
    status: "APPROVED",
    cashRepaymentStatus: "provider_marked_sent",
    clientResponseDueAt: new Date(Date.now() - 1_000),
    resolutionAction: "APPROVE_PARTIAL",
  };
  const booking = { status: "refund_repayment_pending" };
  RefundRequest.find = (filter) => {
    const results = ["provider_marked_sent", "auto_confirmed"].includes(filter.cashRepaymentStatus)
      ? [refund]
      : [];
    return {
      select() { return this; },
      limit() { return this; },
      lean: async () => results,
    };
  };
  RefundRequest.findOneAndUpdate = async (_filter, update) => {
    Object.assign(refund, update.$set);
    return refund;
  };
  RefundRequest.updateOne = async (_filter, update) => {
    Object.assign(refund, update.$set || {});
    if (update.$unset) {
      for (const key of Object.keys(update.$unset)) delete refund[key];
    }
    return { matchedCount: 1, modifiedCount: 1 };
  };
  Booking.updateOne = async (_filter, update) => {
    Object.assign(booking, update.$set);
    return { matchedCount: 1 };
  };

  await processRefundRepaymentDeadlines(new Date());

  assert.equal(refund.cashRepaymentStatus, "auto_confirmed");
  assert.equal(booking.status, "partially_refunded");
  assert.ok(refund.bookingClosureAppliedAt instanceof Date);
});
