const test = require("node:test");
const assert = require("node:assert/strict");
const { getConversationStatusGroup, normalizeBookingStatus } = require("./conversationStatus");

test("all active booking statuses remain in the active conversation folder", () => {
  for (const status of [
    "pending",
    "approved",
    "en_route",
    "in_progress",
    "in_revision",
    "disputed",
    "refund_pending",
    "cancel_requested",
  ]) {
    assert.equal(getConversationStatusGroup(status), "active", status);
  }
});

test("all terminal booking statuses are automatically archived", () => {
  for (const status of [
    "settled",
    "complete",
    "closed",
    "canceled",
    "provider_no_show",
    "declined",
    "expired",
    "refunded",
    "partially_refunded",
  ]) {
    assert.equal(getConversationStatusGroup(status), "archived", status);
  }
});

test("legacy display labels normalize to their internal booking status", () => {
  assert.equal(normalizeBookingStatus("Pending Request"), "pending");
  assert.equal(normalizeBookingStatus("Confirmed"), "approved");
  assert.equal(normalizeBookingStatus("On the Way"), "en_route");
  assert.equal(normalizeBookingStatus("In Progress"), "in_progress");
  assert.equal(normalizeBookingStatus("In Revision"), "in_revision");
  assert.equal(normalizeBookingStatus("Cancellation Requested"), "cancel_requested");
  assert.equal(normalizeBookingStatus("Cancelled"), "canceled");
  assert.equal(normalizeBookingStatus("Cancelled - Provider No-Show"), "provider_no_show");
  assert.equal(normalizeBookingStatus("Declined"), "declined");
  assert.equal(normalizeBookingStatus("Declined by Provider"), "declined");
  assert.equal(normalizeBookingStatus("Completed"), "complete");
  assert.equal(normalizeBookingStatus("Settled"), "settled");
  assert.equal(normalizeBookingStatus("Refund Under Review"), "refund_pending");
});
