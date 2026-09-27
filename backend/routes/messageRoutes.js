const express = require("express");
const { requireAuth } = require("../middleware/requireAuth");
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

router.get("/conversations", requireAuth, handleListConversations);
router.post("/conversations", requireAuth, handleCreateConversation);
router.get("/messages/:conversationId", requireAuth, handleListMessages);
router.post("/messages", requireAuth, handleSendMessage);
router.patch("/conversations/:conversationId/payment", requireAuth, handleCashConfirmation);
router.patch("/conversations/:conversationId/archive", requireAuth, handleArchiveConversation);
router.post("/conversations/:conversationId/report", requireAuth, handleReportConversation);

module.exports = router;