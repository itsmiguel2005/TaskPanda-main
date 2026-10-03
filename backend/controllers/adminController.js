const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { randomInt } = require("crypto");
const Booking = require("../models/Booking");
const User = require("../models/User");
const config = require("../config/env");
const { hasValidSmtpCredentials, sendPasswordResetEmail } = require("../services/mailer");

const ACTIVE_STATUSES = ["approved", "en_route", "in_progress", "Confirmed", "On the Way", "In Progress"];
const IN_PROGRESS_STATUSES = ["en_route", "in_progress", "On the Way", "In Progress"];
const PENDING_STATUSES = ["pending", "Pending Request"];
const COMPLETED_STATUSES = ["complete", "closed", "settled", "Completed", "Settled"];
const ADMINISTRABLE_ROLES = ["client", "provider"];
const USER_PAGE_SIZE = 25;
const ACTIVE_BOOKING_STATUSES = [
  "pending", "approved", "en_route", "in_progress", "in_revision", "disputed", "cancel_requested",
  "Pending Request", "Confirmed", "On the Way", "In Progress", "Cancellation Requested",
];

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getAdminUserStatus(user) {
  if (user.archivedAt) return "Archived";
  if (user.isSuspended) return "Suspended";
  if (user.emailVerified === false || user.registrationComplete === false) return "Pending";
  if (user.role === "provider" && user.isVerified !== true && ["unverified", "pending"].includes(user.verificationStatus)) {
    return "Pending";
  }
  return "Active";
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
      User.countDocuments({ role: "client", registrationComplete: true, isSuspended: mongoose.trusted({ $ne: true }), archivedAt: null }),
      User.countDocuments({ role: "provider", registrationComplete: true, isSuspended: mongoose.trusted({ $ne: true }), archivedAt: null }),
      User.countDocuments({
        role: "provider",
        registrationComplete: true,
        isSuspended: mongoose.trusted({ $ne: true }),
        archivedAt: null,
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

async function handleGetAdminUsers(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const search = String(req.query.q || "").trim().slice(0, 100);
    const filter = String(req.query.filter || "all");
    const query = { role: mongoose.trusted({ $in: ADMINISTRABLE_ROLES }) };

    if (filter === "archived") {
      query.archivedAt = mongoose.trusted({ $ne: null });
    } else {
      query.archivedAt = null;
      if (filter === "clients" || filter === "providers") query.role = filter.slice(0, -1);
      if (filter === "suspended") query.isSuspended = true;
    }

    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      query.$or = [{ fullName: pattern }, { username: pattern }, { email: pattern }];
    }

    const offset = (page - 1) * USER_PAGE_SIZE;
    const [users, total, counts] = await Promise.all([
      User.find(query)
        .select("fullName firstName lastName username email role emailVerified registrationComplete isVerified verificationStatus profileImage professions createdAt referralCode stampProgress completedBookings isSuspended suspendedAt archivedAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip(offset)
        .limit(USER_PAGE_SIZE)
        .lean(),
      User.countDocuments(query),
      Promise.all([
        User.countDocuments({ role: mongoose.trusted({ $in: ADMINISTRABLE_ROLES }), archivedAt: null }),
        User.countDocuments({ role: mongoose.trusted({ $in: ADMINISTRABLE_ROLES }), isSuspended: true, archivedAt: null }),
        User.countDocuments({ role: mongoose.trusted({ $in: ADMINISTRABLE_ROLES }), archivedAt: mongoose.trusted({ $ne: null }) }),
      ]),
    ]);

    return res.json({
      users: users.map((user) => ({
        id: String(user._id),
        name: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Unnamed account",
        username: user.username || "",
        email: user.email,
        role: user.role,
        verified: user.isVerified === true,
        emailVerified: user.emailVerified !== false,
        registrationComplete: user.registrationComplete !== false,
        verificationStatus: user.verificationStatus || "unverified",
        profileImage: user.profileImage || "",
        professions: user.professions || [],
        createdAt: user.createdAt,
        referralCode: user.referralCode || "",
        stampProgress: Number(user.stampProgress || 0),
        completedBookings: Number(user.completedBookings || 0),
        isSuspended: user.isSuspended === true,
        suspendedAt: user.suspendedAt || null,
        archivedAt: user.archivedAt || null,
        status: getAdminUserStatus(user),
      })),
      total,
      page,
      pageSize: USER_PAGE_SIZE,
      pages: Math.max(1, Math.ceil(total / USER_PAGE_SIZE)),
      counts: { all: counts[0], suspended: counts[1], archived: counts[2] },
    });
  } catch (error) {
    console.error("Admin users list error:", error);
    return res.status(500).json({ message: "Could not load user accounts." });
  }
}

async function handleGetAdminUserDetails(req, res) {
  try {
    const user = await User.findOne({ _id: req.params.userId, role: mongoose.trusted({ $in: ADMINISTRABLE_ROLES }) })
      .select("+adminActivity fullName firstName middleName lastName username email role emailVerified registrationComplete isVerified verificationStatus profileImage professions bio mobileNumber province city barangay address createdAt updatedAt referralCode referredBy stampProgress completedBookings vouchers isSuspended suspendedAt archivedAt")
      .lean();
    if (!user) return res.status(404).json({ message: "User account not found." });

    const bookingFilter = { $or: [{ clientId: user._id }, { providerId: user._id }] };
    const [referralUses, activeBookings, bookings] = await Promise.all([
      User.countDocuments({ referredBy: user._id }),
      Booking.countDocuments({ ...bookingFilter, status: mongoose.trusted({ $in: ACTIVE_BOOKING_STATUSES }) }),
      Booking.find(bookingFilter)
        .sort({ createdAt: -1 })
        .limit(10)
        .select("clientId providerId repairDescription status serviceDate timeSlot offeredPrice createdAt statusHistory")
        .populate("clientId", "fullName firstName lastName username email")
        .populate("providerId", "fullName firstName lastName username email")
        .lean(),
    ]);

    const activity = [
      ...(user.adminActivity || []).map((entry) => ({
        type: "account",
        title: ({
          suspended: "Account suspended",
          unsuspended: "Account suspension lifted",
          archived: "Account archived",
          restored: "Account restored",
          password_reset_requested: "Password reset email requested",
        })[entry.action] || "Account updated",
        detail: `By ${entry.actorEmail}`,
        occurredAt: entry.createdAt,
      })),
      ...bookings.flatMap((booking) => [
        {
          type: "booking",
          title: user.role === "client" ? "Booking requested" : "Booking received",
          detail: `${booking.repairDescription} · ${booking.status}`,
          occurredAt: booking.createdAt,
        },
        ...(booking.statusHistory || []).map((event) => ({
          type: "booking",
          title: `Booking ${String(event.status).replaceAll("_", " ")}`,
          detail: booking.repairDescription,
          occurredAt: event.at,
        })),
      ]),
      { type: "account", title: "Account registered", detail: "TaskPanda account created", occurredAt: user.createdAt },
    ].sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt)).slice(0, 12);

    return res.json({
      user: {
        id: String(user._id),
        name: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Unnamed account",
        username: user.username || "",
        email: user.email,
        role: user.role,
        verified: user.isVerified === true,
        verificationStatus: user.verificationStatus || "unverified",
        profileImage: user.profileImage || "",
        professions: user.professions || [],
        bio: user.bio || "",
        mobileNumber: user.mobileNumber || "",
        location: [user.barangay, user.city, user.province].filter(Boolean).join(", "),
        address: user.address || "",
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        referralCode: user.referralCode || "",
        referredBy: user.referredBy ? String(user.referredBy) : "",
        referralUses,
        stampProgress: Number(user.stampProgress || 0),
        completedBookings: Number(user.completedBookings || 0),
        activeBookings,
        voucherCount: (user.vouchers || []).length,
        isSuspended: user.isSuspended === true,
        suspendedAt: user.suspendedAt || null,
        archivedAt: user.archivedAt || null,
        status: getAdminUserStatus(user),
      },
      bookings: bookings.map((booking) => {
        const counterpart = user.role === "client" ? booking.providerId : booking.clientId;
        const counterpartName = counterpart?.fullName || [counterpart?.firstName, counterpart?.lastName].filter(Boolean).join(" ") || counterpart?.username || counterpart?.email || "Account unavailable";
        return {
          id: String(booking._id),
          task: booking.repairDescription,
          status: booking.status,
          serviceDate: booking.serviceDate,
          timeSlot: booking.timeSlot,
          createdAt: booking.createdAt,
          counterpartName,
        };
      }),
      activity,
    });
  } catch (error) {
    console.error("Admin user details error:", error);
    return res.status(500).json({ message: "Could not load this user account." });
  }
}

