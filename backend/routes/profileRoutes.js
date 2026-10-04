const express = require("express");
const { body } = require("express-validator");
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const { handleGetProfile, handleUpdateProfile, handleUploadProfilePhoto } = require("../controllers/profileController");
const { validateRequest } = require("../middleware/validateRequest");
const { limitProfilePhotoUploads } = require("../middleware/rateLimits");
const uploadProfilePhoto = require("../storage/profilePhotoUpload");

const router = express.Router();

router.use(requireAuth, requireRole("client", "provider"));
router.get("/", handleGetProfile);
router.post("/photo", limitProfilePhotoUploads, uploadProfilePhoto.single("photo"), handleUploadProfilePhoto);
router.put("/", [
	body("fullName").isString().trim().isLength({ min: 1, max: 100 }),
	body("firstName").optional().isString().isLength({ max: 80 }),
	body("middleName").optional().isString().isLength({ max: 80 }),
	body("lastName").optional().isString().isLength({ max: 80 }),
	body("username").isString().trim().isLength({ min: 3, max: 30 }),
	body("mobileNumber").isString().isLength({ max: 11 }),
	body("province").optional().isString().isLength({ max: 100 }),
	body("city").optional().isString().isLength({ max: 100 }),
	body("barangay").optional().isString().isLength({ max: 100 }),
	body("geoLocation").optional().isObject(),
	body("geoLocation.type").optional().equals("Point"),
	body("geoLocation.coordinates").optional().isArray({ min: 2, max: 2 }),
	body("geoLocation.coordinates.*").optional().isFloat(),
	body("professions").optional().isArray({ max: 20 }),
	body("professions.*").optional().isString().trim().isLength({ min: 1, max: 80 }),
	body("bio").optional().isString().isLength({ max: 500 }),
], validateRequest, handleUpdateProfile);

module.exports = router;