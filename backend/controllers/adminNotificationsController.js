const mongoose = require("mongoose");
const AdminNotification = require("../models/AdminNotification");

function getAdminEmail(req, res) {
  const adminEmail = String(req.adminEmail || "").trim().toLowerCase();
  if (!adminEmail) {
    res.status(401).json({ message: "Admin authentication is required." });
    return "";
  }
  return adminEmail;
}

async function handleGetAdminNotifications(req, res) {
  const adminEmail = getAdminEmail(req, res);
  if (!adminEmail) return;
  const limit = Math.min(25, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));

  try {
    const [notifications, unreadCount] = await Promise.all([
      AdminNotification.find()
        .sort({ updatedAt: -1 })
        .limit(limit)
        .select("_id event title message targetUrl createdAt updatedAt readBy")
        .lean(),
      AdminNotification.countDocuments({ readBy: mongoose.trusted({ $ne: adminEmail }) }),
    ]);
    return res.json({
      notifications: notifications.map((notification) => ({
        id: String(notification._id),
        event: notification.event,
        title: notification.title,
        message: notification.message,
        targetUrl: notification.targetUrl,
        createdAt: notification.createdAt,
        updatedAt: notification.updatedAt,
        isRead: (notification.readBy || []).includes(adminEmail),
      })),
      unreadCount,
    });
  } catch (error) {
    console.error("Admin notification lookup failed:", error);
    return res.status(500).json({ message: "Could not load admin notifications." });
  }
}

async function handleMarkAdminNotificationRead(req, res) {
  const adminEmail = getAdminEmail(req, res);
  if (!adminEmail) return;
  if (!mongoose.isValidObjectId(req.params.notificationId)) {
    return res.status(400).json({ message: "Choose a valid admin notification." });
  }

  try {
    const notification = await AdminNotification.findOneAndUpdate(
      { _id: req.params.notificationId },
      { $addToSet: { readBy: adminEmail } },
      { new: true },
    ).select("_id");
    if (!notification) return res.status(404).json({ message: "Admin notification not found." });
    return res.json({ success: true });
  } catch (error) {
    console.error("Mark admin notification read failed:", error);
    return res.status(500).json({ message: "Could not update this admin notification." });
  }
}

async function handleMarkAllAdminNotificationsRead(req, res) {
  const adminEmail = getAdminEmail(req, res);
  if (!adminEmail) return;

  try {
    const result = await AdminNotification.updateMany(
      { readBy: mongoose.trusted({ $ne: adminEmail }) },
      { $addToSet: { readBy: adminEmail } },
    );
    return res.json({ success: true, updatedCount: result.modifiedCount });
  } catch (error) {
    console.error("Mark all admin notifications read failed:", error);
    return res.status(500).json({ message: "Could not update admin notifications." });
  }
}

module.exports = {
  handleGetAdminNotifications,
  handleMarkAdminNotificationRead,
  handleMarkAllAdminNotificationsRead,
};
