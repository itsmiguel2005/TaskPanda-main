const express = require("express");
const { body, param, query } = require("express-validator");
const { handleDiscoverProviders, handleDiscoverProviderMapMarkers, handleGetProviderProfile } = require("../controllers/providerController");
const { handleUpdateProviderPreferences } = require("../controllers/profileController");
const { validateRequest } = require("../middleware/validateRequest");
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const { limitPublicProviderSearch } = require("../middleware/rateLimits");

const router = express.Router();

router.patch(
  "/preferences",
  requireAuth,
  requireRole("provider"),
  body("providerIncomingRequestsDensityPreference").custom((_, { req }) => {
    const preferenceFields = [
      "providerIncomingRequestsDensityPreference",
      "providerJobsDensityPreference",
    ];
    const suppliedFields = preferenceFields.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    return suppliedFields.length === 1 && ["comfortable", "compact"].includes(req.body[suppliedFields[0]]);
  }),
  validateRequest,
  handleUpdateProviderPreferences
);
router.get("/map", limitPublicProviderSearch, [
  query("latitude").isFloat({ min: -90, max: 90 }),
  query("longitude").isFloat({ min: -180, max: 180 }),
], validateRequest, handleDiscoverProviderMapMarkers);
router.get("/", limitPublicProviderSearch, handleDiscoverProviders);
router.get("/:providerId/profile", limitPublicProviderSearch, param("providerId").isMongoId(), validateRequest, handleGetProviderProfile);

module.exports = router;
