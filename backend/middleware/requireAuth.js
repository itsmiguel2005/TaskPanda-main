const { createHash } = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User");

const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const LAST_ACTIVE_UPDATE_INTERVAL_MS = 60_000;
const SESSION_USER_FILTER = (token) => mongoose.trusted({
  accountTokens: mongoose.trusted({
    $elemMatch: {
      tokenHash: hashToken(token),
      expiresAt: mongoose.trusted({ $gt: new Date() }),
    },
  }),
  registrationComplete: true,
  isSuspended: mongoose.trusted({ $ne: true }),
  archivedAt: mongoose.trusted({ $exists: false }),
});

async function findSessionUser(token) {
  return User.findOne(SESSION_USER_FILTER(token)).select("+accountTokens +lastActive +lastOfflineAt +isOnline");
}

async function trackLastActive(req, res, next) {
  const now = new Date();
  const previousLastActive = req.user.lastActive ? new Date(req.user.lastActive).getTime() : 0;
  const updateTimestamp = now.getTime() - previousLastActive >= LAST_ACTIVE_UPDATE_INTERVAL_MS;

  if (updateTimestamp || !req.user.isOnline) {
    try {
      const activityFilter = { _id: req.user._id };
      if (req.authTokenHash) {
        activityFilter.accountTokens = mongoose.trusted({
          $elemMatch: {
            tokenHash: req.authTokenHash,
            expiresAt: mongoose.trusted({ $gt: now }),
          },
        });
      }
      const updates = { isOnline: true, lastOfflineAt: null };
      if (updateTimestamp) updates.lastActive = now;
      await User.updateOne(
        activityFilter,
        { $set: updates },
      );
      if (updateTimestamp) req.user.lastActive = now;
      req.user.isOnline = true;
    } catch (error) {
      return next(error);
    }
  }

  req.lastActiveTracked = true;
  return next();
}

async function trackAuthenticatedRequest(req, res, next) {
  const token = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^[a-f\d]{64}$/i.test(token)) return next();

  try {
    const user = await findSessionUser(token);
    if (!user) return next();
    req.user = user;
    req.authTokenHash = hashToken(token);
    return trackLastActive(req, res, next);
  } catch (error) {
    return next(error);
  }
}

async function requireAuth(req, res, next) {
  const token = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^[a-f\d]{64}$/i.test(token)) {
    return res.status(401).json({ message: "Authentication is required." });
  }

  try {
    const user = req.user || await findSessionUser(token);
    if (!user) return res.status(401).json({ message: "Your session expired. Sign in again." });
    req.user = user;
    req.authTokenHash = hashToken(token);
    if (req.lastActiveTracked) return next();
    return trackLastActive(req, res, next);
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

module.exports = { requireAuth, requireRole, trackAuthenticatedRequest, trackLastActive };
