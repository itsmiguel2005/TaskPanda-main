const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const User = require("../models/User");
const {
  awardPendingReferralRewards,
  awardSettledBookingStamp,
  awardVerificationVoucher,
  getReferralSignals,
  restoreVoucherForBooking,
  restoreVoucherForRefund,
  sharesReferralSignal,
} = require("./rewards");
const ReferralLog = require("../models/ReferralLog");

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

test("referral request signals are hashed and detect shared IP or device fingerprints", async () => {
  const signals = getReferralSignals({
    ip: "::ffff:192.0.2.4",
    headers: {
      "user-agent": "TaskPanda Test Browser",
      "sec-ch-ua-platform": '"Windows"',
    },
  });
  assert.match(signals.ipHash, /^[a-f\d]{64}$/);
  assert.match(signals.deviceHash, /^[a-f\d]{64}$/);
  assert.notEqual(signals.ipHash, "192.0.2.4");

  const originalFind = ReferralLog.find;
  const makeQuery = (rows) => ({
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean: async () => rows,
  });
  let calls = 0;
  ReferralLog.find = () => {
    calls += 1;
    return makeQuery(calls === 1
      ? [{ ipHash: "same-ip", deviceHash: "client-device" }]
      : [{ ipHash: "same-ip", deviceHash: "referrer-device" }]);
  };

  try {
    assert.equal(
      await sharesReferralSignal(new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()),
      true
    );
    calls = 0;
    ReferralLog.find = () => {
      calls += 1;
      return makeQuery(calls === 1
        ? [{ ipHash: "client-ip", deviceHash: "same-device" }]
        : [{ ipHash: "referrer-ip", deviceHash: "same-device" }]);
    };
    assert.equal(
      await sharesReferralSignal(new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()),
      true
    );

    ReferralLog.find = () => makeQuery([]);
    assert.equal(
      await sharesReferralSignal(new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()),
      false
    );
  } finally {
    ReferralLog.find = originalFind;
  }
});

test("referral rewards remain pending until the client's first settled booking", async () => {
  const originalFindById = User.findById;
  User.findById = () => ({
    select: async () => ({
      _id: new mongoose.Types.ObjectId(),
      role: "client",
      referredBy: new mongoose.Types.ObjectId(),
      referralRewardStatus: "PENDING_FIRST_BOOKING",
      completedBookings: 0,
    }),
  });
  const originalFindOne = User.findOne;
  User.findOne = () => {
    throw new Error("The referrer should not be queried before a completed booking.");
  };

  try {
    assert.equal(await awardPendingReferralRewards(new mongoose.Types.ObjectId()), false);
  } finally {
    User.findById = originalFindById;
    User.findOne = originalFindOne;
  }
});

test("concurrent settlements atomically retain one first-settled booking", async () => {
  const clientId = new mongoose.Types.ObjectId();
  const bookingIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const originalBookingFindOneAndUpdate = Booking.findOneAndUpdate;
  const originalBookingUpdateOne = Booking.updateOne;
  const originalUserUpdateOne = User.updateOne;
  const originalUserFindOneAndUpdate = User.findOneAndUpdate;
  const awardedBookingIds = new Set();
  const user = { completedBookings: 0, stampProgress: 0 };
  const query = (value) => ({
    select() { return Promise.resolve(value); },
  });

  Booking.findOneAndUpdate = (filter) => {
    const key = String(filter._id);
    if (awardedBookingIds.has(key)) return query(null);
    awardedBookingIds.add(key);
    return query({ _id: filter._id, clientId });
  };
  Booking.updateOne = async () => ({ modifiedCount: 1 });
  User.updateOne = async (filter, update) => {
    if (filter.firstSettledBookingId?.$exists === false && user.completedBookings === 0 && !user.firstSettledBookingId) {
      user.firstSettledBookingId = update.$set.firstSettledBookingId;
      return { modifiedCount: 1 };
    }
    return { modifiedCount: 0 };
  };
  User.findOneAndUpdate = (_filter, update) => {
    user.completedBookings += update.$inc.completedBookings;
    user.stampProgress += update.$inc.stampProgress;
    return query({ _id: clientId });
  };

  try {
    const results = await Promise.all(bookingIds.map((bookingId) => awardSettledBookingStamp(bookingId)));
    assert.deepEqual(results, [true, true]);
    assert.equal(user.completedBookings, 2);
    assert.ok(bookingIds.some((bookingId) => String(bookingId) === String(user.firstSettledBookingId)));
  } finally {
    Booking.findOneAndUpdate = originalBookingFindOneAndUpdate;
    Booking.updateOne = originalBookingUpdateOne;
    User.updateOne = originalUserUpdateOne;
    User.findOneAndUpdate = originalUserFindOneAndUpdate;
  }
});

