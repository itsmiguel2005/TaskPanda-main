const express = require("express");
const { body } = require("express-validator");
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const { handleUpdateDashboardPreferences } = require("../controllers/profileController");
const { validateRequest } = require("../middleware/validateRequest");

const router = express.Router();

router.patch(
  "/preferences",
  requireAuth,
  requireRole("client", "provider"),
  body("dashboardDensityPreference").isIn(["comfortable", "compact"]),
  validateRequest,
  handleUpdateDashboardPreferences
);

module.exports = router;
