const express = require("express");
const { param } = require("express-validator");
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const { validateRequest } = require("../middleware/validateRequest");
const {
  handleListConversations,
  handleCreateConversation,
  handleListMessages,
  handleSendMessage,
  handleCashConfirmation,
  handleArchiveConversation,
  handleReportConversation,
} = require("../controllers/messageController");

const router = express.Router();

router.use(requireAuth, requireRole("client", "provider"));
router.get("/conversations", handleListConversations);
router.post("/conversations", handleCreateConversation);
router.param("conversationId", (req, res, next, id) => {
  if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ message: "Choose a valid conversation." });
  return next();
});
router.get("/messages/:conversationId", param("conversationId").isMongoId(), validateRequest, handleListMessages);
router.post("/messages", handleSendMessage);
router.patch("/conversations/:conversationId/payment", handleCashConfirmation);
router.patch("/conversations/:conversationId/archive", handleArchiveConversation);
router.post("/conversations/:conversationId/report", handleReportConversation);

module.exports = router;