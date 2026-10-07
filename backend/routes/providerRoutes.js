const express = require("express");
const { param } = require("express-validator");
const { handleDiscoverProviders, handleGetProviderProfile } = require("../controllers/providerController");
const { validateRequest } = require("../middleware/validateRequest");

const router = express.Router();

router.get("/", handleDiscoverProviders);
router.get("/:providerId/profile", param("providerId").isMongoId(), validateRequest, handleGetProviderProfile);

module.exports = router;
