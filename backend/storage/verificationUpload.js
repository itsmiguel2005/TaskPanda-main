const path = require("path");
const fs = require("fs");
const os = require("os");
const multer = require("multer");
const { randomUUID } = require("crypto");

const verificationUploadDirectory = path.join(os.tmpdir(), "taskpanda-verifications");
const allowedTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    fs.mkdir(verificationUploadDirectory, { recursive: true }, (error) => callback(error, verificationUploadDirectory));
  },
  filename: (_req, file, callback) => {
    callback(null, `${randomUUID()}${allowedTypes.get(file.mimetype) || ".img"}`);
  },
});

function removeUploadedFiles(files) {
  return Promise.all((files || []).map((file) => fs.promises.unlink(file.path).catch((error) => {
    if (error.code !== "ENOENT") console.error("Could not remove verification upload temp image:", error.message);
  })));
}

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 2, fields: 1, fieldSize: 200, parts: 3 },
  fileFilter: (_req, file, callback) => {
    const accepted = allowedTypes.has(file.mimetype);
    const error = accepted ? null : new Error("Choose a JPEG, PNG, or WebP image.");
    if (error) error.statusCode = 400;
    callback(error, accepted);
  },
});

const uploadFields = upload.fields([
  { name: "idFront", maxCount: 1 },
  { name: "idBack", maxCount: 1 },
]);

function uploadVerificationImages(req, res, next) {
  uploadFields(req, res, async (error) => {
    if (!error) return next();
    const files = Object.values(req.files || {}).flat();
    await removeUploadedFiles(files);

    if (error.statusCode === 400) return res.status(400).json({ message: error.message });
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE" || error.code === "LIMIT_FIELD_VALUE";
      return res.status(tooLarge ? 413 : 400).json({
        message: tooLarge ? "Each ID image must be 2 MB or smaller." : error.message,
      });
    }
    console.error("Verification image upload error:", error);
    return res.status(500).json({ message: "Could not receive your verification images." });
  });
}

module.exports = { removeUploadedFiles, uploadVerificationImages };
