const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Message = require("../models/Message");
const { sendPushNotification } = require("../services/oneSignal");

const SUPPORT_REPORT_PAGE_SIZE = 25;

function buildSupportReportsPipeline(status, page, pageSize = SUPPORT_REPORT_PAGE_SIZE) {
  const pipeline = [];
  if (status !== "all") pipeline.push({ $match: { "supportReports.status": status } });
  pipeline.push({ $unwind: "$supportReports" });
  if (status !== "all") pipeline.push({ $match: { "supportReports.status": status } });
  pipeline.push(
    { $sort: { "supportReports.createdAt": -1, _id: 1 } },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        reports: [
          { $skip: (page - 1) * pageSize },
          { $limit: pageSize },
          ...[
            ["reporter", "supportReports.reportedBy"],
            ["client", "clientId"],
            ["provider", "providerId"],
          ].map(([as, localField]) => ({
            $lookup: {
              from: User.collection.name,
              localField,
              foreignField: "_id",
              pipeline: [{ $project: { fullName: 1, username: 1, email: 1 } }],
              as,
            },
          })),
          {
            $lookup: {
              from: Booking.collection.name,
              localField: "bookingId",
              foreignField: "_id",
              pipeline: [{ $project: { repairDescription: 1, status: 1, createdAt: 1 } }],
              as: "booking",
            },
          },
          {
            $project: {
              conversationId: "$_id",
              reportId: "$supportReports._id",
              details: "$supportReports.details",
              reporterRole: "$supportReports.reporterRole",
              status: "$supportReports.status",
              createdAt: "$supportReports.createdAt",
              resolvedAt: "$supportReports.resolvedAt",
              reporter: { $arrayElemAt: ["$reporter", 0] },
              client: { $arrayElemAt: ["$client", 0] },
              provider: { $arrayElemAt: ["$provider", 0] },
              booking: { $arrayElemAt: ["$booking", 0] },
            },
          },
        ],
      },
    }
  );
  return pipeline;
}

function personName(person) {
  return person?.fullName || person?.username || person?.email || "Account unavailable";
}

