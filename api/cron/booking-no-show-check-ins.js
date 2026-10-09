const connectDB = require("../../backend/db");
const { processBookingNoShowCheckIns } = require("../../backend/controllers/bookingController");

module.exports = async function bookingNoShowCheckIns(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(503).json({ message: "CRON_SECRET is not configured." });
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  try {
    await connectDB();
    const sentCount = await processBookingNoShowCheckIns();
    return res.status(200).json({ checkInsSent: sentCount });
  } catch (error) {
    console.error("Scheduled PandaBot no-show check-in failed:", error);
    return res.status(500).json({ message: "Could not process scheduled booking check-ins." });
  }
};
