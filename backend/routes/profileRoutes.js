const express = require("express");
const { handleGetProfile, handleUpdateProfile } = require("../controllers/profileController");

const router = express.Router();

router.get("/", handleGetProfile);
router.put("/", handleUpdateProfile);

module.exports = router;