const mongoose = require("mongoose");

const adminLoginChallengeSchema = new mongoose.Schema({
  adminEmail: { type: String, required: true, unique: true, lowercase: true, trim: true },
  challengeTokenHash: { type: String, required: true, unique: true, select: false },
  codeHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true, expires: 0 },
  attempts: { type: Number, required: true, default: 0 },
  consumedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("AdminLoginChallenge", adminLoginChallengeSchema);