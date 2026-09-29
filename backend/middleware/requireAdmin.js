const { createHash } = require("crypto");
const mongoose = require("mongoose");
const AdminSession = require("../models/AdminSession");

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
      adminEmail,
      expiresAt: mongoose.trusted({ $gt: new Date() }),
    }));
    if (!session) return res.status(401).json({ message: "Your admin session expired. Sign in again." });
    req.adminEmail = session.adminEmail;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { requireAdmin };