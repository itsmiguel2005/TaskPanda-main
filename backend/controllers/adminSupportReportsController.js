const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const User = require("../models/User");
const Booking = require("../models/Booking");

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

async function handleUpdateAdminSupportReport(req, res) {
  const { conversationId, reportId } = req.params;
  if (!mongoose.isValidObjectId(conversationId) || !mongoose.isValidObjectId(reportId)) {
    return res.status(400).json({ message: "Choose a valid support report." });
  }

  const isResolving = req.body.action === "resolve";
  const update = isResolving
    ? {
      $set: {
        "supportReports.$.status": "resolved",
        "supportReports.$.resolvedAt": new Date(),
        "supportReports.$.resolvedBy": req.user._id,
      },
    }
    : {
      $set: { "supportReports.$.status": "open" },
      $unset: {
        "supportReports.$.resolvedAt": 1,
        "supportReports.$.resolvedBy": 1,
      },
    };

  try {
    const conversation = await Conversation.findOneAndUpdate(
      { _id: conversationId, "supportReports._id": reportId },
      update,
      { new: true, projection: { "supportReports.$": 1 } },
    ).lean();
    const report = conversation?.supportReports?.[0];
    if (!report) return res.status(404).json({ message: "That support report could not be found." });
    return res.json({ id: String(report._id), status: report.status, resolvedAt: report.resolvedAt || null });
  } catch (error) {
    console.error("Admin support report update failed:", error);
    return res.status(500).json({ message: "Could not update the support report." });
  }
}

module.exports = {
  SUPPORT_REPORT_PAGE_SIZE,
  buildSupportReportsPipeline,
  handleGetAdminSupportReports,
  handleUpdateAdminSupportReport,
};
