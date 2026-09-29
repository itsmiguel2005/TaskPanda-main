const { createHash } = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User");

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

async function requireAuth(req, res, next) {
  const token = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^[a-f\d]{64}$/i.test(token)) {
    return res.status(401).json({ message: "Authentication is required." });
  }

  try {
    const user = await User.findOne(mongoose.trusted({
      accountTokens: mongoose.trusted({
        $elemMatch: {
          tokenHash: hashToken(token),
          expiresAt: mongoose.trusted({ $gt: new Date() }),
        },
      }),
      registrationComplete: true,
    })).select("+accountTokens");
    if (!user) return res.status(401).json({ message: "Your session expired. Sign in again." });
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireRole(...roles) {
  return function authorizeRole(req, res, next) {
    if (!req.user) return res.status(401).json({ message: "Authentication is required." });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: "You do not have permission to access this resource." });
    return next();
  };
}

module.exports = { requireAuth, requireRole };
