const path = require("path");
const fs = require("fs");
const multer = require("multer");
const uploadDirectory = path.join(__dirname, "../../uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => fs.mkdir(uploadDirectory, { recursive: true }, (error) => cb(error, uploadDirectory)),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + "-" + path.basename(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5,
    fields: 40,
    fieldSize: 10 * 1024,
    parts: 45,
  },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const ok = allowed.test(file.mimetype);
    cb(ok ? null : new Error("Only image files are allowed"), ok);
  },
});

module.exports = upload;