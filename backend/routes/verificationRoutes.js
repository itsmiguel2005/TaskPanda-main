const express = require("express");
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const { limitVerificationUploads } = require("../middleware/rateLimits");
const { sanitizeMongoInput } = require("../middleware/sanitizeMongoInput");
const { uploadTesdaCertificate, uploadVerificationImages } = require("../storage/verificationUpload");
const {
  handleGetVerificationNotifications,
  handleMarkVerificationNotificationRead,
  handleSubmitVerification,
  handleSubmitTesdaCertificate,
} = require("../controllers/verificationController");

const router = express.Router();

router.post("/verify", requireAuth, requireRole("client", "provider"), limitVerificationUploads, uploadVerificationImages, sanitizeMongoInput, handleSubmitVerification);
router.post("/tesda-certificates", requireAuth, requireRole("provider"), limitVerificationUploads, uploadTesdaCertificate, sanitizeMongoInput, handleSubmitTesdaCertificate);
router.get("/verification-notifications", requireAuth, requireRole("client", "provider"), handleGetVerificationNotifications);
router.post("/verification-notifications/:notificationId/read", requireAuth, requireRole("client", "provider"), handleMarkVerificationNotificationRead);

module.exports = router;