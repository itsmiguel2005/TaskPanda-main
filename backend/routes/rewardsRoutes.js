const express = require("express");
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const {
  handleGetRewards,
  handleGetRewardNotifications,
  handleMarkRewardNotificationRead,
} = require("../controllers/rewardsController");

const router = express.Router();

router.use(requireAuth, requireRole("client"));
router.get("/", handleGetRewards);
router.get("/notifications", handleGetRewardNotifications);
router.post("/notifications/:notificationId/read", handleMarkRewardNotificationRead);

module.exports = router;
