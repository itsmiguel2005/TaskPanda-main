const mongoose = require("mongoose");
const User = require("../models/User");
const {
  ensureReferralCode,
  recoverExpiredVoucherReservations,
  STAMPS_PER_REWARD,
} = require("../services/rewards");

function serializeVoucher(voucher) {
  return {
    id: String(voucher._id),
    kind: voucher.kind,
    title: voucher.title,
    origin: voucher.origin,
    amount: Number(voucher.amount || 0),
    status: voucher.status,
    awardedAt: voucher.awardedAt,
    expiresAt: voucher.expiresAt || null,
    redeemedAt: voucher.redeemedAt || null,
  };
}

async function handleGetRewards(req, res) {
  try {
    await recoverExpiredVoucherReservations(req.user._id);
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "Account not found." });
    if (!user.referralCode) {
      await ensureReferralCode(user);
    }
    return res.json({
      referralCode: user.referralCode,
      stampProgress: Number(user.stampProgress || 0),
      stampsRequired: STAMPS_PER_REWARD,
      completedBookings: Number(user.completedBookings || 0),
      vouchers: (user.vouchers || []).map(serializeVoucher),
    });
  } catch (error) {
    console.error("Get rewards error:", error);
    return res.status(500).json({ message: "Could not load your rewards." });
  }
}

async function handleGetRewardNotifications(req, res) {
  try {
    const user = await User.findById(req.user._id).select("rewardNotifications").lean();
    if (!user) return res.status(404).json({ message: "Account not found." });
    const notifications = (user.rewardNotifications || [])
      .filter((notification) => !notification.readAt)
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .map((notification) => ({
        id: String(notification._id),
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt,
      }));
    return res.json({ notifications });
  } catch (error) {
    console.error("Get reward notifications error:", error);
    return res.status(500).json({ message: "Could not load reward notifications." });
  }
}

async function handleMarkRewardNotificationRead(req, res) {
  const notificationId = String(req.params.notificationId || "");
  if (!mongoose.isValidObjectId(notificationId)) {
    return res.status(400).json({ message: "Choose a valid reward notification." });
  }
  try {
    const result = await User.updateOne(
      mongoose.trusted({
        _id: req.user._id,
        rewardNotifications: mongoose.trusted({
          $elemMatch: { _id: new mongoose.Types.ObjectId(notificationId) },
        }),
      }),
      { $set: { "rewardNotifications.$.readAt": new Date() } }
    );
    if (!result.matchedCount) return res.status(404).json({ message: "Reward notification not found." });
    return res.json({ message: "Reward notification marked as read." });
  } catch (error) {
    console.error("Mark reward notification read error:", error);
    return res.status(500).json({ message: "Could not update the reward notification." });
  }
}

module.exports = {
  handleGetRewards,
  handleGetRewardNotifications,
  handleMarkRewardNotificationRead,
};
