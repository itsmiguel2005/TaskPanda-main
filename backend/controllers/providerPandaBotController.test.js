const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const User = require("../models/User");
const {
  buildProviderBookingFilter,
  buildProviderProfileCardData,
  findNamedBooking,
  formatEarningsSummary,
  formatProviderJob,
  formatProviderProfile,
  getPhilippinePeriodBounds,
  getProviderScheduleRequest,
  getStatusUpdateIntent,
  handleProviderPandaBotRequest,
  isActiveJobsRequest,
  isEarningsRequest,
  isIncomingJobsRequest,
  isProviderProfileRequest,
  getProviderVerificationStatus,
  summarizeEarnings,
} = require("./providerPandaBotController");

test("provider booking filters are always scoped by the authenticated provider", () => {
  const providerId = new mongoose.Types.ObjectId();
  const range = {
    from: new Date("2026-10-14T00:00:00.000Z"),
    until: new Date("2026-10-15T00:00:00.000Z"),
  };
  const filter = buildProviderBookingFilter(providerId, ["pending"], range);

  assert.equal(filter.providerId, providerId);
  assert.deepEqual(filter.status.$in, ["pending"]);
  assert.equal(filter.serviceDate.$gte, range.from);
  assert.equal(filter.serviceDate.$lt, range.until);
});

test("calculates Philippine today and Monday-based week date windows", () => {
  const bounds = getPhilippinePeriodBounds(new Date("2026-10-14T16:00:00.000Z"));
  assert.equal(bounds.today.from.toISOString(), "2026-10-14T16:00:00.000Z");
  assert.equal(bounds.today.until.toISOString(), "2026-10-15T16:00:00.000Z");
  assert.equal(bounds.today.serviceDateFrom.toISOString(), "2026-10-15T00:00:00.000Z");
  assert.equal(bounds.tomorrow.serviceDateFrom.toISOString(), "2026-10-16T00:00:00.000Z");
  assert.equal(bounds.tomorrow.serviceDateUntil.toISOString(), "2026-10-17T00:00:00.000Z");
  assert.equal(bounds.week.from.toISOString(), "2026-10-11T16:00:00.000Z");
  assert.equal(bounds.week.until.toISOString(), "2026-10-18T16:00:00.000Z");
  assert.equal(bounds.week.serviceDateFrom.toISOString(), "2026-10-12T00:00:00.000Z");
});

test("schedule follow-ups inherit schedule intent and resolve exact date windows", () => {
  const now = new Date("2026-10-14T16:00:00.000Z");
  const bounds = getPhilippinePeriodBounds(now);
  const scheduleHistory = [
    { role: "assistant", text: "Here’s your schedule for today.", contextIntent: "provider_schedule" },
  ];

  const tomorrow = getProviderScheduleRequest("how about tomorrow?", scheduleHistory, bounds, now);
  assert.equal(tomorrow.label, "tomorrow");
  assert.equal(tomorrow.range.serviceDateFrom.toISOString(), "2026-10-16T00:00:00.000Z");
  assert.equal(tomorrow.range.serviceDateUntil.toISOString(), "2026-10-17T00:00:00.000Z");

  const nextWeek = getProviderScheduleRequest("what about next week?", scheduleHistory, bounds, now);
  assert.equal(nextWeek.label, "next week");
  assert.equal(nextWeek.range.serviceDateFrom.toISOString(), "2026-10-19T00:00:00.000Z");
  assert.equal(nextWeek.range.serviceDateUntil.toISOString(), "2026-10-26T00:00:00.000Z");

  const thisWeek = getProviderScheduleRequest("show my schedule this week", scheduleHistory, bounds, now);
  assert.equal(thisWeek.range.serviceDateFrom.toISOString(), "2026-10-15T00:00:00.000Z");
  assert.equal(thisWeek.range.serviceDateUntil.toISOString(), "2026-10-19T00:00:00.000Z");

  const friday = getProviderScheduleRequest("any for Friday?", scheduleHistory, bounds, now);
  assert.equal(friday.label, "Friday");
  assert.equal(friday.range.serviceDateFrom.toISOString(), "2026-10-16T00:00:00.000Z");
  assert.equal(
    getProviderScheduleRequest("how about tomorrow?", [], bounds, now),
    null,
  );
});

