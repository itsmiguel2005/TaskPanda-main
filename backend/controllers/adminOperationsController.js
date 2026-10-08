const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Broadcast = require("../models/Broadcast");
const User = require("../models/User");
const { getTransactionAmounts } = require("../services/financialLedger");
const { hasOneSignalCredentials, sendPushNotification } = require("../services/oneSignal");
const { getGlobalSettings, updateGlobalSettings } = require("../services/systemSettings");

const COMPLETED_STATUSES = ["complete", "closed", "settled", "Completed", "Settled"];
const VOUCHER_ORIGINS = ["referral", "stamp-card", "promotion"];
const TRANSACTION_PAGE_SIZE = 25;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function completedDateFilter(from, to) {
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) {
    const until = new Date(to);
    until.setUTCHours(23, 59, 59, 999);
    range.$lte = until;
  }
  if (!Object.keys(range).length) return null;
  return {
    $or: ["settledAt", "workCompletedAt", "completionSubmittedAt", "updatedAt", "createdAt"]
      .map((field) => ({ [field]: mongoose.trusted(range) })),
  };
}

async function handleGetAdminTransactions(req, res) {
  try {
    const page = Math.min(10000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const query = { status: mongoose.trusted({ $in: COMPLETED_STATUSES }) };
    const clauses = [];
    const search = String(req.query.q || "").trim().slice(0, 100);

    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      const matchingUsers = await User.find({
        role: mongoose.trusted({ $in: ["client", "provider"] }),
        $or: [{ fullName: pattern }, { username: pattern }, { email: pattern }],
      }).select("_id role").lean();
      const searchTerms = [
        { repairDescription: pattern },
        { clientId: mongoose.trusted({ $in: matchingUsers.filter((user) => user.role !== "provider").map((user) => user._id) }) },
        { providerId: mongoose.trusted({ $in: matchingUsers.filter((user) => user.role === "provider").map((user) => user._id) }) },
      ];
      if (mongoose.isValidObjectId(search)) searchTerms.push({ _id: new mongoose.Types.ObjectId(search) });
      clauses.push({ $or: searchTerms });
    }

    const dateFilter = completedDateFilter(req.query.from, req.query.to);
    if (dateFilter) clauses.push(dateFilter);
    if (clauses.length) query.$and = clauses;

    const offset = (page - 1) * TRANSACTION_PAGE_SIZE;
    const [bookings, summaryRows, total] = await Promise.all([
      Booking.find(query)
        .sort({ settledAt: -1, workCompletedAt: -1, updatedAt: -1, _id: -1 })
        .skip(offset)
        .limit(TRANSACTION_PAGE_SIZE)
        .populate("clientId", "fullName firstName lastName username email")
        .populate("providerId", "fullName firstName lastName username email")
        .lean(),
      Booking.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            grossTaskValue: { $sum: { $ifNull: ["$offeredPrice", 0] } },
            providerLaborEarnings: { $sum: { $ifNull: ["$offeredPrice", 0] } },
            travelFees: { $sum: { $ifNull: ["$travelFeeBeforeDiscount", { $ifNull: ["$travelFee", 0] }] } },
            voucherDeductions: { $sum: { $ifNull: ["$travelFeeDiscount", 0] } },
            tips: { $sum: { $ifNull: ["$tipAmount", 0] } },
            clientPaidTotal: {
              $sum: {
                $add: [
                  { $ifNull: ["$offeredPrice", 0] },
                  { $ifNull: ["$travelFee", 0] },
                  { $ifNull: ["$tipAmount", 0] },
                ],
              },
            },
          },
        },
      ]),
      Booking.countDocuments(query),
    ]);
    const summary = summaryRows[0] || {
      count: 0,
      grossTaskValue: 0,
      providerLaborEarnings: 0,
      travelFees: 0,
      voucherDeductions: 0,
      tips: 0,
      clientPaidTotal: 0,
    };

    return res.json({
      transactions: bookings.map((booking) => {
        const client = booking.clientId || {};
        const provider = booking.providerId || {};
        const completedAt = booking.settledAt || booking.workCompletedAt || booking.completionSubmittedAt || booking.updatedAt || booking.createdAt;
        const amounts = getTransactionAmounts(booking);
        return {
          id: String(booking._id),
          task: booking.repairDescription || "Completed task",
          client: client.fullName || [client.firstName, client.lastName].filter(Boolean).join(" ") || client.username || client.email || "Client unavailable",
          provider: provider.fullName || [provider.firstName, provider.lastName].filter(Boolean).join(" ") || provider.username || provider.email || "Provider unavailable",
          status: booking.status,
          completedAt,
          distanceKm: Number(booking.travelDistanceKm || 0),
          ...amounts,
        };
      }),
      summary: {
        count: Number(summary.count || 0),
        grossTaskValue: Number(summary.grossTaskValue || 0),
        providerLaborEarnings: Number(summary.providerLaborEarnings || 0),
        travelFees: Number(summary.travelFees || 0),
        voucherDeductions: Number(summary.voucherDeductions || 0),
        tips: Number(summary.tips || 0),
        clientPaidTotal: Number(summary.clientPaidTotal || 0),
      },
      pagination: { page, pageSize: TRANSACTION_PAGE_SIZE, total, pages: Math.ceil(total / TRANSACTION_PAGE_SIZE) },
    });
  } catch (error) {
    console.error("Admin transaction ledger error:", error);
    return res.status(500).json({ message: "Could not load the transaction ledger." });
  }
}

