const express = require("express");
const { requireAuth } = require("../middleware/requireAuth");
const {
  handleGetClientFavorites,
  handleAddClientFavorite,
  handleRemoveClientFavorite,
} = require("../controllers/favoriteController");

const router = express.Router();

router.use(requireAuth);
router.get("/favorites", handleGetClientFavorites);
router.post("/favorites", handleAddClientFavorite);
router.delete("/favorites/:providerId", handleRemoveClientFavorite);

module.exports = router;
