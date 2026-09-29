const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const User = require("../models/User");

const ACTIVE_STATUSES = ["approved", "en_route", "in_progress", "Confirmed", "On the Way", "In Progress"];
const IN_PROGRESS_STATUSES = ["en_route", "in_progress", "On the Way", "In Progress"];
const PENDING_STATUSES = ["pending", "Pending Request"];
const COMPLETED_STATUSES = ["complete", "closed", "settled", "Completed", "Settled"];

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

async function handleGetAdminAnalytics(_req, res) {
  try {
    const now = new Date();
    const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
    const recentWindow = { createdAt: { $gte: trendStart, $lte: now } };

    const [
      clients,
      providers,
      pendingVerifications,
      pendingBookings,
      activeBookings,
      inProgressBookings,
      completedSummary,
      trendRows,
      categoryRows,
      recentBookings,
    ] = await Promise.all([
      User.countDocuments({ role: "client", registrationComplete: true }),
      User.countDocuments({ role: "provider", registrationComplete: true }),
      User.countDocuments({
        role: "provider",
        registrationComplete: true,
        isVerified: mongoose.trusted({ $ne: true }),
        verificationStatus: mongoose.trusted({ $in: ["unverified", "pending"] }),
      }),
      Booking.countDocuments({ status: mongoose.trusted({ $in: PENDING_STATUSES }) }),
      Booking.countDocuments({ status: mongoose.trusted({ $in: ACTIVE_STATUSES }) }),
      Booking.countDocuments({ status: mongoose.trusted({ $in: IN_PROGRESS_STATUSES }) }),
      Booking.aggregate([
        { $match: { status: { $in: COMPLETED_STATUSES } } },
        { $group: { _id: null, count: { $sum: 1 }, completedValue: { $sum: "$offeredPrice" } } },
      ]),
      Booking.aggregate([
        { $match: recentWindow },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Booking.aggregate([
        { $match: recentWindow },
        { $lookup: { from: User.collection.name, localField: "providerId", foreignField: "_id", as: "provider" } },
        { $unwind: { path: "$provider", preserveNullAndEmptyArrays: true } },
        { $addFields: { category: { $ifNull: [{ $arrayElemAt: ["$provider.professions", 0] }, "Uncategorized"] } } },
        { $group: { _id: "$category", bookings: { $sum: 1 } } },
        { $sort: { bookings: -1, _id: 1 } },
        { $limit: 6 },
      ]),
      Booking.find().sort({ createdAt: -1 }).limit(6)
        .populate("clientId", "fullName username email")
        .populate("providerId", "fullName username email professions")
        .lean(),
    ]);

    const trendCounts = new Map(trendRows.map((row) => [row._id, row.count]));
    const bookingTrend = Array.from({ length: 30 }, (_, index) => {
      const day = new Date(trendStart);
      day.setUTCDate(day.getUTCDate() + index);
      const date = dateKey(day);
      return { date, bookings: trendCounts.get(date) || 0 };
    });
    const summary = completedSummary[0] || { count: 0, completedValue: 0 };

    return res.json({
      summary: {
        totalUsers: clients + providers,
        clients,
        providers,
        pendingVerifications,
        activeBookings,
        pendingBookings,
        inProgressBookings,
        completedBookings: summary.count,
        completedValue: summary.completedValue,
      },
      bookingTrend,
      topCategories: categoryRows.map((row) => ({ category: row._id, bookings: row.bookings })),
      recentBookings: recentBookings.map((booking) => ({
        id: String(booking._id),
        task: booking.repairDescription || "Service request",
        client: booking.clientId?.fullName || booking.clientId?.username || booking.clientId?.email || "Client",
        provider: booking.providerId?.fullName || booking.providerId?.username || booking.providerId?.email || "Provider",
        status: booking.status,
        serviceDate: booking.serviceDate,
        createdAt: booking.createdAt,
        offeredPrice: Number(booking.offeredPrice || 0),
      })),
      system: {
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        uptimeSeconds: Math.floor(process.uptime()),
        checkedAt: now,
      },
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    return res.status(500).json({ message: "Could not load dashboard analytics." });
  }
}

module.exports = { handleGetAdminAnalytics };