const { createHash } = require("crypto");
const { waitUntil } = require("@vercel/functions");
const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");

function getAdminName(req) {
  return String(
    req.user?.fullName
      || req.user?.username
      || req.user?.email
      || req.adminName
      || req.adminEmail
      || process.env.ADMIN_EMAIL
      || "Administrator"
  ).trim().slice(0, 254);
}

function getAdminId(req, adminName) {
  const userId = req.user?._id || req.user?.id;
  if (userId && mongoose.isValidObjectId(userId)) return new mongoose.Types.ObjectId(userId);
  if (req.adminId && mongoose.isValidObjectId(req.adminId)) return new mongoose.Types.ObjectId(req.adminId);

  const configuredEmail = String(req.adminEmail || process.env.ADMIN_EMAIL || adminName).trim().toLowerCase();
  const stableId = createHash("sha256").update(`taskpanda-admin:${configuredEmail}`).digest("hex").slice(0, 24);
  return new mongoose.Types.ObjectId(stableId);
}

async function logAuditAction(req, { category, action, targetResource, targetId, details }) {
  const write = Promise.resolve().then(async () => {
    if (mongoose.connection.readyState !== 1) {
      throw new Error("Database connection is not ready.");
    }
    const adminName = getAdminName(req);
    const ipAddress = String(req.ip || req.socket?.remoteAddress || "").slice(0, 100);
    const userAgent = String(req.get?.("user-agent") || "").slice(0, 1000);
    const adminRecord = req.user?._id
      ? null
      : await User.findOne({
        email: String(req.adminEmail || process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
        role: "admin",
      }).select("_id").lean();
    await new AuditLog({
      adminId: adminRecord?._id || getAdminId(req, adminName),
      adminName,
      category,
      action,
      targetResource,
      ...(targetId ? { targetId: String(targetId).slice(0, 100) } : {}),
      details: String(details || "").trim().slice(0, 2000),
      ipAddress,
      userAgent,
    }).save();
  }).catch((error) => {
    console.error("Admin audit log write failed:", error);
  });
  waitUntil(write);
}

module.exports = { logAuditAction };
