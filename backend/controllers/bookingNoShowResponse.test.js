const test = require("node:test");
const assert = require("node:assert/strict");
const Booking = require("../models/Booking");
const AdminNotification = require("../models/AdminNotification");
const oneSignal = require("../services/oneSignal");

const originalFindOneAndUpdate = Booking.findOneAndUpdate;
const originalNotificationFindOneAndUpdate = AdminNotification.findOneAndUpdate;
const originalSendPushNotification = oneSignal.sendPushNotification;
AdminNotification.findOneAndUpdate = async () => ({ _id: "notification-123" });
oneSignal.sendPushNotification = async () => null;
const { handleRespondToProviderNoShow } = require("./bookingController");

test.afterEach(() => {
  Booking.findOneAndUpdate = originalFindOneAndUpdate;
  AdminNotification.findOneAndUpdate = originalNotificationFindOneAndUpdate;
});

test.after(() => {
  oneSignal.sendPushNotification = originalSendPushNotification;
});

function makeResponse() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("providers can submit one response to their own pending no-show report", async () => {
  let capturedFilter;
  let capturedUpdate;
  const booking = {
    _id: "64b000000000000000000001",
    providerId: "64b000000000000000000002",
    clientId: "64b000000000000000000003",
    status: "provider_no_show",
    serviceDate: new Date("2026-10-07T07:00:00.000Z"),
    timeSlot: "3:00 PM",
    offeredPrice: 275,
    travelFee: 33.4,
    tipAmount: 0,
    providerNoShowReportedAt: new Date("2026-10-07T08:00:00.000Z"),
    providerNoShowResponse: { note: "I arrived at the address.", respondedAt: new Date() },
    providerNoShowReviewStatus: "responded",
    populate: async () => booking,
  };
  Booking.findOneAndUpdate = (filter, update) => {
    capturedFilter = filter;
    capturedUpdate = update;
    return Promise.resolve(booking);
  };
  const response = makeResponse();
  await handleRespondToProviderNoShow({
    params: { id: booking._id },
    body: { note: "  I arrived at the address.  " },
    user: { _id: booking.providerId, role: "provider" },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(capturedFilter.providerId, booking.providerId);
  assert.equal(capturedFilter.status, "provider_no_show");
  assert.equal(capturedUpdate.$set.providerNoShowReviewStatus, "responded");
  assert.equal(capturedUpdate.$set.providerNoShowResponse.note, "I arrived at the address.");
  assert.equal(response.body.booking.providerNoShowResponse.note, "I arrived at the address.");
});

test("only the assigned provider can respond to a report", async () => {
  const response = makeResponse();
  await handleRespondToProviderNoShow({
    params: { id: "64b000000000000000000001" },
    body: { note: "I was there." },
    user: { _id: "64b000000000000000000003", role: "client" },
  }, response);

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.message, "Only the provider can respond to this report.");
});
