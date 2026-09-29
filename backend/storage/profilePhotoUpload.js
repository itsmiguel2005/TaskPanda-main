const multer = require("multer");

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  fileFilter: (_req, file, callback) => {
    callback(allowedMimeTypes.has(file.mimetype) ? null : new Error("Choose a JPEG, PNG, WebP, or GIF image."), allowedMimeTypes.has(file.mimetype));
  },
});