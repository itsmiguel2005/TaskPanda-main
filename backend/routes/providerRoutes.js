const express = require("express");
const { handleDiscoverProviders, handleProviderAvailability } = require("../controllers/providerController");

const router = express.Router();

router.param("id", (req, res, next, id) => {
	if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ message: "Choose a valid provider." });
	return next();
});

router.get("/", handleDiscoverProviders);

router.get("/:id/availability", handleProviderAvailability);

module.exports = router;
