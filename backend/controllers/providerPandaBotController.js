const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const User = require("../models/User");
const { handleUpdateBookingStatus } = require("./bookingController");
const {
  buildFriendlyOpening,
  getFirstName,
  hasPriorAssistantMessage,
  hasRecentAssistantIntroduction,
  isGreetingOrOpenQuestion,
  isOpenHelpQuestion,
} = require("./pandaBotController");
const {
  normalizeName,
  parseRequestedServiceDate,
} = require("../services/pandaBot");

const PH_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;
const PENDING_STATUSES = ["pending", "Pending Request", "PENDING"];
const ACTIVE_STATUSES = ["approved", "en_route", "in_progress", "Confirmed", "On the Way", "In Progress", "APPROVED", "ON_THE_WAY", "IN_PROGRESS"];
const EARNING_STATUSES = ["complete", "closed", "settled", "Completed", "Settled"];
const STATUS_LABELS = {
  pending: "Pending approval",
  "pending request": "Pending approval",
  approved: "Confirmed",
  confirmed: "Confirmed",
  en_route: "On the way",
  "on the way": "On the way",
  on_the_way: "On the way",
  in_progress: "In progress",
  "in progress": "In progress",
  complete: "Completed",
  completed: "Completed",
  closed: "Completed",
  settled: "Settled",
};
const STATUS_UPDATE_STOP_WORDS = new Set([
  "mark", "set", "update", "change", "move", "put", "start", "begin", "heading",
  "job", "booking", "task", "client", "the", "to", "on", "way", "my", "in",
  "progress", "work", "out", "en", "route",
]);

function getFriendlyAddress(user, conversationHistory = []) {
  const firstName = getFirstName(user);
  return firstName && !hasPriorAssistantMessage(conversationHistory) ? `Hey, ${firstName}! ` : "";
}

function getPhilippinePeriodBounds(now = new Date()) {
  const localDate = new Date(now.getTime() + PH_TIMEZONE_OFFSET_MS);
  const year = localDate.getUTCFullYear();
  const month = localDate.getUTCMonth();
  const day = localDate.getUTCDate();
  const startOfToday = Date.UTC(year, month, day);
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  const startOfWeek = startOfToday - daysSinceMonday * 24 * 60 * 60 * 1000;
  return {
    today: {
      from: new Date(startOfToday - PH_TIMEZONE_OFFSET_MS),
      until: new Date(startOfToday + 24 * 60 * 60 * 1000 - PH_TIMEZONE_OFFSET_MS),
      serviceDateFrom: new Date(startOfToday),
      serviceDateUntil: new Date(startOfToday + 24 * 60 * 60 * 1000),
    },
    tomorrow: {
      from: new Date(startOfToday + 24 * 60 * 60 * 1000 - PH_TIMEZONE_OFFSET_MS),
      until: new Date(startOfToday + 2 * 24 * 60 * 60 * 1000 - PH_TIMEZONE_OFFSET_MS),
      serviceDateFrom: new Date(startOfToday + 24 * 60 * 60 * 1000),
      serviceDateUntil: new Date(startOfToday + 2 * 24 * 60 * 60 * 1000),
    },
    week: {
      from: new Date(startOfWeek - PH_TIMEZONE_OFFSET_MS),
      until: new Date(startOfWeek + 7 * 24 * 60 * 60 * 1000 - PH_TIMEZONE_OFFSET_MS),
      serviceDateFrom: new Date(startOfWeek),
      serviceDateUntil: new Date(startOfWeek + 7 * 24 * 60 * 60 * 1000),
    },
  };
}

function buildProviderBookingFilter(providerId, statuses, range) {
  const filter = {
    providerId,
    status: mongoose.trusted({ $in: statuses }),
  };
  if (range) {
    filter.serviceDate = mongoose.trusted({
      $gte: range.serviceDateFrom || range.from,
      $lt: range.serviceDateUntil || range.until,
    });
  }
  return filter;
}

function formatMoney(amount) {
  return Number(amount || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });
}

function formatScheduledTime(booking) {
  const date = booking.serviceDate ? new Date(booking.serviceDate) : null;
  const dateLabel = date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(date)
    : "Schedule unavailable";
  return `${dateLabel}${booking.timeSlot ? ` · ${booking.timeSlot}` : ""}`;
}

function getClientName(booking) {
  const client = booking.clientId;
  if (client && typeof client === "object") {
    return client.fullName || client.username || "Client";
  }
  return "Client";
}

