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
    }));
    if (!user) return res.status(401).json({ message: "Your session expired. Sign in again." });
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { requireAuth };
