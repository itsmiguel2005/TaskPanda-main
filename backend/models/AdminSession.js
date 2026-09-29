const mongoose = require("mongoose");

const adminSessionSchema = new mongoose.Schema({
  adminEmail: { type: String, required: true, lowercase: true, trim: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });

module.exports = mongoose.model("AdminSession", adminSessionSchema);