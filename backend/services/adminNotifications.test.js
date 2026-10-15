const assert = require("node:assert/strict");
const test = require("node:test");
const AdminNotification = require("../models/AdminNotification");
const oneSignal = require("./oneSignal");

const originalFindOneAndUpdate = AdminNotification.findOneAndUpdate;
const originalSendPushNotification = oneSignal.sendPushNotification;

test.afterEach(() => {
  AdminNotification.findOneAndUpdate = originalFindOneAndUpdate;
});

test.after(() => {
  oneSignal.sendPushNotification = originalSendPushNotification;
});

test("admin events persist one queue item and send a push with its notification ID", async () => {
  let query;
  let update;
  let pushPayload;
  AdminNotification.findOneAndUpdate = async (filter, changes) => {
    query = filter;
    update = changes;
    return { _id: "notification-123", ...changes.$setOnInsert };
  };
  oneSignal.sendPushNotification = async (options) => {
    pushPayload = options;
    return { id: "push-123" };
  };
  const { notifyAdminEvent } = require("./adminNotifications");

  const notification = await notifyAdminEvent({
    title: "Refund request needs review",
    body: "A client requested a refund.",
    url: "/admin?section=refunds",
    data: { event: "refund.requested", refundId: "refund-123" },
  });

  assert.deepEqual(query, { eventKey: "refund.requested:refund-123" });
  assert.equal(update.$setOnInsert.targetUrl, "/admin?section=refunds");
  assert.equal(notification.title, "Refund request needs review");
  assert.deepEqual(pushPayload.roles, ["admin"]);
  assert.equal(pushPayload.data.notificationId, "notification-123");
  assert.equal(pushPayload.data.event, "refund.requested");
});

test("provider no-show response refreshes the existing report notification", async () => {
  let query;
  let update;
  AdminNotification.findOneAndUpdate = async (filter, changes) => {
    query = filter;
    update = changes;
    return { _id: "notification-123", ...changes.$set };
  };
  oneSignal.sendPushNotification = async () => null;
  const { notifyAdminEvent } = require("./adminNotifications");

  await notifyAdminEvent({
    title: "Provider responded to a no-show report",
    body: "A provider response is ready for review.",
    url: "/admin?section=reports&reportTab=no-shows",
    data: { event: "booking.provider_no_show_response", bookingId: "booking-123" },
  });

  assert.deepEqual(query, { eventKey: "booking.provider_no_show:booking-123" });
  assert.deepEqual(update.$set.readBy, []);
  assert.equal(update.$set.event, "booking.provider_no_show_response");
});

test("admin notification links are restricted to admin sections", () => {
  const { validateAdminUrl } = require("./adminNotifications");
  assert.equal(validateAdminUrl("/admin?section=verifications"), "/admin?section=verifications");
  assert.throws(() => validateAdminUrl("https://example.com"), /admin section/);
  assert.throws(() => validateAdminUrl("//example.com/admin"), /admin section/);
});
