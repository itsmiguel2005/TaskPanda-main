const test = require("node:test");
const assert = require("node:assert/strict");
const Booking = require("../models/Booking");
const User = require("../models/User");
const { processExpiredBookingRequests } = require("./bookingController");

const originalFind = Booking.find;
const originalFindOneAndUpdate = Booking.findOneAndUpdate;
const originalBookingUpdateOne = Booking.updateOne;
const originalUpdateOne = User.updateOne;

test.afterEach(() => {
  Booking.find = originalFind;
  Booking.findOneAndUpdate = originalFindOneAndUpdate;
  Booking.updateOne = originalBookingUpdateOne;
  User.updateOne = originalUpdateOne;
});

test("expiring a pending booking restores its redeemed travel voucher", async () => {
  const bookingId = "64b000000000000000000001";
  const clientId = "64b000000000000000000002";
  const voucherId = "64b000000000000000000003";
  const voucher = { _id: voucherId, status: "redeemed", bookingId };
  const booking = { _id: bookingId, clientId, voucherId, status: "expired" };
  let expiryUpdated = false;
  let voucherRestored = false;
  let restorationRecorded = false;

  Booking.find = (filter) => {
    assert.equal(filter.$or[0].status.$in[0], "pending");
    assert.equal(filter.$or[1].voucherRestoredAt.$exists, false);
    return { select: async () => [{ _id: bookingId, clientId, voucherId, status: "pending" }] };
  };
  Booking.findOneAndUpdate = async (filter, update, options) => {
    assert.equal(String(filter._id), bookingId);
    assert.equal(update.$set.status, "expired");
    assert.equal(options.new, true);
    expiryUpdated = true;
    return booking;
  };
  User.updateOne = async (filter, update) => {
    assert.equal(String(filter._id), clientId);
    const match = filter.vouchers.$elemMatch;
    assert.equal(String(match._id), voucherId);
    assert.equal(match.status, "redeemed");
    assert.equal(String(match.bookingId), bookingId);
    assert.equal(update.$set["vouchers.$.status"], "active");
    assert.equal(update.$unset["vouchers.$.bookingId"], 1);
    assert.equal(update.$unset["vouchers.$.redeemedAt"], 1);
    voucher.status = "active";
    delete voucher.bookingId;
    voucherRestored = true;
    return { modifiedCount: 1 };
  };
  Booking.updateOne = async (filter, update) => {
    assert.equal(String(filter._id), bookingId);
    assert.equal(filter.status, "expired");
    assert.equal(filter.voucherRestoredAt.$exists, false);
    assert.ok(update.$set.voucherRestoredAt instanceof Date);
    restorationRecorded = true;
    return { modifiedCount: 1 };
  };

  assert.equal(await processExpiredBookingRequests(), 1);
  assert.equal(expiryUpdated, true);
  assert.equal(voucherRestored, true);
  assert.equal(restorationRecorded, true);
  assert.equal(voucher.status, "active");
  assert.equal(voucher.bookingId, undefined);
});

test("expiry processing recovers vouchers from bookings that already expired", async () => {
  const bookingId = "64b000000000000000000011";
  const clientId = "64b000000000000000000012";
  const voucherId = "64b000000000000000000013";
  const voucher = { _id: voucherId, status: "redeemed", bookingId };
  const booking = { _id: bookingId, clientId, voucherId, status: "expired" };
  let restorationRecorded = false;

  Booking.find = () => ({
    select: async () => [{ ...booking }],
  });
  Booking.findOneAndUpdate = async () => {
    throw new Error("Already-expired bookings must not be expired a second time.");
  };
  User.updateOne = async (filter, update) => {
    assert.equal(String(filter._id), clientId);
    assert.equal(filter.vouchers.$elemMatch.status, "redeemed");
    assert.equal(String(filter.vouchers.$elemMatch.bookingId), bookingId);
    assert.equal(update.$set["vouchers.$.status"], "active");
    voucher.status = "active";
    delete voucher.bookingId;
    return { modifiedCount: 1 };
  };
  Booking.updateOne = async (filter, update) => {
    assert.equal(String(filter._id), bookingId);
    assert.equal(update.$set.voucherRestoredAt instanceof Date, true);
    restorationRecorded = true;
    return { modifiedCount: 1 };
  };

  assert.equal(await processExpiredBookingRequests(), 0);
  assert.equal(voucher.status, "active");
  assert.equal(restorationRecorded, true);
});