function adminActivity(action, actorEmail) {
  return {
    $push: {
      adminActivity: {
        $each: [{ action, actorEmail, createdAt: new Date() }],
        $slice: -50,
      },
    },
  };
}

async function handleSetAdminUserSuspension(req, res) {
  try {
    const suspended = req.body.suspended === true;
    const update = {
      $set: suspended ? { isSuspended: true, suspendedAt: new Date(), accountTokens: [] } : { isSuspended: false },
      ...(suspended ? {} : { $unset: { suspendedAt: 1 } }),
      ...adminActivity(suspended ? "suspended" : "unsuspended", req.adminEmail),
    };
    const user = await User.findOneAndUpdate(
      { _id: req.params.userId, role: mongoose.trusted({ $in: ADMINISTRABLE_ROLES }), archivedAt: null },
      update,
      { new: true, runValidators: true }
    ).select("fullName email role isSuspended archivedAt");
    if (!user) return res.status(404).json({ message: "Active user account not found." });
    return res.json({ message: suspended ? "Account suspended and active sessions revoked." : "Account suspension lifted.", isSuspended: user.isSuspended });
  } catch (error) {
    console.error("Admin user suspension error:", error);
    return res.status(500).json({ message: "Could not update this user's suspension." });
  }
}

async function handleArchiveAdminUser(req, res) {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.userId, role: mongoose.trusted({ $in: ADMINISTRABLE_ROLES }), archivedAt: null },
      {
        $set: { archivedAt: new Date(), accountTokens: [] },
        ...adminActivity("archived", req.adminEmail),
      },
      { new: true, runValidators: true }
    ).select("fullName email role archivedAt");
    if (!user) return res.status(404).json({ message: "Active user account not found." });
    return res.json({ message: "Account archived. Booking history has been preserved." });
  } catch (error) {
    console.error("Admin user archive error:", error);
    return res.status(500).json({ message: "Could not archive this user account." });
  }
}