test("referral vouchers are issued transactionally after the first settled booking despite shared IP", async () => {
  const clientId = new mongoose.Types.ObjectId();
  const referrerId = new mongoose.Types.ObjectId();
  const client = {
    _id: clientId,
    role: "client",
    referredBy: referrerId,
    referralRewardStatus: "PENDING_FIRST_BOOKING",
    completedBookings: 1,
    firstSettledBookingId: new mongoose.Types.ObjectId(),
    referralVoucherAwarded: false,
    phoneVerified: true,
    registrationComplete: true,
  };
  const referrer = { _id: referrerId, referralRewardedClientIds: [] };
  const originalBookingFindOne = Booking.findOne;
  const originalFindById = User.findById;
  const originalFindOne = User.findOne;
  const originalUpdateOne = User.updateOne;
  const originalReferralFind = ReferralLog.find;
  const originalStartSession = mongoose.startSession;
  const updates = [];
  let referralFindCount = 0;
  const makeQuery = (rows) => ({
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean: async () => rows,
  });
  Booking.findOne = (filter) => ({
    select: async () => {
      assert.equal(String(filter._id), String(client.firstSettledBookingId));
      assert.equal(String(filter.clientId), String(clientId));
      assert.equal(filter.status, "settled");
      return { _id: client.firstSettledBookingId };
    },
  });
  User.findById = () => ({ select: async () => client });
  User.findOne = () => ({
    select() {
      return {
        session: async () => referrer,
        then(resolve, reject) {
          return Promise.resolve(referrer).then(resolve, reject);
        },
      };
    },
  });
  User.updateOne = async (filter, update, options) => {
    updates.push({ filter, update, options });
    return { modifiedCount: 1 };
  };
  ReferralLog.find = () => {
    referralFindCount += 1;
    return makeQuery(referralFindCount === 1
      ? [{ ipHash: "shared-ip", deviceHash: "client-device" }]
      : [{ ipHash: "shared-ip", deviceHash: "referrer-device" }]);
  };
  mongoose.startSession = async () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {},
  });

  try {
    assert.equal(await awardPendingReferralRewards(clientId), true);
    assert.equal(updates.length, 2);
    assert.equal(updates[0].filter.referralRewardStatus, "PENDING_FIRST_BOOKING");
    assert.equal(String(updates[0].filter.firstSettledBookingId), String(client.firstSettledBookingId));
    assert.equal(updates[0].update.$set.referralRewardStatus, "REWARDED");
    assert.equal(updates[0].update.$push.vouchers.amount, 50);
    assert.equal(updates[1].update.$addToSet.referralRewardedClientIds, clientId);
    assert.equal(updates[1].update.$push.vouchers.amount, 50);
    assert.ok(updates.every(({ options }) => options.session));
    assert.equal(referralFindCount, 0);
  } finally {
    Booking.findOne = originalBookingFindOne;
    User.findById = originalFindById;
    User.findOne = originalFindOne;
    User.updateOne = originalUpdateOne;
    ReferralLog.find = originalReferralFind;
    mongoose.startSession = originalStartSession;
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

test("refund voucher restoration is idempotent for an already active voucher", async () => {
  const clientId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();
  const voucherId = new mongoose.Types.ObjectId();
  const originalUpdateOne = User.updateOne;
  const originalExists = User.exists;
  User.updateOne = async () => ({ modifiedCount: 0 });
  User.exists = async (filter) => {
    assert.equal(String(filter._id), String(clientId));
    assert.equal(String(filter.vouchers.$elemMatch._id), String(voucherId));
    assert.equal(filter.vouchers.$elemMatch.status, "active");
    return { _id: voucherId };
  };

  try {
    assert.equal(await restoreVoucherForRefund({
      _id: bookingId,
      clientId,
      voucherId,
      travelFeeDiscount: 50,
    }), true);
  } finally {
    User.updateOne = originalUpdateOne;
    User.exists = originalExists;
  }
});

test("refund voucher restoration fails explicitly when its voucher cannot be found", async () => {
  const originalUpdateOne = User.updateOne;
  const originalExists = User.exists;
  User.updateOne = async () => ({ modifiedCount: 0 });
  User.exists = async () => null;

  try {
    await assert.rejects(
      restoreVoucherForRefund({
        _id: new mongoose.Types.ObjectId(),
        clientId: new mongoose.Types.ObjectId(),
        voucherId: new mongoose.Types.ObjectId(),
        travelFeeDiscount: 50,
      }),
      /could not be restored/
    );
  } finally {
    User.updateOne = originalUpdateOne;
    User.exists = originalExists;
  }
});
