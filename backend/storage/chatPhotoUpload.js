const multer = require("multer");

const CHAT_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CHAT_PHOTO_MAX_BYTES, files: 1, fields: 1, parts: 2 },
  fileFilter: (_req, file, callback) => {
    callback(allowedMimeTypes.has(file.mimetype) ? null : new Error("Only JPEG, PNG, WebP, or GIF photos are allowed."), allowedMimeTypes.has(file.mimetype));
  },
});