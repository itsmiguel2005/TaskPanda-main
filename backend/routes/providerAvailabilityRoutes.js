const express = require("express");
const { body } = require("express-validator");
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const { validateRequest } = require("../middleware/validateRequest");
const { handleUpdateProviderAvailability } = require("../controllers/profileController");

const router = express.Router();

router.patch(
  "/availability",
  requireAuth,
  requireRole("provider"),
  body("isAvailable").isBoolean(),
  validateRequest,
  handleUpdateProviderAvailability
);

module.exports = router;
