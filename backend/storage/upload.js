const multer = require("multer");
const { BOOKING_PHOTO_MAX_BYTES } = require("../services/cloudinaryMedia");

const allowedMimeTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BOOKING_PHOTO_MAX_BYTES, files: 1, fields: 0, parts: 1 },
  fileFilter: (_req, file, callback) => {
    const accepted = allowedMimeTypes.has(file.mimetype);
    callback(accepted ? null : new Error("Only JPEG, PNG, WebP, or GIF photos are allowed."), accepted);
  },
});