test("tomorrow schedule follow-up queries its date and gives the requested empty response", async () => {
  const originalFind = Booking.find;
  let filter;
  Booking.find = (query) => {
    filter = query;
    return {
      select() { return this; },
      populate() { return this; },
      sort() { return this; },
      async lean() { return []; },
    };
  };
  try {
    const response = { json(payload) { this.payload = payload; return payload; } };
    const providerId = new mongoose.Types.ObjectId();
    const now = new Date();
    await handleProviderPandaBotRequest({
      user: { _id: providerId, role: "provider", fullName: "Alex Rivera" },
      body: {
        conversationHistory: [
          { role: "assistant", text: "Here’s your schedule for today.", contextIntent: "provider_schedule" },
        ],
      },
    }, response, "how about tomorrow?");

    assert.equal(response.payload.response, "No jobs scheduled for tomorrow either! You're all clear.");
    assert.equal(response.payload.contextIntent, "provider_schedule");
    assert.equal(filter.providerId, providerId);
    assert.equal(filter.serviceDate.$gte.toISOString(), getPhilippinePeriodBounds(now).tomorrow.serviceDateFrom.toISOString());
    assert.equal(filter.serviceDate.$lt.toISOString(), getPhilippinePeriodBounds(now).tomorrow.serviceDateUntil.toISOString());
  } finally {
    Booking.find = originalFind;
  }
});

test("recognizes provider job, earnings, and profile intents", () => {
  assert.equal(isIncomingJobsRequest("Show my pending requests"), true);
  assert.equal(isActiveJobsRequest("What jobs do I have today?"), true);
  assert.equal(isActiveJobsRequest("Show my schedule this week"), true);
  assert.equal(isEarningsRequest("Show my cash earnings this week"), true);
  assert.equal(isProviderProfileRequest("What’s my rating and verification status?"), true);
  assert.equal(isEarningsRequest("Show my pending requests"), false);
});

test("provider greetings stay short and do not repeat the introduction", async () => {
  const response = { json(payload) { this.payload = payload; return payload; } };
  await handleProviderPandaBotRequest({
    user: { _id: new mongoose.Types.ObjectId(), role: "provider", fullName: "Alex Rivera" },
    body: {
      conversationHistory: [
        { role: "assistant", text: "I can help you keep tabs on incoming jobs.", contextIntroduction: true },
      ],
    },
  }, response, "hello");

  assert.equal(response.payload.response, "Hey again! What can I help you with right now?");
  assert.equal(response.payload.contextIntroduction, false);
});

test("provider open-help reply offers brief examples once", async () => {
  const response = { json(payload) { this.payload = payload; return payload; } };
  await handleProviderPandaBotRequest({
    user: { _id: new mongoose.Types.ObjectId(), role: "provider", fullName: "Alex Rivera" },
    body: { conversationHistory: [] },
  }, response, "Can you help me with something?");

  assert.equal(response.payload.response, "Of course, Alex—I can check your schedule or earnings; what do you need a hand with?");
  assert.equal(response.payload.contextIntroduction, true);
});

test("recognizes only supported provider-driven status transitions", () => {
  assert.deepEqual(getStatusUpdateIntent("Mark Alex’s booking on the way"), {
    status: "en_route",
    sourceStatuses: ["approved", "Confirmed"],
  });
  assert.deepEqual(getStatusUpdateIntent("Set Alex’s job in progress"), {
    status: "in_progress",
    sourceStatuses: ["en_route", "On the Way"],
  });
  assert.equal(getStatusUpdateIntent("Show Alex’s job on the way"), null);
  assert.equal(getStatusUpdateIntent("Complete Alex’s job"), null);
});

test("matches provider status-update jobs by client name without broadening ownership", () => {
  const jobs = [
    { _id: "booking-a", clientId: { fullName: "Alex Rivera" } },
    { _id: "booking-b", clientId: { fullName: "Mark Santos" } },
  ];
  assert.deepEqual(findNamedBooking(jobs, "Mark Alex’s job on the way"), [jobs[0]]);
  assert.deepEqual(findNamedBooking(jobs, "Mark the job on the way"), []);
});

