const { waitUntil } = require("@vercel/functions");
const AdminNotification = require("../models/AdminNotification");
const { sendPushNotification } = require("./oneSignal");

function getNotificationEventKey(event, data, explicitEventKey) {
  if (explicitEventKey) return String(explicitEventKey);

  const resourceId = data.refundId || data.reportId || data.userId || data.bookingId;
  if (!resourceId) throw new Error("An admin notification requires a resource ID or an explicit event key.");

  const stableEvent = event === "booking.provider_no_show_response"
    ? "booking.provider_no_show"
    : event;
  return `${stableEvent}:${resourceId}`;
}

function validateAdminUrl(url) {
  const value = String(url || "");
  if (!value.startsWith("/admin?section=") || value.startsWith("//")) {
    throw new Error("Admin notification links must point to an admin section.");
  }
  return value;
}

function sendAdminPushInBackground(notification, data) {
  const pushPromise = sendPushNotification({
    roles: ["admin"],
    title: notification.title,
    body: notification.message,
    url: notification.targetUrl,
    data: {
      ...data,
      event: notification.event,
      notificationId: String(notification._id),
    },
    name: notification.title,
  }).catch((error) => {
    console.warn("Admin notification push delivery failed:", error.message);
  });

  if (process.env.VERCEL) waitUntil(pushPromise);
  else void pushPromise;
}

async function notifyAdminEvent(options) {
  const data = options.data && typeof options.data === "object" ? options.data : {};
  const event = String(data.event || options.event || "").trim();
  if (!event) throw new Error("An admin notification requires an event name.");

  const eventKey = getNotificationEventKey(event, data, options.eventKey);
  const targetUrl = validateAdminUrl(options.url);
  const refreshExisting = event === "booking.provider_no_show_response";
  const fields = {
    event,
    title: String(options.title || "").trim().slice(0, 100),
    message: String(options.body || options.message || "").trim().slice(0, 240),
    targetUrl,
  };
  if (!fields.title || !fields.message) {
    throw new Error("Admin notifications require a title and message.");
  }

  const update = refreshExisting
    ? { $set: { ...fields, readBy: [] } }
    : { $setOnInsert: { eventKey, ...fields, readBy: [] } };
  const notification = await AdminNotification.findOneAndUpdate(
    { eventKey },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  sendAdminPushInBackground(notification, data);
  return notification;
}

module.exports = {
  getNotificationEventKey,
  notifyAdminEvent,
  validateAdminUrl,
};
