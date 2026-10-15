const mongoose = require("mongoose");

const referralLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    ipHash: { type: String, default: "", maxlength: 64 },
    deviceHash: { type: String, default: "", maxlength: 64 },
  },
  { timestamps: true }
);

referralLogSchema.index(
  { userId: 1, referredBy: 1, ipHash: 1, deviceHash: 1 },
  { unique: true }
);
referralLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("ReferralLog", referralLogSchema);
