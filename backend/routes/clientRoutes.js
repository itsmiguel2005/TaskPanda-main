const express = require("express");
const { param } = require("express-validator");
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const { validateRequest } = require("../middleware/validateRequest");
const {
  handleGetClientFavorites,
  handleAddClientFavorite,
  handleRemoveClientFavorite,
} = require("../controllers/favoriteController");

const router = express.Router();

router.use(requireAuth, requireRole("client"));
router.get("/favorites", handleGetClientFavorites);
router.post("/favorites", handleAddClientFavorite);
router.delete("/favorites/:providerId", param("providerId").isMongoId(), validateRequest, handleRemoveClientFavorite);

module.exports = router;
