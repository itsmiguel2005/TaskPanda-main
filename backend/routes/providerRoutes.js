const express = require("express");
const { param, query } = require("express-validator");
const { handleDiscoverProviders, handleDiscoverProviderMapMarkers, handleGetProviderProfile } = require("../controllers/providerController");
const { validateRequest } = require("../middleware/validateRequest");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

router.get("/map", requireAuth, [
  query("latitude").isFloat({ min: -90, max: 90 }),
  query("longitude").isFloat({ min: -180, max: 180 }),
], validateRequest, handleDiscoverProviderMapMarkers);
router.get("/", handleDiscoverProviders);
router.get("/:providerId/profile", param("providerId").isMongoId(), validateRequest, handleGetProviderProfile);

module.exports = router;
