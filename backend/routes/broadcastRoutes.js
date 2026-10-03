const express = require("express");
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const { handleGetBroadcasts } = require("../controllers/broadcastController");

const router = express.Router();

router.get("/", requireAuth, requireRole("client", "provider"), handleGetBroadcasts);

module.exports = router;
