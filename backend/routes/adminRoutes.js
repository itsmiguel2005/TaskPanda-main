const express = require("express");
const { handleGetAdminAnalytics } = require("../controllers/adminController");
const { requireAdmin } = require("../middleware/requireAdmin");

const router = express.Router();

router.get("/analytics", requireAdmin, handleGetAdminAnalytics);

module.exports = router;