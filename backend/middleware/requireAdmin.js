const { createHash } = require("crypto");
const mongoose = require("mongoose");
const AdminSession = require("../models/AdminSession");
const User = require("../models/User");

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

async function requireAdmin(req, res, next) {
  const token = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!adminEmail || !/^[a-f\d]{64}$/i.test(token)) {
    return res.status(401).json({ message: "Admin authentication is required." });
  }

  try {
    const session = await AdminSession.findOne(mongoose.trusted({
      tokenHash: hashToken(token),
      expiresAt: mongoose.trusted({ $gt: new Date() }),
    }));
    if (!session) return res.status(401).json({ message: "Your admin session expired. Sign in again." });
    const isPrimaryAdmin = session.adminEmail === adminEmail;
    if (!isPrimaryAdmin) {
      const adminAccount = await User.findOne({
        email: session.adminEmail,
        role: "admin",
        isSuspended: mongoose.trusted({ $ne: true }),
        archivedAt: mongoose.trusted({ $exists: false }),
      }).select("_id");
      if (!adminAccount) {
        await AdminSession.deleteOne({ _id: session._id });
        return res.status(401).json({ message: "This admin account is unavailable. Sign in again or contact the primary admin." });
      }
      req.adminId = adminAccount._id;
      req.adminName = adminAccount.fullName || adminAccount.username || session.adminEmail;
    }
    req.adminEmail = session.adminEmail;
    req.adminSessionId = session._id;
    req.isPrimaryAdmin = isPrimaryAdmin;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requirePrimaryAdmin(req, res, next) {
  if (!req.isPrimaryAdmin) {
    return res.status(403).json({ message: "Only the primary admin can manage admin accounts." });
  }
  return next();
}

module.exports = { requireAdmin, requirePrimaryAdmin };