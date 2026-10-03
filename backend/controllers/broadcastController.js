const Broadcast = require("../models/Broadcast");

async function handleGetBroadcasts(_req, res) {
  try {
    const broadcasts = await Broadcast.find()
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

module.exports = { handleGetBroadcasts };
