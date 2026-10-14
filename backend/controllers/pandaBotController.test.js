const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  buildBookingTrackingResponse,
  buildFriendlyOpening,
  buildUserRelevantBookingsFilter,
  findBookingSelectionMatches,
  getFirstName,
  getRequestedDateRangeFromMessage,
  hasRecentAssistantIntroduction,
  isBookingTrackingFollowUp,
  isBookingTrackingRequest,
  isCasualAcknowledgment,
  isGreetingOrOpenQuestion,
  isSimpleGreeting,
  sanitizeConversationHistory,
} = require("./pandaBotController");

test("responds to greetings and open help requests naturally with the caller's first name", () => {
  const client = { fullName: "Mariel Estrada Calilim" };
  const provider = { fullName: "Miguel Eduardo Estrada" };
  assert.equal(getFirstName(client), "Mariel");
  assert.equal(isGreetingOrOpenQuestion("hello"), true);
  assert.equal(isGreetingOrOpenQuestion("Hello, PandaBot!"), true);
  assert.equal(isGreetingOrOpenQuestion("sup"), true);
  assert.equal(isSimpleGreeting("good morning"), true);
  assert.equal(isCasualAcknowledgment("thanks!"), true);
  assert.equal(isGreetingOrOpenQuestion("Can you help me with something?"), true);
  assert.equal(isGreetingOrOpenQuestion("Where is my provider?"), false);
  assert.equal(hasRecentAssistantIntroduction([
    { role: "assistant", text: "I can help you check your schedule or earnings." },
  ]), true);
  assert.equal(hasRecentAssistantIntroduction([
    { role: "user", text: "I can help you check your schedule or earnings." },
  ]), false);
  assert.equal(
    buildFriendlyOpening(client, "Can you help me with something?"),
    "Of course, Mariel—I can check a booking or help find a local pro; what do you need a hand with?",
  );
  assert.equal(
    buildFriendlyOpening(provider, "Hello", "provider"),
    "Hey Miguel! How’s your day going, and what can I help you with?",
  );
  assert.equal(
    buildFriendlyOpening({}, "Hello"),
    "Hey! How’s your day going, and what can I help you with?",
  );
  assert.equal(
    buildFriendlyOpening(provider, "hi", "provider", [
      { role: "assistant", contextIntroduction: true, text: "I can help with your schedule." },
    ]),
    "Hey again! What can I help you with right now?",
  );
  assert.equal(
    buildFriendlyOpening(provider, "Can you help me?", "provider", [
      { role: "assistant", contextIntroduction: true },
    ]),
    "Of course—what are you trying to sort out?",
  );
  assert.equal(
    buildFriendlyOpening(client, "Thanks!"),
    "You’re welcome, Mariel! Want me to check anything else?",
  );
});

test("recognizes caller booking and provider tracking requests", () => {
  for (const message of [
    "Where is my provider?",
    "Track my booking",
    "Status of my request",
    "Can you check my bookings?",
    "When will my plumber arrive?",
  ]) {
    assert.equal(isBookingTrackingRequest(message), true, message);
  }
  assert.equal(isBookingTrackingRequest("Find a top-rated plumber near me"), false);
  assert.equal(isBookingTrackingRequest("I need to book a plumber"), false);
  assert.equal(isBookingTrackingFollowUp([
    { role: "assistant", contextBookingTracking: true },
  ]), true);
  assert.equal(isBookingTrackingFollowUp([
    { role: "assistant", contextBookingTracking: true },
    { role: "assistant", contextBookingTracking: false },
  ]), false);
  const trackingHistory = [
    { role: "assistant", text: "Here are your bookings.", contextIntent: "client_booking_tracking" },
  ];
  assert.equal(isBookingTrackingFollowUp(trackingHistory, "how about tomorrow?"), true);
  assert.equal(isBookingTrackingFollowUp(trackingHistory, "thanks!"), false);
});

test("parses client booking follow-up date ranges using the Philippine current date", () => {
  const now = new Date("2026-10-14T16:00:00.000Z");
  const tomorrow = getRequestedDateRangeFromMessage("how about tomorrow?", now);
  assert.equal(tomorrow.serviceDateFrom.toISOString(), "2026-10-16T00:00:00.000Z");
  assert.equal(tomorrow.serviceDateUntil.toISOString(), "2026-10-17T00:00:00.000Z");
  const bookingFilter = buildUserRelevantBookingsFilter(
    new mongoose.Types.ObjectId(),
    now,
    tomorrow,
  );
  assert.equal(bookingFilter.serviceDate.$gte, tomorrow.serviceDateFrom);
  assert.equal(bookingFilter.serviceDate.$lt, tomorrow.serviceDateUntil);

  const thisWeek = getRequestedDateRangeFromMessage("what about this week?", now);
  assert.equal(thisWeek.serviceDateFrom.toISOString(), "2026-10-15T00:00:00.000Z");
  assert.equal(thisWeek.serviceDateUntil.toISOString(), "2026-10-19T00:00:00.000Z");

  const nextWeek = getRequestedDateRangeFromMessage("what about next week?", now);
  assert.equal(nextWeek.serviceDateFrom.toISOString(), "2026-10-19T00:00:00.000Z");
  assert.equal(nextWeek.serviceDateUntil.toISOString(), "2026-10-26T00:00:00.000Z");
});

