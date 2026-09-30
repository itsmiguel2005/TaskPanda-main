const mongoose = require("mongoose");

const adminAuthRateLimitSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });

module.exports = mongoose.model("AdminAuthRateLimit", adminAuthRateLimitSchema);