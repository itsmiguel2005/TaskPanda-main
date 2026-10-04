const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const User = require("../models/User");
const {
  awardVerificationVoucher,
  restoreVoucherForBooking,
} = require("./rewards");

test("verification reward awards one active voucher and notification to a verified client", async () => {
  const clientId = new mongoose.Types.ObjectId();
  const originalUpdateOne = User.updateOne;
  let awarded = false;
  let updateCalls = 0;

  User.updateOne = async (filter, update) => {
    updateCalls += 1;
    assert.equal(String(filter._id), String(clientId));
    assert.equal(filter.role, "client");
    assert.equal(filter.isVerified, true);
    assert.equal(filter.verificationStatus, "verified");
    assert.equal(filter.verificationVoucherAwarded.$ne, true);
    assert.equal(update.$set.verificationVoucherAwarded, true);
    assert.equal(update.$push.vouchers.kind, "promotion");
    assert.equal(update.$push.vouchers.origin, "promotion");
    assert.equal(update.$push.vouchers.amount, 50);
    assert.equal(update.$push.vouchers.status, "active");
    assert.match(update.$push.vouchers.title, /Identity verified/);
    assert.equal(update.$push.rewardNotifications.$each.length, 1);
    assert.match(update.$push.rewardNotifications.$each[0].message, /₱50 travel-fee voucher/);

    if (awarded) return { modifiedCount: 0 };
    awarded = true;
    return { modifiedCount: 1 };
  };

  try {
    assert.equal(await awardVerificationVoucher(clientId), true);
    assert.equal(await awardVerificationVoucher(clientId), false);
    assert.equal(updateCalls, 2);
  } finally {
    User.updateOne = originalUpdateOne;
  }
});

test("voucher restoration is atomic and only restores its redeemed booking once", async () => {
  const clientId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();
  const voucherId = new mongoose.Types.ObjectId();
  const voucher = {
    _id: voucherId,
    status: "redeemed",
    bookingId,
    redeemedAt: new Date(),
  };
  const originalUpdateOne = User.updateOne;
  let updateCalls = 0;

  User.updateOne = async (filter, update) => {
    updateCalls += 1;
    const match = filter.vouchers.$elemMatch;
    assert.equal(String(filter._id), String(clientId));
    assert.equal(String(match._id), String(voucherId));
    assert.equal(match.status, "redeemed");
    assert.equal(String(match.bookingId), String(bookingId));
    assert.deepEqual(update, {
      $set: { "vouchers.$.status": "active" },
      $unset: {
        "vouchers.$.bookingId": 1,
        "vouchers.$.redeemedAt": 1,
      },
    });

    if (String(voucher._id) !== String(match._id) ||
      voucher.status !== match.status ||
      String(voucher.bookingId) !== String(match.bookingId)) {
      return { modifiedCount: 0 };
    }

    voucher.status = "active";
    delete voucher.bookingId;
    delete voucher.redeemedAt;
    return { modifiedCount: 1 };
  };

  try {
    const booking = { _id: bookingId, clientId, voucherId };
    assert.equal(await restoreVoucherForBooking(booking), true);
    assert.equal(await restoreVoucherForBooking(booking), false);
    assert.equal(updateCalls, 2);
    assert.equal(voucher.status, "active");
    assert.equal(voucher.bookingId, undefined);
    assert.equal(voucher.redeemedAt, undefined);
  } finally {
    User.updateOne = originalUpdateOne;
  }
});

test("voucher restoration skips bookings that did not use a voucher", async () => {
  const originalUpdateOne = User.updateOne;
  User.updateOne = async () => {
    throw new Error("Should not update a client without a booking voucher.");
  };

  try {
    assert.equal(await restoreVoucherForBooking({ _id: new mongoose.Types.ObjectId() }), false);
  } finally {
    User.updateOne = originalUpdateOne;
  }
});
