const IdentityVerificationAudit = require("../models/IdentityVerificationAudit");

async function recordIdentityVerificationAttempt(req, {
  identifierHash,
  reason,
  status,
  userId,
}) {
  await IdentityVerificationAudit.create({
    userId: userId || req.user?._id,
    identifierHashPrefix: String(identifierHash || "").slice(0, 16),
    status,
    reason,
    ipAddress: String(req.ip || req.socket?.remoteAddress || "").slice(0, 100),
  });
  if (req) req.identityAuditRecorded = true;
}

function auditRejectedVerificationRequests(req, res, next) {
  res.once("finish", () => {
    if (req.identityAuditRecorded || res.statusCode < 400 || !req.user?._id) return;
    const reason = res.statusCode === 422 ? "invalid_document" : "processing_error";
    void recordIdentityVerificationAttempt(req, {
      reason,
      status: "FAILURE",
      userId: req.user._id,
    }).catch((error) => {
      console.error("Identity verification rejection audit write failed:", error.message);
    });
  });
  next();
}

module.exports = {
  auditRejectedVerificationRequests,
  recordIdentityVerificationAttempt,
};