function getStatusLabel(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return STATUS_LABELS[normalized] ||
    normalized.replace(/[_\s]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) ||
    "Status unavailable";
}

function formatProviderJob(booking) {
  return [
    `### ${getClientName(booking)} — ${getStatusLabel(booking.status)}`,
    `- **Task:** ${booking.repairDescription || "Task details unavailable"}`,
    `- **Scheduled:** ${formatScheduledTime(booking)}`,
    `- **Location:** ${booking.address || "Address to be confirmed"}`,
    `- **Booking ID:** \`${booking._id}\``,
  ].join("\n");
}

function formatJobList(bookings, emptyMessage) {
  if (!bookings.length) return emptyMessage;
  return bookings.map(formatProviderJob).join("\n\n");
}

async function getProviderJobs(providerId, statuses, range) {
  const filter = buildProviderBookingFilter(providerId, statuses, range);
  if (statuses === PENDING_STATUSES) {
    filter.$or = mongoose.trusted([
      { requestExpiresAt: mongoose.trusted({ $exists: false }) },
      { requestExpiresAt: null },
      { requestExpiresAt: mongoose.trusted({ $gt: new Date() }) },
    ]);
  }
  return Booking.find(filter)
    .select("_id clientId repairDescription status serviceDate timeSlot address requestExpiresAt")
    .populate({ path: "clientId", select: "fullName username" })
    .sort({ serviceDate: 1, timeSlot: 1 })
    .lean();
}

