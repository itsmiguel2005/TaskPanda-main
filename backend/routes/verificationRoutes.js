const express = require("express");
const upload = require("../storage/upload");

const router = express.Router();

router.post("/verify", upload.fields([
  { name: "idFront", maxCount: 1 },
  { name: "idBack", maxCount: 1 },
]), (req, res) => {
  if (!req.files || !req.files.idFront || !req.files.idBack) {
    return res.status(400).json({ error: "Both ID front and ID back images are required" });
  }
  return res.json({ success: true });
});

module.exports = router;