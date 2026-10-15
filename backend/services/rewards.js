const mongoose = require("mongoose");
const { createHash } = require("crypto");
const Booking = require("../models/Booking");
const ReferralLog = require("../models/ReferralLog");
const User = require("../models/User");

const REFERRAL_VOUCHER_AMOUNT = 50;
const STAMPS_PER_REWARD = 5;
const STAMP_VOUCHER_AMOUNT = 50;
const VERIFICATION_VOUCHER_AMOUNT = 50;

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

async function awardVerificationVoucher(userId) {
  const voucherId = new mongoose.Types.ObjectId();
  const notificationId = new mongoose.Types.ObjectId();
  const awardedAt = new Date();
  const result = await User.updateOne(
    mongoose.trusted({
      _id: userId,
      role: "client",
      isVerified: true,
      verificationStatus: "verified",
      verificationVoucherAwarded: mongoose.trusted({ $ne: true }),
    }),
    {
      $set: { verificationVoucherAwarded: true },
      $push: {
        vouchers: {
          _id: voucherId,
          kind: "promotion",
          title: "Identity verified — ₱50 travel-fee voucher",
          origin: "promotion",
          amount: VERIFICATION_VOUCHER_AMOUNT,
          status: "active",
          awardedAt,
        },
        rewardNotifications: {
          $each: [{
            _id: notificationId,
            title: "Your verification reward is here",
            message: "Your identity is verified. A free ₱50 travel-fee voucher is now in your wallet.",
            createdAt: awardedAt,
          }],
          $slice: -50,
        },
      },
    }
  );
  return result.modifiedCount === 1;
}

function hashReferralSignal(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized ? createHash("sha256").update(normalized).digest("hex") : "";
}

function getReferralSignals(req) {
  const ipAddress = String(req.ip || req.socket?.remoteAddress || "")
    .replace(/^::ffff:/i, "")
    .trim();
  const getHeader = (name) => String(req.get?.(name) || req.headers?.[name] || "").trim();
  const deviceDetails = [
    getHeader("user-agent"),
    getHeader("sec-ch-ua"),
    getHeader("sec-ch-ua-platform"),
    getHeader("sec-ch-ua-mobile"),
  ].filter(Boolean).join("|");

  return {
    ipHash: hashReferralSignal(ipAddress),
    deviceHash: hashReferralSignal(deviceDetails),
  };
}

async function recordReferralSignal(userId, req, referredBy = null) {
  const { ipHash, deviceHash } = getReferralSignals(req);
  const filter = mongoose.trusted({
    userId,
    referredBy: referredBy || null,
    ipHash,
    deviceHash,
  });
  await ReferralLog.updateOne(
    filter,
    {
      $setOnInsert: {
        userId,
        ...(referredBy ? { referredBy } : {}),
        ipHash,
        deviceHash,
      },
    },
    { upsert: true }
  );
}