async function handleGetAdminRewardAnalytics(_req, res) {
  try {
    const now = new Date();
    const [voucherGroups, clientStats, stampProgressRows, referralRows] = await Promise.all([
      User.aggregate([
        { $match: { role: "client", archivedAt: null, vouchers: { $exists: true, $ne: [] } } },
        { $unwind: "$vouchers" },
        {
          $addFields: {
            effectiveVoucherStatus: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$vouchers.status", "redeemed"] },
                    { $ne: [{ $ifNull: ["$vouchers.expiresAt", null] }, null] },
                    { $lte: ["$vouchers.expiresAt", now] },
                  ],
                },
                "expired",
                "$vouchers.status",
              ],
            },
          },
        },
        {
          $group: {
            _id: { origin: "$vouchers.origin", status: "$effectiveVoucherStatus" },
            count: { $sum: 1 },
            value: { $sum: { $ifNull: ["$vouchers.amount", 0] } },
          },
        },
      ]),
      User.aggregate([
        { $match: { role: "client", archivedAt: null } },
        {
          $group: {
            _id: null,
            clients: { $sum: 1 },
            referredClients: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$referredBy", null] }, null] }, 1, 0] } },
            referralCodeOwners: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$referralCode", ""] }, ""] }, 1, 0] } },
            stampsInProgress: {
              $sum: {
                $cond: [
                  { $and: [{ $gt: [{ $ifNull: ["$stampProgress", 0] }, 0] }, { $lt: [{ $ifNull: ["$stampProgress", 0] }, 5] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      User.aggregate([
        { $match: { role: "client", archivedAt: null } },
        { $group: { _id: { $ifNull: ["$stampProgress", 0] }, clients: { $sum: 1 } } },
      ]),
      User.aggregate([
        { $match: { role: "client", archivedAt: null, referredBy: { $ne: null } } },
        { $group: { _id: "$referredBy", uses: { $sum: 1 } } },
        { $sort: { uses: -1, _id: 1 } },
        { $limit: 8 },
        {
          $lookup: {
            from: User.collection.name,
            localField: "_id",
            foreignField: "_id",
            as: "referrer",
          },
        },
        { $unwind: { path: "$referrer", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            uses: 1,
            code: "$referrer.referralCode",
            referrerName: {
              $ifNull: [
                "$referrer.fullName",
                { $ifNull: ["$referrer.username", "$referrer.email"] },
              ],
            },
          },
        },
      ]),
    ]);

    const origins = new Map(VOUCHER_ORIGINS.map((origin) => [origin, { issued: 0, active: 0, redeemed: 0, expired: 0, value: 0 }]));
    for (const group of voucherGroups) {
      const origin = origins.get(group._id.origin);
      if (!origin) continue;
      origin.issued += group.count;
      origin.value += group.value;
      if (["active", "redeemed", "expired"].includes(group._id.status)) origin[group._id.status] += group.count;
    }

    const totals = [...origins.values()].reduce((result, origin) => {
      result.issued += origin.issued;
      result.active += origin.active;
      result.redeemed += origin.redeemed;
      result.expired += origin.expired;
      result.value += origin.value;
      return result;
    }, { issued: 0, active: 0, redeemed: 0, expired: 0, value: 0 });
    const clients = clientStats[0] || {
      clients: 0,
      referredClients: 0,
      referralCodeOwners: 0,
      stampsInProgress: 0,
    };
    const stampCounts = new Map(stampProgressRows.map((row) => [Number(row._id), Number(row.clients)]));
    const stampProgressDistribution = [1, 2, 3, 4].map((stamps) => ({
      stamps,
      clients: stampCounts.get(stamps) || 0,
    }));

    return res.json({
      summary: {
        totalClients: Number(clients.clients || 0),
        referralUses: Number(clients.referredClients || 0),
        referralCodeOwners: Number(clients.referralCodeOwners || 0),
        vouchersIssued: totals.issued,
        activeVouchers: totals.active,
        redeemedVouchers: totals.redeemed,
        expiredPerks: totals.expired,
        redemptionRate: totals.issued ? Number(((totals.redeemed / totals.issued) * 100).toFixed(1)) : 0,
        activeStampRewards: origins.get("stamp-card").active,
        stampsInProgress: Number(clients.stampsInProgress || 0),
      },
      voucherBreakdown: VOUCHER_ORIGINS.map((origin) => ({ origin, ...origins.get(origin) })),
      stampProgressDistribution,
      topReferralCodes: referralRows.map((row) => ({
        code: row.code || "Code unavailable",
        referrer: row.referrerName || "Account unavailable",
        uses: Number(row.uses || 0),
      })),
    });
  } catch (error) {
    console.error("Admin reward analytics error:", error);
    return res.status(500).json({ message: "Could not load voucher analytics." });
  }
}

async function handleGetAdminSystemSettings(_req, res) {
  try {
    return res.json({
      settings: await getGlobalSettings(),
      broadcastConfigured: hasOneSignalCredentials(),
    });
  } catch (error) {
    console.error("Admin system settings read error:", error);
    return res.status(500).json({ message: "Could not load global system settings." });
  }
}

async function handleUpdateAdminSystemSettings(req, res) {
  try {
    const settings = await updateGlobalSettings(req.body, req.adminEmail);
    return res.json({ message: "Global settings saved.", settings });
  } catch (error) {
    console.error("Admin system settings update error:", error);
    return res.status(500).json({ message: "Could not save global system settings." });
  }
}

async function handleAdminBroadcast(req, res) {
  try {
    const broadcast = await Broadcast.create({
      title: req.body.title,
      message: req.body.message,
      createdBy: req.adminEmail,
    });

    if (!hasOneSignalCredentials()) {
      return res.status(201).json({
        message: "Broadcast added to the in-app notifications. Push delivery is not configured.",
        broadcastId: String(broadcast._id),
      });
    }

    try {
      const result = await sendPushNotification({
        roles: ["client", "provider"],
        title: req.body.title,
        body: req.body.message,
        name: "TaskPanda urgent broadcast",
        data: { event: "system.broadcast", broadcastId: String(broadcast._id), sentBy: req.adminEmail },
      });
      if (!result?.id) {
        return res.status(201).json({
          message: "Broadcast added to the in-app notifications, but OneSignal did not find any push subscriptions to notify.",
          broadcastId: String(broadcast._id),
        });
      }
      return res.status(201).json({
        message: "Broadcast added to in-app notifications and sent as a browser push notification.",
        notificationId: result.id,
        broadcastId: String(broadcast._id),
      });
    } catch (pushError) {
      console.error("Admin urgent broadcast push delivery error:", pushError);
      return res.status(201).json({
        message: `Broadcast added to in-app notifications, but push delivery failed: ${pushError.message || "Unknown OneSignal error."}`,
        broadcastId: String(broadcast._id),
      });
    }
  } catch (error) {
    console.error("Admin urgent broadcast error:", error);
    return res.status(500).json({ message: "Could not save the urgent broadcast." });
  }
}

module.exports = {
  completedDateFilter,
  handleGetAdminTransactions,
  handleGetAdminRewardAnalytics,
  handleGetAdminSystemSettings,
  handleUpdateAdminSystemSettings,
  handleAdminBroadcast,
};
