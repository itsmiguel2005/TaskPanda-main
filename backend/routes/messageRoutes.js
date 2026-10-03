const express = require("express");
const { requireAuth } = require("../middleware/requireAuth");
const { limitChatPhotoUploads, limitTypingUpdates } = require("../middleware/rateLimits");
const chatPhotoUpload = require("../storage/chatPhotoUpload");
const {
  handleListConversations,
  handleCreateConversation,
  handleListMessages,
  handleCounterOfferTyping,
  handleSendMessage,
  handleUploadChatPhoto,
  handleReadChatPhoto,
  handleCleanupChatPhotos,
  handleCashConfirmation,
  handleArchiveConversation,
  handleReportConversation,
} = require("../controllers/messageController");

const router = express.Router();

router.get("/conversations", requireAuth, handleListConversations);
router.post("/conversations", requireAuth, handleCreateConversation);
router.post("/messages/photos", requireAuth, limitChatPhotoUploads, chatPhotoUpload.single("photo"), handleUploadChatPhoto);
router.post("/messages/photos/cleanup", requireAuth, handleCleanupChatPhotos);
router.get("/messages/:conversationId/:messageId/photos/:photoIndex", requireAuth, handleReadChatPhoto);
router.get("/messages/:conversationId", requireAuth, handleListMessages);
router.put("/conversations/:conversationId/typing", requireAuth, limitTypingUpdates, handleCounterOfferTyping);
router.post("/messages", requireAuth, handleSendMessage);
router.patch("/conversations/:conversationId/payment", requireAuth, handleCashConfirmation);
router.patch("/conversations/:conversationId/archive", requireAuth, handleArchiveConversation);
router.post("/conversations/:conversationId/report", requireAuth, handleReportConversation);

module.exports = router;