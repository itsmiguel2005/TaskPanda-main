const express = require("express");
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const { limitVerificationUploads } = require("../middleware/rateLimits");
const { sanitizeMongoInput } = require("../middleware/sanitizeMongoInput");
const { uploadVerificationImages } = require("../storage/verificationUpload");
const { handleSubmitVerification } = require("../controllers/verificationController");

const router = express.Router();

router.post("/verify", requireAuth, requireRole("client", "provider"), limitVerificationUploads, uploadVerificationImages, sanitizeMongoInput, handleSubmitVerification);

module.exports = router;