function getEffectiveEarningDate(booking) {
  const normalizedStatus = String(booking.status || "").toLowerCase();
  const timestamp = normalizedStatus === "settled"
    ? booking.settledAt || booking.workCompletedAt || booking.completionSubmittedAt || booking.serviceDate
    : booking.workCompletedAt || booking.completionSubmittedAt || booking.serviceDate;
  const date = timestamp ? new Date(timestamp) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function getBookingAmount(booking) {
  return Math.max(0, Number(booking.offeredPrice) || 0) +
    Math.max(0, Number(booking.travelFee) || 0) +
    Math.max(0, Number(booking.tipAmount) || 0);
}

function isCashCollectionConfirmed(booking) {
  return Boolean(
    (booking.cashPaidConfirmedAt || booking.clientConfirmedCash) &&
    (booking.cashReceivedConfirmedAt || booking.providerConfirmedCash)
  );
}

function summarizeEarnings(bookings, range) {
  const inRangeBookings = bookings.filter((booking) => {
    const activityDate = getEffectiveEarningDate(booking);
    return activityDate && activityDate >= range.from && activityDate < range.until;
  });
  const confirmed = inRangeBookings.filter(isCashCollectionConfirmed);
  const awaitingConfirmation = inRangeBookings.filter((booking) => !isCashCollectionConfirmed(booking));
  return {
    total: inRangeBookings.reduce((sum, booking) => sum + getBookingAmount(booking), 0),
    confirmed: confirmed.reduce((sum, booking) => sum + getBookingAmount(booking), 0),
    awaitingConfirmation: awaitingConfirmation.reduce((sum, booking) => sum + getBookingAmount(booking), 0),
    awaitingCount: awaitingConfirmation.length,
  };
}

function formatEarningsSummary(bookings, bounds) {
  const today = summarizeEarnings(bookings, bounds.today);
  const week = summarizeEarnings(bookings, bounds.week);
  return [
    "## Cash earnings",
    `- **Today:** ${formatMoney(today.total)} (${formatMoney(today.confirmed)} confirmed; ${formatMoney(today.awaitingConfirmation)} awaiting confirmation across ${today.awaitingCount} booking${today.awaitingCount === 1 ? "" : "s"})`,
    `- **This week:** ${formatMoney(week.total)} (${formatMoney(week.confirmed)} confirmed; ${formatMoney(week.awaitingConfirmation)} awaiting confirmation across ${week.awaitingCount} booking${week.awaitingCount === 1 ? "" : "s"})`,
    "",
    "Totals include completed or settled cash bookings. Collection is confirmed when both client payment and provider receipt are confirmed.",
  ].join("\n");
}

function getStatusUpdateIntent(message) {
  const hasUpdateAction = /\b(?:mark|set|update|change|move|put|start|begin|heading)\b/i.test(message);
  if (!hasUpdateAction) return null;
  if (/\b(?:on the way|on my way|heading out|en route)\b/i.test(message)) {
    return { status: "en_route", sourceStatuses: ["approved", "Confirmed"] };
  }
  if (/\b(?:in progress|start work|started work|begin work|began work)\b/i.test(message)) {
    return { status: "in_progress", sourceStatuses: ["en_route", "On the Way"] };
  }
  return null;
}

function findNamedBooking(bookings, message) {
  const normalizedMessage = ` ${normalizeName(message)} `;
  const fullNameMatches = bookings.filter((booking) => {
    const clientName = normalizeName(getClientName(booking));
    return clientName && normalizedMessage.includes(` ${clientName} `);
  });
  if (fullNameMatches.length) return fullNameMatches;

  const searchableTerms = new Set(normalizedMessage
    .split(" ")
    .filter((term) => term.length > 1 && !STATUS_UPDATE_STOP_WORDS.has(term)));
  return bookings.filter((booking) => {
    const clientName = normalizeName(getClientName(booking));
    return clientName.split(" ").some((part) => searchableTerms.has(part));
  });
}

function createResponseCapture() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function handleProviderStatusUpdate(req, res, message, intent) {
  const candidates = await Booking.find(buildProviderBookingFilter(req.user._id, intent.sourceStatuses))
    .select("_id clientId")
    .populate({ path: "clientId", select: "fullName username" })
    .lean();
  const idMatch = message.match(/\b[a-f\d]{24}\b/i);
  const matchedBookings = idMatch
    ? candidates.filter((booking) => String(booking._id) === idMatch[0])
    : findNamedBooking(candidates, message);

  if (matchedBookings.length !== 1) {
    const choices = matchedBookings.length
      ? matchedBookings.map((booking) => `${getClientName(booking)} (\`${booking._id}\`)`).join(", ")
      : candidates.map((booking) => `${getClientName(booking)} (\`${booking._id}\`)`).join(", ");
    const messageText = matchedBookings.length > 1
      ? `I found multiple matching jobs: ${choices}. Please specify the client name or booking ID.`
      : candidates.length
        ? `Which client’s job should I update? Matching jobs: ${choices}. Please name the client or provide the booking ID.`
        : "There are no jobs in a status that can be changed to that stage.";
    return res.json({
      type: "text",
      response: `${getFriendlyAddress(req.user, req.body?.conversationHistory)}${messageText}`,
    });
  }

  const booking = matchedBookings[0];
  const capture = createResponseCapture();
  await handleUpdateBookingStatus({
    ...req,
    params: { ...req.params, id: String(booking._id) },
    body: { status: intent.status },
  }, capture);

  if (capture.statusCode >= 400 || !capture.body?.booking) {
    return res.status(capture.statusCode || 500).json({
      message: capture.body?.message || "Could not update that job status.",
    });
  }
  const updatedBooking = capture.body.booking;
  return res.json({
    type: "text",
    response: `${getFriendlyAddress(req.user, req.body?.conversationHistory)}I’ve updated **${updatedBooking.client || getClientName(booking)}’s** job to **${getStatusLabel(updatedBooking.status)}**.\n\n${updatedBooking.task || updatedBooking.repairDescription || ""}`,
  });
}

function isIncomingJobsRequest(message) {
  return /\b(?:pending|incoming|awaiting approval|approval requests?|new job requests?)\b/i.test(message);
}

function isActiveJobsRequest(message) {
  if (/^\s*(?:(?:and|then)\s+)?(?:how|what) about\s+(?:today|tomorrow|bukas|ngayon|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(message) ||
    /^\s*any for\s+(?:today|tomorrow|bukas|ngayon|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(message)) {
    return false;
  }
  return /\b(?:active jobs?|my jobs?|my bookings?|schedule|scheduled jobs?|upcoming jobs?|today|tomorrow|bukas|ngayon|this week|next week|week ahead|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(message);
}

function getProviderScheduleRequest(message, conversationHistory, bounds, now = new Date()) {
  const latestAssistant = Array.isArray(conversationHistory)
    ? [...conversationHistory].reverse().find((entry) => entry?.role === "assistant")
    : null;
  const isContextFollowUp = latestAssistant?.contextIntent === "provider_schedule" ||
    /\b(?:schedule for|schedule today|active jobs scheduled)\b/i.test(latestAssistant?.text || "");
  const isDateFollowUp = isContextFollowUp &&
    /\b(?:today|tomorrow|bukas|ngayon|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(message);
  if (!isActiveJobsRequest(message) && !isDateFollowUp) return null;

  const normalized = message.toLowerCase();
  if (/\bnext week\b/.test(normalized)) {
    const day = 7 * 24 * 60 * 60 * 1000;
    return {
      range: {
        serviceDateFrom: new Date(bounds.week.serviceDateFrom.getTime() + day),
        serviceDateUntil: new Date(bounds.week.serviceDateUntil.getTime() + day),
      },
      label: "next week",
    };
  }
  if (/\bthis week\b|\bweek ahead\b|\bcoming up\b|\bupcoming\b/.test(normalized)) {
    return {
      range: {
        from: bounds.today.from,
        until: bounds.week.until,
        serviceDateFrom: bounds.today.serviceDateFrom,
        serviceDateUntil: bounds.week.serviceDateUntil,
      },
      label: "this week",
    };
  }
  if (/\b(?:tomorrow|bukas)\b/.test(normalized)) {
    return { range: bounds.tomorrow, label: "tomorrow" };
  }
  if (/\b(?:today|ngayon)\b/.test(normalized)) {
    return { range: bounds.today, label: "today" };
  }
  const requestedDate = parseRequestedServiceDate(message, now);
  if (requestedDate) {
    const serviceDateFrom = new Date(`${requestedDate}T00:00:00.000Z`);
    return {
      range: {
        serviceDateFrom,
        serviceDateUntil: new Date(serviceDateFrom.getTime() + 24 * 60 * 60 * 1000),
      },
      label: new Intl.DateTimeFormat("en-PH", {
        weekday: "long",
        timeZone: "Asia/Manila",
      }).format(serviceDateFrom),
    };
  }
  return { range: bounds.today, label: "today" };
}

function isEarningsRequest(message) {
  return /\b(?:earning|earnings|income|cash collection|cash collected|payment confirmation|unconfirmed cash|confirmed cash)\b/i.test(message);
}

function isProviderProfileRequest(message) {
  return /\b(?:rating|ratings|reviews?|verification|verified|identity|profile|account status)\b/i.test(message);
}

async function getProviderProfile(providerId) {
  return User.findOne({ _id: providerId, role: "provider" })
    .select("fullName professions profileImage averageRating totalReviews isVerified verificationStatus")
    .lean();
}

function getProviderVerificationStatus(provider) {
  const normalized = String(provider.verificationStatus || "").trim().toUpperCase();
  if (provider.isVerified === true || normalized === "VERIFIED" || normalized === "VERIFICATION_APPROVED") {
    return "VERIFICATION_APPROVED";
  }
  if (normalized.includes("PENDING") || normalized.includes("REVIEW")) return "VERIFICATION_PENDING";
  if (normalized.includes("REJECT")) return "VERIFICATION_REJECTED";
  return "VERIFICATION_UNVERIFIED";
}

function buildProviderProfileCardData(provider) {
  const ratingValue = Number(provider.averageRating);
  const reviewCountValue = Number(provider.totalReviews);
  return {
    name: provider.fullName || "Name not set",
    profession: Array.isArray(provider.professions) && provider.professions.length
      ? provider.professions.join(" · ")
      : "Service provider",
    rating: Number.isFinite(ratingValue) ? Math.max(0, Math.min(5, ratingValue)) : 0,
    reviewCount: Number.isFinite(reviewCountValue) ? Math.max(0, Math.floor(reviewCountValue)) : 0,
    verificationStatus: getProviderVerificationStatus(provider),
    profileImage: typeof provider.profileImage === "string" ? provider.profileImage : "",
  };
}

function formatProviderProfile(provider) {
  const verificationLabels = {
    VERIFICATION_APPROVED: "Verified Pro",
    VERIFICATION_PENDING: "Under Review",
    VERIFICATION_REJECTED: "Verification not approved",
    VERIFICATION_UNVERIFIED: "Not verified",
  };
  const verificationStatus = getProviderVerificationStatus(provider);
  return [
    "## Provider profile",
    `- **Provider:** ${provider.fullName || "Name not set"}`,
    `- **Average rating:** ${Number(provider.averageRating || 0).toFixed(1)} / 5`,
    `- **Review count:** ${Math.max(0, Number(provider.totalReviews) || 0)}`,
    `- **Identity verification:** ${verificationLabels[verificationStatus]}`,
  ].join("\n");
}

async function handleProviderPandaBotRequest(req, res, message) {
  if (req.user?.role !== "provider") {
    return res.status(403).json({ message: "Provider PandaBot is only available to provider accounts." });
  }
  const providerId = req.user._id;
  const statusUpdate = getStatusUpdateIntent(message);
  if (statusUpdate) return handleProviderStatusUpdate(req, res, message, statusUpdate);

  if (isGreetingOrOpenQuestion(message)) {
    return res.json({
      type: "text",
      response: buildFriendlyOpening(req.user, message, "provider", req.body?.conversationHistory),
      contextIntroduction: isOpenHelpQuestion(message) &&
        !hasRecentAssistantIntroduction(req.body?.conversationHistory),
    });
  }
  const bounds = getPhilippinePeriodBounds(new Date());
  const conversationHistory = req.body?.conversationHistory;
  if (isIncomingJobsRequest(message)) {
    const bookings = await getProviderJobs(providerId, PENDING_STATUSES);
    return res.json({
      type: "text",
      response: bookings.length
        ? `${getFriendlyAddress(req.user, conversationHistory)}Here are the requests waiting for you:\n\n${formatJobList(bookings, "")}`
        : `${getFriendlyAddress(req.user, conversationHistory)}You don’t have any new requests waiting for approval.`,
    });
  }

  if (isEarningsRequest(message)) {
    const bookings = await Booking.find({
      providerId,
      paymentMethod: "cash",
      status: mongoose.trusted({ $in: EARNING_STATUSES }),
      $or: [
        { settledAt: mongoose.trusted({ $gte: bounds.week.from, $lt: bounds.week.until }) },
        { workCompletedAt: mongoose.trusted({ $gte: bounds.week.from, $lt: bounds.week.until }) },
        { completionSubmittedAt: mongoose.trusted({ $gte: bounds.week.from, $lt: bounds.week.until }) },
        {
          settledAt: null,
          workCompletedAt: null,
          completionSubmittedAt: null,
          serviceDate: mongoose.trusted({
            $gte: bounds.week.serviceDateFrom,
            $lt: bounds.week.serviceDateUntil,
          }),
        },
      ],
    })
      .select("status serviceDate workCompletedAt completionSubmittedAt settledAt offeredPrice travelFee tipAmount cashPaidConfirmedAt cashReceivedConfirmedAt clientConfirmedCash providerConfirmedCash")
      .lean();
    return res.json({
      type: "text",
      response: `${getFriendlyAddress(req.user, conversationHistory)}Here’s your cash collection snapshot:\n\n${formatEarningsSummary(bookings, bounds)}`,
    });
  }

  if (isProviderProfileRequest(message)) {
    const provider = await getProviderProfile(providerId);
    if (!provider) return res.status(404).json({ message: "Provider profile not found." });
    return res.json({
      type: "PROFILE_CARD",
      data: buildProviderProfileCardData(provider),
    });
  }

  const scheduleRequest = getProviderScheduleRequest(message, conversationHistory, bounds);
  if (scheduleRequest) {
    const bookings = await getProviderJobs(providerId, ACTIVE_STATUSES, scheduleRequest.range);
    const emptyResponse = scheduleRequest.label === "tomorrow"
      ? "No jobs scheduled for tomorrow either! You're all clear."
      : `You don’t have any active jobs scheduled ${scheduleRequest.label}.`;
    return res.json({
      type: "text",
      response: bookings.length
        ? `${getFriendlyAddress(req.user, conversationHistory)}Here’s your schedule for ${scheduleRequest.label}:\n\n${formatJobList(bookings, "")}`
        : `${getFriendlyAddress(req.user, conversationHistory)}${emptyResponse}`,
      contextIntent: "provider_schedule",
    });
  }

  return res.json({
    type: "text",
    response: `${getFriendlyAddress(req.user, conversationHistory)}Are you looking to check an incoming request, view your schedule, update a job, or review your earnings?`,
  });
}

module.exports = {
  ACTIVE_STATUSES,
  EARNING_STATUSES,
  PENDING_STATUSES,
  buildProviderBookingFilter,
  buildProviderProfileCardData,
  formatEarningsSummary,
  formatProviderJob,
  formatProviderProfile,
  findNamedBooking,
  getPhilippinePeriodBounds,
  getProviderScheduleRequest,
  getProviderVerificationStatus,
  getStatusUpdateIntent,
  handleProviderPandaBotRequest,
  isActiveJobsRequest,
  isEarningsRequest,
  isIncomingJobsRequest,
  isProviderProfileRequest,
  isGreetingOrOpenQuestion,
  summarizeEarnings,
};
