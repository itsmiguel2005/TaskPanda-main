const express = require("express");
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const { limitVerificationUploads } = require("../middleware/rateLimits");
const { sanitizeMongoInput } = require("../middleware/sanitizeMongoInput");
const { uploadVerificationImages } = require("../storage/verificationUpload");
const {
  handleGetVerificationNotifications,
  handleMarkVerificationNotificationRead,
  handleSubmitVerification,
} = require("../controllers/verificationController");

const router = express.Router();

router.post("/verify", requireAuth, requireRole("client", "provider"), limitVerificationUploads, uploadVerificationImages, sanitizeMongoInput, handleSubmitVerification);
router.get("/verification-notifications", requireAuth, requireRole("client", "provider"), handleGetVerificationNotifications);
router.post("/verification-notifications/:notificationId/read", requireAuth, requireRole("client", "provider"), handleMarkVerificationNotificationRead);

module.exports = router;