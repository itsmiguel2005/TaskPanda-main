const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const RefundRequest = require("../models/Refund");
const User = require("../models/User");
const oneSignal = require("../services/oneSignal");
const bookingMessaging = require("../services/bookingMessaging");

const originals = {
  bookingFindOne: Booking.findOne,
  bookingFindOneAndUpdate: Booking.findOneAndUpdate,
  bookingUpdateOne: Booking.updateOne,
  refundCreate: RefundRequest.create,
  refundDeleteOne: RefundRequest.deleteOne,
  refundFindById: RefundRequest.findById,
  refundFindOneAndUpdate: RefundRequest.findOneAndUpdate,
  refundUpdateOne: RefundRequest.updateOne,
  userUpdateOne: User.updateOne,
  userExists: User.exists,
  sendPushNotification: oneSignal.sendPushNotification,
  appendBookingSystemMessage: bookingMessaging.appendBookingSystemMessage,
};

oneSignal.sendPushNotification = async () => null;
bookingMessaging.appendBookingSystemMessage = async () => null;
const { handleRequestRefund, handleResolveAdminRefund } = require("./refundController");

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
  RefundRequest.findById = originals.refundFindById;
  RefundRequest.findOneAndUpdate = originals.refundFindOneAndUpdate;
  RefundRequest.updateOne = originals.refundUpdateOne;
  User.updateOne = originals.userUpdateOne;
  User.exists = originals.userExists;
});

test.after(() => {
  oneSignal.sendPushNotification = originals.sendPushNotification;
  bookingMessaging.appendBookingSystemMessage = originals.appendBookingSystemMessage;
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
  assert.equal(bookingUpdate.$set.status, "partially_refunded");
  assert.equal(bookingUpdate.$set.isRefunded, true);
  assert.equal(bookingUpdate.$set.refundAmount, 120);
  assert.equal(refundUpdate.$set.cashRepaymentStatus, "due_provider_to_client");
  assert.equal(refundUpdate.$set.approvedCashAmount, 120);
  assert.equal(res.body.refund.status, "APPROVED");
});