async function handleGetAdminSupportReports(req, res) {
  try {
    const status = req.query.status || "open";
    const page = Math.min(10000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const [result] = await Conversation.aggregate(
      buildSupportReportsPipeline(status, page),
    );
    const reports = result?.reports || [];
    const total = Number(result?.metadata?.[0]?.total || 0);
    return res.json({
      reports: reports.map((report) => ({
        id: String(report.reportId),
        conversationId: String(report.conversationId),
        details: report.details,
        reporterRole: report.reporterRole,
        status: report.status,
        createdAt: report.createdAt,
        resolvedAt: report.resolvedAt || null,
        reporter: personName(report.reporter),
        client: personName(report.client),
        provider: personName(report.provider),
        bookingId: report.booking ? String(report.booking._id || "") : null,
        bookingTask: report.booking?.repairDescription || "",
        bookingStatus: report.booking?.status || "",
      })),
      pagination: {
        page,
        pageSize: SUPPORT_REPORT_PAGE_SIZE,
        total,
        pages: Math.ceil(total / SUPPORT_REPORT_PAGE_SIZE),
      },
    });
  } catch (error) {
    console.error("Admin support report lookup failed:", error);
    return res.status(500).json({ message: "Could not load support reports." });
  }
}

async function handleGetAdminSupportReportDetails(req, res) {
  const { conversationId, reportId } = req.params;
  if (!mongoose.isValidObjectId(conversationId) || !mongoose.isValidObjectId(reportId)) {
    return res.status(400).json({ message: "Choose a valid support report." });
  }

  try {
    const conversation = await Conversation.findById(conversationId)
      .select("clientId providerId bookingId supportReports")
      .lean();
    const report = conversation?.supportReports?.find((item) => String(item._id).toLowerCase() === reportId.toLowerCase());
    if (!conversation || !report) return res.status(404).json({ message: "That support report could not be found." });

    const reportedUserId = report.reporterRole === "client" ? conversation.providerId : conversation.clientId;
    const reporterId = report.reportedBy;
    const [reporter, reportedUser, booking, transcript, riskRows] = await Promise.all([
      User.findById(reporterId).select("fullName username email role").lean(),
      User.findById(reportedUserId).select("fullName username email role isSuspended").lean(),
      Booking.findById(conversation.bookingId).select("repairDescription status createdAt").lean(),
      Message.find(mongoose.trusted({
        conversationId: conversation._id,
        createdAt: mongoose.trusted({ $lte: report.createdAt }),
      }))
        .select("sender senderRole text eventType eventData createdAt")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      Conversation.aggregate([
        { $unwind: "$supportReports" },
        {
          $match: {
            $or: [
              { providerId: reportedUserId, "supportReports.reporterRole": "client" },
              { clientId: reportedUserId, "supportReports.reporterRole": "provider" },
            ],
          },
        },
        { $count: "count" },
      ]),
    ]);

    const displayName = (person) => person?.fullName || person?.username || person?.email || "Account unavailable";
    return res.json({
      id: String(report._id),
      conversationId: String(conversation._id),
      details: report.details,
      reporterRole: report.reporterRole,
      status: report.status,
      createdAt: report.createdAt,
      resolvedAt: report.resolvedAt || null,
      reporter: { id: String(reporterId), name: displayName(reporter), role: reporter?.role || report.reporterRole, email: reporter?.email || "" },
      reportedUser: {
        id: String(reportedUserId),
        name: displayName(reportedUser),
        role: reportedUser?.role || (report.reporterRole === "client" ? "provider" : "client"),
        email: reportedUser?.email || "",
        isSuspended: reportedUser?.isSuspended === true,
      },
      booking: {
        id: String(conversation.bookingId),
        task: booking?.repairDescription || "",
        status: booking?.status || "",
      },
      risk: { reportCount: Number(riskRows[0]?.count || 0) },
      adminNotes: report.adminNotes || "",
      transcript: transcript.reverse().map((message) => ({
        id: String(message._id),
        senderRole: message.senderRole,
        text: message.text || "",
        eventType: message.eventType || "",
        createdAt: message.createdAt,
      })),
    });
  } catch (error) {
    console.error("Admin support report details lookup failed:", error);
    return res.status(500).json({ message: "Could not load support report details." });
  }
}

async function handleUpdateAdminSupportReport(req, res) {
  const { conversationId, reportId } = req.params;
  if (!mongoose.isValidObjectId(conversationId) || !mongoose.isValidObjectId(reportId)) {
    return res.status(400).json({ message: "Choose a valid support report." });
  }

  try {
    const action = req.body.action;
    const now = new Date();
    const historyAction = {
      resolve: "resolved",
      reopen: "reopened",
      save_notes: "notes_updated",
      suspend: "suspended",
      send_warning: "warned",
    }[action];
    const noteText = typeof req.body.notes === "string" ? req.body.notes.trim() : "";
    let update;
    let warningPushDelivered = false;

    if (action === "resolve") {
      update = {
        $set: {
          "supportReports.$.status": "resolved",
          "supportReports.$.resolvedAt": now,
          "supportReports.$.resolvedByAdmin": req.adminEmail,
          ...(req.body.notes !== undefined ? {
            "supportReports.$.adminNotes": noteText,
            "supportReports.$.adminNotesUpdatedAt": now,
            "supportReports.$.adminNotesUpdatedBy": req.adminEmail,
          } : {}),
        },
      };
    } else if (action === "reopen") {
      update = {
        $set: { "supportReports.$.status": "open" },
        $unset: { "supportReports.$.resolvedAt": 1, "supportReports.$.resolvedByAdmin": 1 },
      };
    } else if (action === "save_notes") {
      update = {
        $set: {
          "supportReports.$.adminNotes": noteText,
          "supportReports.$.adminNotesUpdatedAt": now,
          "supportReports.$.adminNotesUpdatedBy": req.adminEmail,
        },
      };
    } else {
      const reportConversation = await Conversation.findOne({
        _id: conversationId,
        "supportReports._id": reportId,
      }).select("clientId providerId supportReports.$").lean();
      const report = reportConversation?.supportReports?.[0];
      if (!report) return res.status(404).json({ message: "That support report could not be found." });
      const reportedUserId = report.reporterRole === "client" ? reportConversation.providerId : reportConversation.clientId;
      const reason = String(req.body.reason || "").trim();
      const userUpdate = action === "suspend"
        ? {
          $set: { isSuspended: true, suspendedAt: now, accountTokens: [] },
          $push: {
            adminActivity: {
              $each: [{ action: "suspended", actorEmail: req.adminEmail, reason, createdAt: now }],
              $slice: -50,
            },
          },
        }
        : {
          $push: {
            verificationNotifications: {
              $each: [{
                title: "Account conduct warning",
                message: reason,
                href: report.reporterRole === "client" ? "/provider-profile" : "/profile",
                createdAt: now,
              }],
              $slice: -50,
            },
            adminActivity: {
              $each: [{ action: "warned", actorEmail: req.adminEmail, reason, createdAt: now }],
              $slice: -50,
            },
          },
        };
      const reportedUser = await User.findOneAndUpdate(
        { _id: reportedUserId, role: mongoose.trusted({ $in: ["client", "provider"] }), archivedAt: null },
        userUpdate,
        { new: true, runValidators: true },
      ).select("_id role email isSuspended");
      if (!reportedUser) return res.status(404).json({ message: "The reported account is no longer active." });

      if (action === "send_warning") {
        try {
          const pushResult = await sendPushNotification({
            userIds: [String(reportedUser._id)],
            title: "TaskPanda account warning",
            body: reason,
            url: report.reporterRole === "client" ? "/provider-profile" : "/profile",
            data: { event: "account.warning", reportId, userId: String(reportedUser._id) },
            name: "TaskPanda account warning",
          });
          warningPushDelivered = Boolean(pushResult?.id);
        } catch (pushError) {
          console.warn("Support report warning push delivery failed; the in-app warning was saved:", pushError.message);
        }
      }
      update = {
        $push: {
          "supportReports.$.moderationHistory": {
            $each: [{ action: historyAction, reason, actorEmail: req.adminEmail, createdAt: now }],
            $slice: -50,
          },
        },
      };
    }

    if (action !== "suspend" && action !== "send_warning") {
      update.$push = {
        "supportReports.$.moderationHistory": {
          $each: [{
            action: historyAction,
            reason: action === "save_notes" || action === "resolve" ? noteText : "",
            actorEmail: req.adminEmail,
            createdAt: now,
          }],
          $slice: -50,
        },
      };
    }

    const conversation = await Conversation.findOneAndUpdate(
      { _id: conversationId, "supportReports._id": reportId },
      update,
      { new: true, runValidators: true, projection: { "supportReports.$": 1 } },
    ).lean();
    const report = conversation?.supportReports?.[0];
    if (!report) return res.status(404).json({ message: "That support report could not be found." });
    return res.json({
      id: String(report._id),
      status: report.status,
      resolvedAt: report.resolvedAt || null,
      adminNotes: report.adminNotes || "",
      message: action === "suspend" ? "Reported account suspended and active sessions revoked."
        : action === "send_warning" ? warningPushDelivered
          ? "In-app warning saved and push notification delivered."
          : "In-app warning saved. Push delivery was unavailable."
        : action === "save_notes" ? "Admin notes saved."
        : undefined,
    });
  } catch (error) {
    console.error("Admin support report update failed:", error);
    return res.status(500).json({ message: "Could not update the support report." });
  }
}

module.exports = {
  SUPPORT_REPORT_PAGE_SIZE,
  buildSupportReportsPipeline,
  handleGetAdminSupportReports,
  handleGetAdminSupportReportDetails,
  handleUpdateAdminSupportReport,
};
