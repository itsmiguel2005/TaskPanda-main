const express = require("express");
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const { handleGetBroadcasts, handleDismissBroadcast, handleMigrateBroadcastDismissals } = require("../controllers/broadcastController");

const router = express.Router();

router.get("/", requireAuth, requireRole("client", "provider"), handleGetBroadcasts);
router.post("/dismissals", requireAuth, requireRole("client", "provider"), handleMigrateBroadcastDismissals);
router.post("/:id/dismiss", requireAuth, requireRole("client", "provider"), handleDismissBroadcast);

module.exports = router;
