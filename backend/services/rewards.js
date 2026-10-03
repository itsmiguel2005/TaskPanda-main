const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const User = require("../models/User");

const REFERRAL_VOUCHER_AMOUNT = 50;
const STAMPS_PER_REWARD = 5;
const STAMP_VOUCHER_AMOUNT = 50;

function createReferralCode(userId) {
  return `TP${String(userId).replace(/[^a-f\d]/gi, "").toUpperCase()}`;
}

async function ensureReferralCode(user) {
  if (user.referralCode) return user.referralCode;

  const referralCode = createReferralCode(user._id);
  const result = await User.updateOne(
    { _id: user._id },
    { $set: { referralCode } }
  );
  if (!result.matchedCount) throw new Error("Could not save the referral code for this account.");
  user.referralCode = referralCode;
  return referralCode;
}

function makeVoucher({ kind, title, origin, amount = REFERRAL_VOUCHER_AMOUNT }) {
  return {
    _id: new mongoose.Types.ObjectId(),
    kind,
    title,
    origin,
    amount,
    status: "active",
    awardedAt: new Date(),
  };
}

function makeRewardNotification({ title, message }) {
  return {
    _id: new mongoose.Types.ObjectId(),
    title,
    message,
    createdAt: new Date(),
  };
}

async function creditReferralRewards(user) {
  if (user.role !== "client" || !user.referredBy) return;

  const referrer = await User.findOne({
    _id: user.referredBy,
    role: "client",
    registrationComplete: true,
  }).select("_id");
  if (!referrer) return;

  const clientVoucher = makeVoucher({
    kind: "referral",
    title: "A welcome from a friend",
    origin: "referral",
  });
  const referrerVoucher = makeVoucher({
    kind: "referral",
    title: "A friend joined TaskPanda",
    origin: "referral",
  });
  const clientNotification = makeRewardNotification({
    title: "Your first travel voucher is here",
    message: "A friend welcomed you with a ₱50 travel-fee voucher.",
  });
  const referrerNotification = makeRewardNotification({
    title: "Your referral reward is here",
    message: "A friend joined TaskPanda. A ₱50 travel-fee voucher is now in your wallet.",
  });

  await User.updateOne(
    {
      _id: user._id,
      referralVoucherAwarded: mongoose.trusted({ $ne: true }),
    },
    {
      $set: {
        referralVoucherAwarded: true,
        referralCode: user.referralCode || createReferralCode(user._id),
      },
      $push: {
        vouchers: clientVoucher,
        rewardNotifications: { $each: [clientNotification], $slice: -50 },
      },
    }
  );

  await User.updateOne(
    {
      _id: referrer._id,
      referralRewardedClientIds: mongoose.trusted({ $ne: user._id }),
    },
    {
      $addToSet: { referralRewardedClientIds: user._id },
      $push: {
        vouchers: referrerVoucher,
        rewardNotifications: { $each: [referrerNotification], $slice: -50 },
      },
    }
  );
}

async function recoverExpiredVoucherReservations(userId) {
  const user = await User.findById(userId).select("+vouchers.reservationId");
  if (!user) return;
  const now = new Date();
  const expiredReservations = (user.vouchers || []).filter((voucher) =>
    voucher.status === "reserved" &&
    voucher.reservationId &&
    voucher.reservationExpiresAt &&
    voucher.reservationExpiresAt <= now
  );

  for (const voucher of expiredReservations) {
    const booking = await Booking.findOne({
      clientId: user._id,
      voucherReservationId: voucher.reservationId,
      voucherId: voucher._id,
    }).select("_id createdAt");
    const nextStatus = booking ? "redeemed" : "active";
    await User.updateOne(
      mongoose.trusted({
        _id: user._id,
        vouchers: mongoose.trusted({
          $elemMatch: {
            _id: voucher._id,
            status: "reserved",
            reservationId: voucher.reservationId,
          },
        }),
      }),
      {
        $set: {
          "vouchers.$.status": nextStatus,
          ...(booking ? {
            "vouchers.$.bookingId": booking._id,
            "vouchers.$.redeemedAt": booking.createdAt || now,
          } : {}),
        },
        $unset: {
          "vouchers.$.reservationId": 1,
          "vouchers.$.reservationExpiresAt": 1,
        },
      }
    );
  }
}

