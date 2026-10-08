const Broadcast = require("../models/Broadcast");
const UserDashboardDismissal = require("../models/UserDashboardDismissal");
const mongoose = require("mongoose");

async function handleGetBroadcasts(req, res) {
  try {
    const dismissals = await UserDashboardDismissal.find({ userId: req.user._id, kind: "broadcast" })
      .select("targetId")
      .lean();
    const filter = {
      createdAt: mongoose.trusted({ $gte: req.user.createdAt }),
      ...(dismissals.length
        ? { _id: mongoose.trusted({ $nin: dismissals.map((dismissal) => dismissal.targetId) }) }
        : {}),
    };
    const broadcasts = await Broadcast.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(50)
      .select("title message createdAt")
      .lean();
    return res.json({
      broadcasts: broadcasts.map((broadcast) => ({
        id: String(broadcast._id),
        title: broadcast.title,
        message: broadcast.message,
        createdAt: broadcast.createdAt,
      })),
    });
  } catch (error) {
    console.error("Broadcast notifications read error:", error);
    return res.status(500).json({ message: "Could not load broadcast notifications." });
  }
}

async function handleDismissBroadcast(req, res) {
  const broadcastId = String(req.params.id || "");
  if (!mongoose.isValidObjectId(broadcastId)) return res.status(400).json({ message: "Choose a valid system announcement." });

  try {
    const broadcastExists = await Broadcast.exists({ _id: broadcastId });
    if (!broadcastExists) return res.status(404).json({ message: "That system announcement no longer exists." });
    await UserDashboardDismissal.updateOne(
      { userId: req.user._id, kind: "broadcast", targetId: broadcastId },
      { $setOnInsert: { userId: req.user._id, kind: "broadcast", targetId: broadcastId } },
      { upsert: true }
    );
    return res.json({ dismissed: true });
  } catch (error) {
    if (error?.code === 11000) return res.json({ dismissed: true });
    console.error("Broadcast notification dismissal error:", error);
    return res.status(500).json({ message: "Could not dismiss this system announcement." });
  }
}

async function handleMigrateBroadcastDismissals(req, res) {
  const broadcastIds = req.body?.broadcastIds;
  if (!Array.isArray(broadcastIds) || broadcastIds.length > 500 || broadcastIds.some((id) => !mongoose.isValidObjectId(id))) {
    return res.status(400).json({ message: "Provide up to 500 valid system announcement IDs." });
  }

  try {
    const broadcasts = await Broadcast.find({ _id: mongoose.trusted({ $in: broadcastIds }) }).select("_id").lean();
    if (broadcasts.length) {
      await UserDashboardDismissal.bulkWrite(
        broadcasts.map((broadcast) => ({
          updateOne: {
            filter: { userId: req.user._id, kind: "broadcast", targetId: broadcast._id },
            update: { $setOnInsert: { userId: req.user._id, kind: "broadcast", targetId: broadcast._id } },
            upsert: true,
          },
        })),
        { ordered: false }
      );
    }
    return res.json({ dismissedBroadcastIds: broadcasts.map((broadcast) => String(broadcast._id)) });
  } catch (error) {
    if (error?.code === 11000) {
      const existingDismissals = await UserDashboardDismissal.find({
        userId: req.user._id,
        kind: "broadcast",
        targetId: mongoose.trusted({ $in: broadcastIds }),
      }).select("targetId").lean();
      return res.json({ dismissedBroadcastIds: existingDismissals.map((item) => String(item.targetId)) });
    }
    console.error("Legacy broadcast dismissal migration error:", error);
    return res.status(500).json({ message: "Could not sync dismissed system announcements." });
  }
}

module.exports = { handleGetBroadcasts, handleDismissBroadcast, handleMigrateBroadcastDismissals };
