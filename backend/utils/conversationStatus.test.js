const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getConversationStatusGroup,
  isConversationArchivedForRole,
  normalizeBookingStatus,
} = require("./conversationStatus");

test("all active booking statuses remain in the active conversation folder", () => {
  for (const status of [
    "pending",
    "approved",
    "en_route",
    "in_progress",
    "in_revision",
    "complete",
    "Completed",
    "disputed",
    "refund_pending",
    "refund_repayment_pending",
    "refund_repayment_reported",
    "refund_repayment_overdue",
    "cancel_requested",
  ]) {
    assert.equal(getConversationStatusGroup(status), "active", status);
  }
});

test("only requested booking statuses are automatically archived", () => {
  for (const status of [
    "settled",
    "canceled",
    "provider_no_show",
    "declined",
    "refunded",
  ]) {
    assert.equal(getConversationStatusGroup(status), "archived", status);
  }
});

test("completed and other non-requested terminal statuses stay active", () => {
  for (const status of ["closed", "expired", "partially_refunded"]) {
    assert.equal(getConversationStatusGroup(status), null, status);
  }
});

test("auto-archived conversations are locked until restored for that participant", () => {
  const conversation = { bookingId: { status: "settled" } };
  assert.equal(isConversationArchivedForRole(conversation, "client"), true);
  assert.equal(isConversationArchivedForRole(conversation, "provider"), true);
  conversation.isRestoredByClient = true;
  assert.equal(isConversationArchivedForRole(conversation, "client"), false);
  assert.equal(isConversationArchivedForRole(conversation, "provider"), true);
});

test("manual archives remain locked even when the booking status is not auto-archived", () => {
  const conversation = {
    bookingId: { status: "complete" },
    isArchivedByClient: true,
  };
  assert.equal(isConversationArchivedForRole(conversation, "client"), true);
  assert.equal(isConversationArchivedForRole(conversation, "provider"), false);
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