async function sharesReferralSignal(clientId, referrerId) {
  const [clientSignals, referrerSignals] = await Promise.all([
    ReferralLog.find({ userId: clientId, referredBy: referrerId })
      .select("ipHash deviceHash")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    ReferralLog.find({ userId: referrerId })
      .select("ipHash deviceHash")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);
  const completeClientSignals = clientSignals.filter((signal) => signal.ipHash && signal.deviceHash);
  const completeReferrerSignals = referrerSignals.filter((signal) => signal.ipHash && signal.deviceHash);
  if (!completeClientSignals.length || !completeReferrerSignals.length) return true;

  const clientIpHashes = new Set(completeClientSignals.map((signal) => signal.ipHash));
  const clientDeviceHashes = new Set(completeClientSignals.map((signal) => signal.deviceHash));
  return completeReferrerSignals.some((signal) =>
    clientIpHashes.has(signal.ipHash) || clientDeviceHashes.has(signal.deviceHash)
  );
}

async function awardPendingReferralRewards(clientId) {
  const client = await User.findById(clientId)
    .select("_id role referredBy referralRewardStatus completedBookings firstSettledBookingId referralVoucherAwarded phoneVerified registrationComplete");
  if (
    !client ||
    client.role !== "client" ||
    client.registrationComplete !== true ||
    client.phoneVerified !== true ||
    !client.referredBy ||
    client.referralRewardStatus !== "PENDING_FIRST_BOOKING" ||
    !client.firstSettledBookingId ||
    client.referralVoucherAwarded === true
  ) {
    return false;
  }

  const qualifyingBooking = await Booking.findOne({
    _id: client.firstSettledBookingId,
    clientId: client._id,
    status: "settled",
    paymentMethod: "cash",
  }).select("_id");
  if (!qualifyingBooking) return false;

  const referrer = await User.findOne({
    _id: client.referredBy,
    role: "client",
    registrationComplete: true,
  }).select("_id referralRewardedClientIds");
  if (!referrer || await sharesReferralSignal(client._id, referrer._id)) return false;

  const clientVoucher = makeVoucher({
    kind: "referral",
    title: "A welcome from a friend",
    origin: "referral",
  });
  const referrerVoucher = makeVoucher({
    kind: "referral",
    title: "A friend completed their first booking",
    origin: "referral",
  });
  const clientNotification = makeRewardNotification({
    title: "Your first travel voucher is here",
    message: "Your first completed booking unlocked a ₱50 travel-fee voucher.",
  });
  const referrerNotification = makeRewardNotification({
    title: "Your referral reward is here",
    message: "Your friend completed their first booking. A ₱50 travel-fee voucher is now in your wallet.",
  });

  const session = await mongoose.startSession();
  let rewarded = false;
  try {
    await session.withTransaction(async () => {
      const currentReferrer = await User.findOne({
        _id: referrer._id,
        role: "client",
        registrationComplete: true,
      }).select("_id referralRewardedClientIds").session(session);
      if (!currentReferrer) throw new Error("The referral owner is no longer an active client.");

      const clientResult = await User.updateOne(
        mongoose.trusted({
          _id: client._id,
          role: "client",
          referredBy: referrer._id,
          referralRewardStatus: "PENDING_FIRST_BOOKING",
          firstSettledBookingId: client.firstSettledBookingId,
        }),
        {
          $set: {
            referralRewardStatus: "REWARDED",
            referralVoucherAwarded: true,
          },
          $push: {
            vouchers: clientVoucher,
            rewardNotifications: { $each: [clientNotification], $slice: -50 },
          },
        },
        { session }
      );
      if (clientResult.modifiedCount !== 1) return;

      const alreadyRewarded = (currentReferrer.referralRewardedClientIds || [])
        .some((rewardedClientId) => String(rewardedClientId) === String(client._id));
      if (!alreadyRewarded) {
        const referrerResult = await User.updateOne(
          mongoose.trusted({
            _id: referrer._id,
            role: "client",
            referralRewardedClientIds: mongoose.trusted({ $ne: client._id }),
          }),
          {
            $addToSet: { referralRewardedClientIds: client._id },
            $push: {
              vouchers: referrerVoucher,
              rewardNotifications: { $each: [referrerNotification], $slice: -50 },
            },
          },
          { session }
        );
        if (referrerResult.modifiedCount !== 1) {
          throw new Error("Could not save the referral owner's reward.");
        }
      }
      rewarded = true;
    });
    return rewarded;
  } finally {
    await session.endSession();
  }
}

async function retryPendingReferralRewardsForReferrer(referrerId) {
  const pendingClients = await User.find({
    role: "client",
    referredBy: referrerId,
    referralRewardStatus: "PENDING_FIRST_BOOKING",
    firstSettledBookingId: mongoose.trusted({ $exists: true }),
  }).select("_id").limit(100).lean();

  let rewardedCount = 0;
  for (const client of pendingClients) {
    if (await awardPendingReferralRewards(client._id)) rewardedCount += 1;
  }
  return rewardedCount;
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

async function restoreVoucherForRefund(booking) {
  if (!booking?.voucherId || !booking?._id || !booking?.clientId || Number(booking.travelFeeDiscount || 0) <= 0) {
    return false;
  }

  const clientId = booking.clientId._id || booking.clientId;
  const restored = await User.updateOne(
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
  if (restored.modifiedCount === 1) return true;

  const alreadyRestored = await User.exists(
    mongoose.trusted({
      _id: clientId,
      vouchers: mongoose.trusted({
        $elemMatch: {
          _id: booking.voucherId,
          status: "active",
        },
      }),
    })
  );
  if (alreadyRestored) return true;
  throw new Error("The booking's travel-fee voucher could not be restored.");
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

  let claimedFirstSettledBooking = false;
  try {
    const firstBookingClaim = await User.updateOne(
      mongoose.trusted({
        _id: booking.clientId,
        role: "client",
        $or: [
          { completedBookings: 0 },
          { completedBookings: mongoose.trusted({ $exists: false }) },
        ],
        firstSettledBookingId: mongoose.trusted({ $exists: false }),
      }),
      { $set: { firstSettledBookingId: booking._id } }
    );
    claimedFirstSettledBooking = firstBookingClaim.modifiedCount === 1;

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
    if (claimedFirstSettledBooking) {
      await User.updateOne(
        mongoose.trusted({
          _id: booking.clientId,
          firstSettledBookingId: booking._id,
        }),
        { $unset: { firstSettledBookingId: 1 } }
      );
    }
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
  VERIFICATION_VOUCHER_AMOUNT,
  awardVerificationVoucher,
  createReferralCode,
  ensureReferralCode,
  getReferralSignals,
  recordReferralSignal,
  sharesReferralSignal,
  awardPendingReferralRewards,
  retryPendingReferralRewardsForReferrer,
  recoverExpiredVoucherReservations,
  restoreVoucherForBooking,
  restoreVoucherForRefund,
  awardSettledBookingStamp,
};