async function restoreVoucherForBooking(booking) {
  if (!booking?.voucherId || !booking?._id || !booking?.clientId) return false;

  const clientId = booking.clientId._id || booking.clientId;
  const result = await User.updateOne(
    mongoose.trusted({
      _id: clientId,
      vouchers: mongoose.trusted({
        $elemMatch: {
          _id: booking.voucherId,
          status: "redeemed",
          bookingId: booking._id,
        },
      }),
    }),
    {
      $set: { "vouchers.$.status": "active" },
      $unset: {
        "vouchers.$.bookingId": 1,
        "vouchers.$.redeemedAt": 1,
      },
    }
  );

  return result.modifiedCount === 1;
}

async function awardSettledBookingStamp(bookingId) {
  const stampAwardedAt = new Date();
  const booking = await Booking.findOneAndUpdate(
    mongoose.trusted({
      _id: bookingId,
      status: "settled",
      stampAwardedAt: mongoose.trusted({ $exists: false }),
    }),
    { $set: { stampAwardedAt } },
    { new: true }
  ).select("clientId");
  if (!booking) return false;

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ordinaryStamp = await User.findOneAndUpdate(
        mongoose.trusted({
          _id: booking.clientId,
          role: "client",
          $or: [
            { stampProgress: mongoose.trusted({ $lt: STAMPS_PER_REWARD - 1 }) },
            { stampProgress: mongoose.trusted({ $exists: false }) },
          ],
        }),
        { $inc: { stampProgress: 1, completedBookings: 1 } },
        { new: true }
      ).select("_id");
      if (ordinaryStamp) return true;

      const voucher = {
        ...makeVoucher({
          kind: "milestone",
          title: "Five bookings, one less travel fee",
          origin: "stamp-card",
          amount: STAMP_VOUCHER_AMOUNT,
        }),
      };
      const notification = makeRewardNotification({
        title: "Your stamp card is complete",
        message: "Five completed bookings earned you a ₱50 travel-fee voucher.",
      });
      const milestone = await User.findOneAndUpdate(
        mongoose.trusted({
          _id: booking.clientId,
          role: "client",
          stampProgress: STAMPS_PER_REWARD - 1,
        }),
        {
          $set: { stampProgress: STAMPS_PER_REWARD },
          $inc: { completedBookings: 1 },
          $push: {
            vouchers: voucher,
            rewardNotifications: { $each: [notification], $slice: -50 },
          },
        },
        { new: true }
      ).select("_id");
      if (milestone) return true;

      const nextCardStamp = await User.findOneAndUpdate(
        mongoose.trusted({
          _id: booking.clientId,
          role: "client",
          stampProgress: STAMPS_PER_REWARD,
        }),
        {
          $set: { stampProgress: 1 },
          $inc: { completedBookings: 1 },
        },
        { new: true }
      ).select("_id");
      if (nextCardStamp) return true;
    }
    throw new Error("Could not record a loyalty stamp after repeated concurrent updates.");
  } catch (error) {
    await Booking.updateOne(
      { _id: booking._id, stampAwardedAt },
      { $unset: { stampAwardedAt: 1 } }
    );
    throw error;
  }
}

module.exports = {
  REFERRAL_VOUCHER_AMOUNT,
  STAMPS_PER_REWARD,
  STAMP_VOUCHER_AMOUNT,
  createReferralCode,
  ensureReferralCode,
  creditReferralRewards,
  recoverExpiredVoucherReservations,
  restoreVoucherForBooking,
  awardSettledBookingStamp,
};
