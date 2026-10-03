const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const User = require("../models/User");
const { restoreVoucherForBooking } = require("./rewards");

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
