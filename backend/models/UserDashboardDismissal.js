const mongoose = require("mongoose");

const userDashboardDismissalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["booking", "broadcast"], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

userDashboardDismissalSchema.index({ userId: 1, kind: 1, targetId: 1 }, { unique: true });
userDashboardDismissalSchema.index({ userId: 1, kind: 1 });

module.exports = mongoose.model("UserDashboardDismissal", userDashboardDismissalSchema);
