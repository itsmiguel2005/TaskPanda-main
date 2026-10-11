const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { sendPushNotification } = require("../services/oneSignal");

const PROVIDER_NO_SHOW_REPORT_PAGE_SIZE = 25;

function buildProviderNoShowReportFilter(status) {
  const filter = {
    status: "provider_no_show",
    providerNoShowReportedAt: mongoose.trusted({ $exists: true }),
  };
  if (status === "needs_review") {
    filter.$or = [
      { providerNoShowReviewStatus: mongoose.trusted({ $in: ["pending", "responded"] }) },
      { providerNoShowReviewStatus: mongoose.trusted({ $exists: false }) },
    ];
  } else if (status === "reviewed") {
    filter.providerNoShowReviewStatus = mongoose.trusted({ $in: ["confirmed", "dismissed"] });
  }
  return filter;
}

function personName(person, fallback) {
  return person?.fullName
    || [person?.firstName, person?.lastName].filter(Boolean).join(" ")
    || person?.username
    || person?.email
    || fallback;
}

function serializeProviderNoShowReport(booking) {
  return {
    id: String(booking._id),
    task: booking.repairDescription || "Service booking",
    serviceDate: booking.serviceDate || null,
    timeSlot: booking.timeSlot || "",
    reportedAt: booking.providerNoShowReportedAt || booking.createdAt || null,
    checkInAt: booking.noShowCheckInAt || null,
    checkInSentAt: booking.noShowCheckInSentAt || null,
    lateNotice: booking.lateNotice?.eta ? {
      eta: booking.lateNotice.eta,
      status: booking.lateNotice.status || "",
      notifiedAt: booking.lateNotice.notifiedAt || null,
    } : null,
    reviewStatus: booking.providerNoShowReviewStatus || "pending",
    client: personName(booking.clientId, "Client unavailable"),
    provider: personName(booking.providerId, "Provider unavailable"),
    providerResponse: booking.providerNoShowResponse?.note || "",
    providerRespondedAt: booking.providerNoShowResponse?.respondedAt || null,
    adminNotes: booking.providerNoShowAdminNotes || "",
    reviewedAt: booking.providerNoShowReviewedAt || null,
    reviewedBy: booking.providerNoShowReviewedBy || "",
  };
}

async function handleGetAdminProviderNoShowReports(req, res) {
  const status = req.query.status || "needs_review";
  const page = Math.min(10000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
  const filter = buildProviderNoShowReportFilter(status);
  try {
    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort({ providerNoShowReportedAt: -1, _id: -1 })
        .skip((page - 1) * PROVIDER_NO_SHOW_REPORT_PAGE_SIZE)
        .limit(PROVIDER_NO_SHOW_REPORT_PAGE_SIZE)
        .populate("clientId", "fullName firstName lastName username email")
        .populate("providerId", "fullName firstName lastName username email")
        .lean(),
      Booking.countDocuments(filter),
    ]);
    return res.json({
      reports: bookings.map(serializeProviderNoShowReport),
      pagination: {
        page,
        pageSize: PROVIDER_NO_SHOW_REPORT_PAGE_SIZE,
        total,
        pages: Math.max(1, Math.ceil(total / PROVIDER_NO_SHOW_REPORT_PAGE_SIZE)),
      },
    });
  } catch (error) {
    console.error("Admin provider no-show report lookup failed:", error);
    return res.status(500).json({ message: "Could not load provider no-show reports." });
  }
}

async function handleReviewAdminProviderNoShowReport(req, res) {
  const bookingId = String(req.params.bookingId || "");
  const action = req.body?.action;
  const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
  if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: "Choose a valid booking report." });
  if (!["confirm", "dismiss"].includes(action)) return res.status(400).json({ message: "Choose a valid review outcome." });

  const now = new Date();
  const filter = {
    _id: bookingId,
    status: "provider_no_show",
    providerNoShowReportedAt: mongoose.trusted({ $exists: true }),
    $or: [
      { providerNoShowReviewStatus: mongoose.trusted({ $in: ["pending", "responded"] }) },
      { providerNoShowReviewStatus: mongoose.trusted({ $exists: false }) },
    ],
  };
  const update = {
    $set: {
      providerNoShowReviewStatus: action === "confirm" ? "confirmed" : "dismissed",
      providerNoShowAdminNotes: notes,
      providerNoShowReviewedAt: now,
      providerNoShowReviewedBy: req.adminEmail,
      ...(action === "confirm" ? { providerReliabilityFlaggedAt: now } : {}),
    },
  };
  if (action === "dismiss") update.$unset = { providerReliabilityFlaggedAt: 1 };

  try {
    const booking = await Booking.findOneAndUpdate(filter, update, { new: true, runValidators: true })
      .select("_id providerId providerNoShowReviewStatus");
    if (!booking) {
      return res.status(409).json({ message: "This report has already been reviewed or is no longer available. Refresh the report list." });
    }
    try {
      await sendPushNotification({
        userIds: [String(booking.providerId)],
        title: action === "confirm" ? "No-show report reviewed" : "No-show report dismissed",
        body: action === "confirm"
          ? "An admin reviewed the client report and confirmed the no-show. Open the booking to see the review note."
          : "An admin reviewed and dismissed the client no-show report. Open the booking to see the review note.",
        url: `/provider-bookings?bookingId=${encodeURIComponent(String(booking._id))}`,
        data: { event: "booking.provider_no_show_reviewed", bookingId: String(booking._id), outcome: action },
      });
    } catch (pushError) {
      console.warn("Provider no-show review push delivery failed:", pushError.message);
    }
    return res.json({
      bookingId: String(booking._id),
      reviewStatus: booking.providerNoShowReviewStatus,
      message: action === "confirm"
        ? "The no-show report was confirmed and added to provider reliability review."
        : "The no-show report was dismissed and will not count as a confirmed reliability issue.",
    });
  } catch (error) {
    console.error("Admin provider no-show report review failed:", error);
    return res.status(500).json({ message: "Could not save the provider no-show review." });
  }
}

module.exports = {
  PROVIDER_NO_SHOW_REPORT_PAGE_SIZE,
  buildProviderNoShowReportFilter,
  serializeProviderNoShowReport,
  handleGetAdminProviderNoShowReports,
  handleReviewAdminProviderNoShowReport,
};
