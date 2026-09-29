const express = require("express");
const { body } = require("express-validator");
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const { limitVerificationUploads } = require("../middleware/rateLimits");
const { sanitizeMongoInput } = require("../middleware/sanitizeMongoInput");
const { validateRequest } = require("../middleware/validateRequest");
const upload = require("../storage/upload");

const router = express.Router();

router.post("/verify", requireAuth, requireRole("client", "provider"), limitVerificationUploads, upload.fields([
  { name: "idFront", maxCount: 1 },
  { name: "idBack", maxCount: 1 },
]), sanitizeMongoInput, body("certificate").optional().isString().isLength({ max: 200 }), validateRequest, (req, res) => {
  if (!req.files || !req.files.idFront || !req.files.idBack) {
    return res.status(400).json({ error: "Both ID front and ID back images are required" });
  }
  return res.json({ success: true });
});

module.exports = router;