test("formats provider job, profile, and cash collection summaries", () => {
  const job = {
    _id: "booking-id",
    clientId: { fullName: "Alex Rivera" },
    repairDescription: "Repair the leaking kitchen pipe",
    status: "approved",
    serviceDate: "2026-10-15T00:00:00.000Z",
    timeSlot: "9:00 AM",
    address: "Dagupan City",
  };
  const jobMarkdown = formatProviderJob(job);
  assert.match(jobMarkdown, /Alex Rivera — Confirmed/);
  assert.match(jobMarkdown, /Repair the leaking kitchen pipe/);
  assert.match(jobMarkdown, /Oct 15, 2026 · 9:00 AM/);
  assert.match(jobMarkdown, /Dagupan City/);

  const profileMarkdown = formatProviderProfile({
    fullName: "Taylor Santos",
    averageRating: 4.7,
    totalReviews: 12,
    verificationStatus: "verified",
    isVerified: true,
  });
  assert.match(profileMarkdown, /4\.7 \/ 5/);
  assert.match(profileMarkdown, /12/);
  assert.match(profileMarkdown, /Verified Pro/);
  assert.doesNotMatch(profileMarkdown, /VERIFICATION_APPROVED/);

  const bookings = [
    {
      status: "settled",
      settledAt: "2026-10-15T01:00:00.000Z",
      offeredPrice: 1000,
      travelFee: 100,
      tipAmount: 50,
      clientConfirmedCash: true,
      providerConfirmedCash: true,
    },
    {
      status: "complete",
      workCompletedAt: "2026-10-15T02:00:00.000Z",
      offeredPrice: 500,
      travelFee: 50,
      tipAmount: 0,
      clientConfirmedCash: true,
      providerConfirmedCash: false,
    },
  ];
  const bounds = getPhilippinePeriodBounds(new Date("2026-10-15T05:00:00.000Z"));
  const summary = summarizeEarnings(bookings, bounds.today);
  assert.equal(summary.total, 1700);
  assert.equal(summary.confirmed, 1150);
  assert.equal(summary.awaitingConfirmation, 550);
  assert.equal(summary.awaitingCount, 1);
  assert.match(formatEarningsSummary(bookings, bounds), /awaiting confirmation/);
});

test("builds structured provider profile card data and human verification states", () => {
  const data = buildProviderProfileCardData({
    fullName: "Chinito Cruz Lopez",
    professions: ["Aerospace Engineer"],
    profileImage: "https://example.test/profile.png",
    averageRating: 4.9,
    totalReviews: 8,
    verificationStatus: "VERIFICATION_APPROVED",
  });

  assert.deepEqual(data, {
    name: "Chinito Cruz Lopez",
    profession: "Aerospace Engineer",
    rating: 4.9,
    reviewCount: 8,
    verificationStatus: "VERIFICATION_APPROVED",
    profileImage: "https://example.test/profile.png",
  });
  assert.equal(getProviderVerificationStatus({ verificationStatus: "pending" }), "VERIFICATION_PENDING");
  assert.equal(getProviderVerificationStatus({ verificationStatus: "rejected" }), "VERIFICATION_REJECTED");
  assert.equal(getProviderVerificationStatus({ verificationStatus: "unverified" }), "VERIFICATION_UNVERIFIED");
  assert.equal(buildProviderProfileCardData({
    averageRating: Number.NaN,
    totalReviews: Number.POSITIVE_INFINITY,
  }).rating, 0);
  assert.equal(buildProviderProfileCardData({
    averageRating: 8,
    totalReviews: -2,
  }).rating, 5);
  assert.equal(buildProviderProfileCardData({
    averageRating: 8,
    totalReviews: -2,
  }).reviewCount, 0);
});

test("provider profile requests return a structured card for the authenticated provider", async () => {
  const originalFindOne = User.findOne;
  const providerId = new mongoose.Types.ObjectId();
  let queriedFilter;
  User.findOne = (filter) => {
    queriedFilter = filter;
    return {
      select() { return this; },
      async lean() {
        return {
          fullName: "Chinito Cruz Lopez",
          professions: ["Aerospace Engineer"],
          profileImage: "https://example.test/chinito.png",
          averageRating: 4.9,
          totalReviews: 8,
          verificationStatus: "VERIFICATION_APPROVED",
        };
      },
    };
  };
  try {
    const response = { json(payload) { this.payload = payload; return payload; } };
    await handleProviderPandaBotRequest({
      user: { _id: providerId, role: "provider" },
      body: { conversationHistory: [] },
    }, response, "Show my profile");

    assert.deepEqual(queriedFilter, { _id: providerId, role: "provider" });
    assert.deepEqual(response.payload, {
      type: "PROFILE_CARD",
      data: {
        name: "Chinito Cruz Lopez",
        profession: "Aerospace Engineer",
        rating: 4.9,
        reviewCount: 8,
        verificationStatus: "VERIFICATION_APPROVED",
        profileImage: "https://example.test/chinito.png",
      },
    });
  } finally {
    User.findOne = originalFindOne;
  }
});