test("sanitizes and retains complete user/assistant conversation context", () => {
  const sanitized = sanitizeConversationHistory([
    { role: "user", text: "Show my schedule today." },
    { role: "assistant", text: "Here is your schedule.", contextIntent: "provider_schedule" },
    { role: "system", text: "discard this" },
    { role: "assistant", text: 123 },
  ]);
  assert.deepEqual(sanitized, [
    { role: "user", text: "Show my schedule today." },
    { role: "assistant", text: "Here is your schedule.", contextIntent: "provider_schedule" },
  ]);
});

test("booking lookup is scoped to the client and includes only allowed states", () => {
  const clientId = new mongoose.Types.ObjectId();
  const now = new Date("2026-10-14T10:00:00.000Z");
  const filter = buildUserRelevantBookingsFilter(clientId, now);

  assert.equal(filter.clientId, clientId);
  assert.deepEqual(filter.$or[0].status.$in, [
    "PENDING", "APPROVED", "ON_THE_WAY", "IN_PROGRESS",
    "pending", "approved", "en_route", "in_progress",
    "Pending Request", "Confirmed", "On the Way", "In Progress",
  ]);
  assert.deepEqual(filter.$or[1].status.$in, [
    "REFUND_PENDING", "DISPUTED", "refund_pending", "disputed", "Disputed",
  ]);
  assert.deepEqual(filter.$or[2].status.$in, ["CANCELLED", "canceled", "cancelled", "Cancelled"]);
  assert.equal(filter.$or[2].updatedAt.$gte.toISOString(), "2026-10-13T10:00:00.000Z");
});

test("booking tracking response handles zero and one matching booking", () => {
  assert.match(buildBookingTrackingResponse([]), /couldn’t find any current bookings, including active, pending, refund-pending, disputed, or recently canceled ones/i);

  const booking = {
    providerId: { fullName: "Alex Rivera", professions: ["Plumber"] },
    status: "en_route",
    serviceDate: "2026-10-15T00:00:00.000Z",
    timeSlot: "9:00 AM",
  };
  const response = buildBookingTrackingResponse([booking]);
  assert.match(response, /Provider:\*\* Alex Rivera/);
  assert.match(response, /Service:\*\* Plumber/);
  assert.match(response, /Status:\*\* On the way/);
  assert.match(response, /Scheduled:\*\* Oct 15, 2026 at 9:00 AM/);
  assert.match(buildBookingTrackingResponse([booking], "", { fullName: "Taylor James" }), /^Hey, Taylor —/);
  assert.doesNotMatch(
    buildBookingTrackingResponse([booking], "", { fullName: "Taylor James" }, [
      { role: "assistant", text: "Welcome, Taylor!" },
    ]),
    /Taylor/,
  );
});

test("multiple bookings prompt for a provider or profession and support selection", () => {
  const bookings = [
    {
      providerId: { fullName: "Alex Rivera", professions: ["Plumber"] },
      status: "en_route",
      serviceDate: "2026-10-15T00:00:00.000Z",
      timeSlot: "9:00 AM",
    },
    {
      providerId: { fullName: "Mark Santos", professions: ["Electrician"] },
      status: "pending",
      serviceDate: "2026-10-16T00:00:00.000Z",
      timeSlot: "1:30 PM",
    },
  ];

  const response = buildBookingTrackingResponse(bookings);
  assert.match(response, /I found 2 bookings:/);
  assert.match(response, /Alex Rivera \(Plumber\) - On the way/);
  assert.match(response, /Mark Santos \(Electrician\) - Pending approval/);
  assert.match(response, /Which provider name or profession/);

  assert.deepEqual(findBookingSelectionMatches(bookings, "Check my plumber booking"), [bookings[0]]);
  assert.deepEqual(findBookingSelectionMatches(bookings, "Alex"), [bookings[0]]);
  const selected = buildBookingTrackingResponse(bookings, "Show Alex Rivera's booking");
  assert.match(selected, /Provider:\*\* Alex Rivera/);
  assert.match(selected, /Status:\*\* On the way/);
});
