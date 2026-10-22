const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/requireAuth");
const { limitChatPhotoUploads, limitTypingUpdates } = require("../middleware/rateLimits");
const chatPhotoUpload = require("../storage/chatPhotoUpload");
const {
  handleListConversations,
  handleCreateConversation,
  handleListMessages,
  handleConversationTyping,
  handleSendMessage,
  handleUploadChatPhoto,
  handleReadChatPhoto,
  handleCleanupChatPhotos,
  handleCashConfirmation,
  handleArchiveConversation,
  handleReportConversation,
} = require("../controllers/messageController");

const router = express.Router();

function receiveChatPhoto(req, res, next) {
  chatPhotoUpload.single("photo")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Chat photos must be 4 MB or smaller." });
    }
    if (error.message === "Only JPEG, PNG, WebP, or GIF photos are allowed.") {
      return res.status(400).json({ message: error.message });
    }
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ message: "Upload one photo at a time." });
    }
    console.error("Chat photo upload parsing error:", error);
    return res.status(500).json({ message: "Could not receive this photo." });
  });
}

router.get("/conversations", requireAuth, handleListConversations);
router.post("/conversations", requireAuth, handleCreateConversation);
router.post("/messages/photos", requireAuth, limitChatPhotoUploads, receiveChatPhoto, handleUploadChatPhoto);
router.post("/messages/photos/cleanup", requireAuth, handleCleanupChatPhotos);
router.get("/messages/:conversationId/:messageId/photos/:photoIndex", requireAuth, handleReadChatPhoto);
router.get("/messages/:conversationId", requireAuth, handleListMessages);
router.put("/conversations/:conversationId/typing", requireAuth, limitTypingUpdates, handleConversationTyping);
router.post("/messages", requireAuth, handleSendMessage);
router.patch("/conversations/:conversationId/payment", requireAuth, handleCashConfirmation);
router.patch("/conversations/:conversationId/archive", requireAuth, handleArchiveConversation);
router.post("/conversations/:conversationId/report", requireAuth, handleReportConversation);

module.exports = router;