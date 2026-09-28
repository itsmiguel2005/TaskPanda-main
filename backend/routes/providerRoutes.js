const express = require("express");
const { handleDiscoverProviders, handleProviderAvailability } = require("../controllers/providerController");

const router = express.Router();

router.get("/", handleDiscoverProviders);

router.get("/:id/availability", handleProviderAvailability);

module.exports = router;
