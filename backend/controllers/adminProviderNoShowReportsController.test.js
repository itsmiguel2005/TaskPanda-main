const test = require("node:test");
const assert = require("node:assert/strict");
const Booking = require("../models/Booking");
const oneSignal = require("../services/oneSignal");
const originalSendPushNotification = oneSignal.sendPushNotification;
oneSignal.sendPushNotification = async () => null;
const {
  buildProviderNoShowReportFilter,
  serializeProviderNoShowReport,
  handleReviewAdminProviderNoShowReport,
} = require("./adminProviderNoShowReportsController");

const originalFindOneAndUpdate = Booking.findOneAndUpdate;

test.afterEach(() => {
  Booking.findOneAndUpdate = originalFindOneAndUpdate;
});

test.after(() => {
  oneSignal.sendPushNotification = originalSendPushNotification;
});

test("provider no-show report filters include pending and legacy unreviewed reports", () => {
  const filter = buildProviderNoShowReportFilter("needs_review");
  assert.equal(filter.status, "provider_no_show");
  assert.equal(filter.$or.length, 2);
  assert.deepEqual(filter.$or[0].providerNoShowReviewStatus.$in, ["pending", "responded"]);
  assert.equal(filter.$or[1].providerNoShowReviewStatus.$exists, false);
});

test("provider no-show report serialization includes both participants and the provider response", () => {
  const report = serializeProviderNoShowReport({
    _id: "64b000000000000000000001",
    repairDescription: "Repair a leaking pipe",
    serviceDate: new Date("2026-10-07T07:00:00.000Z"),
    timeSlot: "3:00 PM",
    providerNoShowReportedAt: new Date("2026-10-07T08:00:00.000Z"),
    clientId: { fullName: "Client Person" },
    providerId: { fullName: "Provider Person" },
    providerNoShowResponse: { note: "I arrived and called twice." },
  });

  assert.equal(report.client, "Client Person");
  assert.equal(report.provider, "Provider Person");
  assert.equal(report.providerResponse, "I arrived and called twice.");
  assert.equal(report.reviewStatus, "pending");
});

test("admin confirmation flags a no-show only after the review action", async () => {
  let capturedFilter;
  let capturedUpdate;
  const bookingId = "64b000000000000000000001";
  Booking.findOneAndUpdate = (filter, update) => {
    capturedFilter = filter;
    capturedUpdate = update;
    return {
      select: async () => ({ _id: bookingId, providerId: "64b000000000000000000002", providerNoShowReviewStatus: "confirmed" }),
    };
  };

  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handleReviewAdminProviderNoShowReport({
    params: { bookingId },
    body: { action: "confirm", notes: "Provider did not respond to contact attempts." },
    adminEmail: "admin@example.com",
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(capturedFilter.status, "provider_no_show");
  assert.equal(capturedUpdate.$set.providerNoShowReviewStatus, "confirmed");
  assert.equal(capturedUpdate.$set.providerNoShowAdminNotes, "Provider did not respond to contact attempts.");
  assert.ok(capturedUpdate.$set.providerReliabilityFlaggedAt instanceof Date);
});

test("dismissing a provider no-show report removes its reliability flag", async () => {
  let capturedUpdate;
  Booking.findOneAndUpdate = (_filter, update) => {
    capturedUpdate = update;
    return {
      select: async () => ({ _id: "64b000000000000000000001", providerId: "64b000000000000000000002", providerNoShowReviewStatus: "dismissed" }),
    };
  };
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handleReviewAdminProviderNoShowReport({
    params: { bookingId: "64b000000000000000000001" },
    body: { action: "dismiss" },
    adminEmail: "admin@example.com",
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(capturedUpdate.$set.providerNoShowReviewStatus, "dismissed");
  assert.deepEqual(capturedUpdate.$unset, { providerReliabilityFlaggedAt: 1 });
});
