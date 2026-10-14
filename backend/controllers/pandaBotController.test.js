const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  buildBookingTrackingResponse,
  buildUserRelevantBookingsFilter,
  findBookingSelectionMatches,
  isBookingTrackingFollowUp,
  isBookingTrackingRequest,
} = require("./pandaBotController");

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
  assert.match(buildBookingTrackingResponse([]), /no active, pending, disputed, refund-pending, or recently canceled bookings/i);

  const booking = {
    providerId: { fullName: "Alex Rivera", professions: ["Plumber"] },
    status: "en_route",
    serviceDate: "2026-10-15T00:00:00.000Z",
    timeSlot: "9:00 AM",
  };
  const response = buildBookingTrackingResponse([booking]);
  assert.match(response, /Provider Name: Alex Rivera/);
  assert.match(response, /Service Category: Plumber/);
  assert.match(response, /Booking Status: On the way/);
  assert.match(response, /Scheduled Date\/Time: Oct 15, 2026 at 9:00 AM/);
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
  assert.match(selected, /Provider Name: Alex Rivera/);
  assert.match(selected, /Booking Status: On the way/);
});
