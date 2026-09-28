const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

favoriteSchema.index({ clientId: 1, providerId: 1 }, { unique: true });

module.exports = mongoose.model("Favorite", favoriteSchema);
