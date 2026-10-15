const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
require("../db");
const AdminNotification = require("../models/AdminNotification");
const {
  handleGetAdminNotifications,
  handleMarkAdminNotificationRead,
  handleMarkAllAdminNotificationsRead,
} = require("./adminNotificationsController");

const originals = {
  find: AdminNotification.find,
  countDocuments: AdminNotification.countDocuments,
  findOneAndUpdate: AdminNotification.findOneAndUpdate,
  updateMany: AdminNotification.updateMany,
};

test.afterEach(() => {
  Object.assign(AdminNotification, {
    find: originals.find,
    countDocuments: originals.countDocuments,
    findOneAndUpdate: originals.findOneAndUpdate,
    updateMany: originals.updateMany,
  });
});

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("admin notification list computes unread state for the authenticated admin", async () => {
  const adminEmail = "admin@example.com";
  let unreadFilter;
  const notificationId = new mongoose.Types.ObjectId();
  AdminNotification.find = () => ({
    sort() { return this; },
    limit() { return this; },
    select() { return this; },
    lean: async () => [{
      _id: notificationId,
      event: "refund.requested",
      title: "Refund request needs review",
      message: "A client requested a refund.",
      targetUrl: "/admin?section=refunds",
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
      readBy: [],
    }],
  });
  AdminNotification.countDocuments = async (filter) => {
    unreadFilter = filter;
    return 1;
  };
  const res = response();

  await handleGetAdminNotifications({ adminEmail, query: { limit: "10" } }, res);

  const sanitizedUnreadFilter = mongoose.sanitizeFilter(unreadFilter);
  assert.equal(sanitizedUnreadFilter.readBy.$ne, adminEmail);
  assert.equal(Object.hasOwn(sanitizedUnreadFilter.readBy, "$eq"), false);
  assert.equal(res.body.unreadCount, 1);
  assert.equal(res.body.notifications[0].id, String(notificationId));
  assert.equal(res.body.notifications[0].isRead, false);
});

test("mark-read endpoints persist state against the admin email", async () => {
  const adminEmail = "admin@example.com";
  const notificationId = new mongoose.Types.ObjectId().toString();
  let readQuery;
  let readUpdate;
  let allQuery;
  let allUpdate;
  AdminNotification.findOneAndUpdate = (filter, update) => {
    readQuery = filter;
    readUpdate = update;
    return { select: async () => ({ _id: notificationId }) };
  };
  AdminNotification.updateMany = async (filter, update) => {
    allQuery = filter;
    allUpdate = update;
    return { modifiedCount: 3 };
  };

  const readResponse = response();
  await handleMarkAdminNotificationRead({
    adminEmail,
    params: { notificationId },
  }, readResponse);
  const allReadResponse = response();
  await handleMarkAllAdminNotificationsRead({ adminEmail }, allReadResponse);

  assert.deepEqual(readQuery, { _id: notificationId });
  assert.deepEqual(readUpdate, { $addToSet: { readBy: adminEmail } });
  const sanitizedAllQuery = mongoose.sanitizeFilter(allQuery);
  assert.equal(sanitizedAllQuery.readBy.$ne, adminEmail);
  assert.equal(Object.hasOwn(sanitizedAllQuery.readBy, "$eq"), false);
  assert.deepEqual(allUpdate, { $addToSet: { readBy: adminEmail } });
  assert.equal(allReadResponse.body.updatedCount, 3);
});
