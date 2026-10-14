const mongoose = require("mongoose");

const AUDIT_CATEGORIES = ["SECURITY", "OPERATIONS", "FINANCIAL", "GOVERNANCE"];
const AUDIT_ACTIONS = [
  "ADMIN_LOGIN",
  "ADMIN_LOGOUT",
  "FAILED_LOGIN_ATTEMPT",
  "CREDENTIALS_UPDATED",
  "PASSWORD_RESET",
  "USER_SUSPENDED",
  "USER_UNSUSPENDED",
  "PROVIDER_SUSPENDED",
  "VERIFICATION_APPROVED",
  "VERIFICATION_REJECTED",
  "ROLE_MODIFIED",
  "REFUND_ISSUED",
  "PAYMENT_RELEASED",
  "PLATFORM_FEE_MODIFIED",
  "REPORT_RESOLVED",
  "REVIEW_REMOVED",
  "SYSTEM_SETTING_TOGGLED",
  "ADMIN_ACCOUNT_CREATED",
];

const auditLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  adminName: { type: String, required: true, trim: true, maxlength: 254 },
  category: { type: String, enum: AUDIT_CATEGORIES, required: true },
  action: { type: String, enum: AUDIT_ACTIONS, required: true },
  targetResource: { type: String, required: true, trim: true, maxlength: 100 },
  targetId: { type: String, trim: true, maxlength: 100 },
  details: { type: String, trim: true, required: true, maxlength: 2000 },
  ipAddress: { type: String, trim: true, maxlength: 100 },
  userAgent: { type: String, trim: true, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now, index: true },
});

auditLogSchema.index({ category: 1, createdAt: -1 });
auditLogSchema.index({ adminName: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
module.exports.AUDIT_CATEGORIES = AUDIT_CATEGORIES;
module.exports.AUDIT_ACTIONS = AUDIT_ACTIONS;
