const express = require("express");
const { handleDiscoverProviders } = require("../controllers/providerController");

const router = express.Router();

router.get("/", handleDiscoverProviders);

module.exports = router;