async function handleRestoreAdminUser(req, res) {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.userId, role: mongoose.trusted({ $in: ADMINISTRABLE_ROLES }), archivedAt: mongoose.trusted({ $ne: null }) },
      {
        $unset: { archivedAt: 1 },
        ...adminActivity("restored", req.adminEmail),
      },
      { new: true, runValidators: true }
    ).select("fullName email role isSuspended archivedAt");
    if (!user) return res.status(404).json({ message: "Archived user account not found." });
    return res.json({
      message: user.isSuspended ? "Account restored but remains suspended." : "Account restored.",
      isSuspended: user.isSuspended === true,
    });
  } catch (error) {
    console.error("Admin user restore error:", error);
    return res.status(500).json({ message: "Could not restore this user account." });
  }
}

async function handleRequestAdminPasswordReset(req, res) {
  try {
    if (!hasValidSmtpCredentials || !config.appUrl) {
      return res.status(503).json({ message: "Password reset email delivery is not configured." });
    }
    const user = await User.findOne({
      _id: req.params.userId,
      role: mongoose.trusted({ $in: ADMINISTRABLE_ROLES }),
      archivedAt: null,
    }).select("email +adminPasswordResetRequestedAt");
    if (!user) return res.status(404).json({ message: "Active user account not found." });
    if (user.adminPasswordResetRequestedAt && Date.now() - user.adminPasswordResetRequestedAt.getTime() < 60_000) {
      return res.status(429).json({ message: "A reset email was sent recently. Wait one minute before sending another." });
    }

    const code = String(randomInt(100000, 1000000));
    const tokenHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const resetRequest = await User.findOneAndUpdate(
      {
        _id: user._id,
        role: mongoose.trusted({ $in: ADMINISTRABLE_ROLES }),
        archivedAt: null,
        $or: [
          { adminPasswordResetRequestedAt: mongoose.trusted({ $exists: false }) },
          { adminPasswordResetRequestedAt: mongoose.trusted({ $lte: new Date(Date.now() - 60_000) }) },
        ],
      },
      {
        $set: {
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: expiresAt,
          adminPasswordResetRequestedAt: new Date(),
        },
        ...adminActivity("password_reset_requested", req.adminEmail),
      },
      { new: true }
    ).select("email");
    if (!resetRequest) {
      const stillActive = await User.exists({
        _id: user._id,
        role: mongoose.trusted({ $in: ADMINISTRABLE_ROLES }),
        archivedAt: null,
      });
      if (!stillActive) return res.status(404).json({ message: "Active user account not found." });
      return res.status(429).json({ message: "A reset email was sent recently. Wait one minute before sending another." });
    }
    try {
      await sendPasswordResetEmail(resetRequest.email, code);
    } catch (mailError) {
      await User.updateOne({ _id: user._id, passwordResetTokenHash: tokenHash }, {
        $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, adminPasswordResetRequestedAt: 1 },
      });
      throw mailError;
    }
    return res.json({ message: `A secure password reset code has been sent to ${resetRequest.email}.` });
  } catch (error) {
    console.error("Admin password reset email error:", error);
    return res.status(502).json({ message: "Could not send the password reset email. Please try again." });
  }
}

module.exports = {
  handleGetAdminAnalytics,
  handleGetAdminUsers,
  handleGetAdminUserDetails,
  handleSetAdminUserSuspension,
  handleArchiveAdminUser,
  handleRestoreAdminUser,
  handleRequestAdminPasswordReset,
};