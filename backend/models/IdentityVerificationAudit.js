const mongoose = require("mongoose");

const identityVerificationAuditSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  identifierHashPrefix: { type: String, trim: true, maxlength: 16, default: "" },
  status: { type: String, enum: ["SUCCESS", "FAILURE", "PENDING_MANUAL_REVIEW"], required: true },
  reason: {
    type: String,
    enum: ["verified", "manual_review", "invalid_document", "image_quality", "identity_mismatch", "underage", "duplicate_identifier", "processing_error"],
    required: true,
  },
  ipAddress: { type: String, trim: true, maxlength: 100, default: "" },
  createdAt: { type: Date, default: Date.now },
});

identityVerificationAuditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });
identityVerificationAuditSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("IdentityVerificationAudit", identityVerificationAuditSchema);
