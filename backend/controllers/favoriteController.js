const mongoose = require("mongoose");
const Favorite = require("../models/Favorite");
const User = require("../models/User");
const { getProviderStreaks } = require("../services/providerStreak");

async function handleGetClientFavorites(req, res) {
  try {
    const favorites = await Favorite.find({ clientId: req.user._id })
      .sort({ createdAt: -1 })
      .populate({
        path: "providerId",
        select: "_id fullName username professions bio city province barangay isVerified verificationStatus averageRating totalReviews profileImage tesdaCertificates",
      });

    const availableFavorites = favorites.filter((favorite) => favorite.providerId);
    const providerStreaks = await getProviderStreaks(availableFavorites.map((favorite) => favorite.providerId._id));
    const payload = favorites
      .filter((favorite) => favorite.providerId)
      .map((favorite) => ({
        _id: favorite.providerId._id.toString(),
        id: favorite.providerId._id.toString(),
        fullName: favorite.providerId.fullName || favorite.providerId.username || "Provider",
        username: favorite.providerId.username || "",
        professions: favorite.providerId.professions || [],
        bio: favorite.providerId.bio || "",
        city: favorite.providerId.city || "",
        province: favorite.providerId.province || "",
        barangay: favorite.providerId.barangay || "",
        isVerified: favorite.providerId.isVerified || false,
        verificationStatus: favorite.providerId.verificationStatus || "unverified",
        averageRating: favorite.providerId.averageRating || 0,
        totalReviews: favorite.providerId.totalReviews || 0,
        profileImage: favorite.providerId.profileImage || "",
        tesdaCertificates: (favorite.providerId.tesdaCertificates || [])
          .filter((certificate) => certificate.status === "approved")
          .map((certificate) => ({
            trade: certificate.trade,
            status: certificate.status,
          })),
        onTimeStreak: providerStreaks.get(String(favorite.providerId._id)) || { count: 0, milestone: null, nextMilestone: 5 },
      }));

    return res.json({ favorites: payload });
  } catch (error) {
    console.error("Get favorites error:", error);
    return res.status(500).json({ message: "Could not load your favorites." });
  }
}

async function handleAddClientFavorite(req, res) {
  try {
    const providerId = String(req.body.providerId || "").trim();
    if (!providerId || !mongoose.isValidObjectId(providerId)) {
      return res.status(400).json({ message: "Choose a valid provider to favorite." });
    }

    const provider = await User.findOne({
      _id: providerId,
      role: "provider",
      registrationComplete: true,
      isSuspended: mongoose.trusted({ $ne: true }),
      archivedAt: null,
    }).select("_id");
    if (!provider) {
      return res.status(404).json({ message: "This provider could not be found." });
    }

    const existingFavorite = await Favorite.findOne({ clientId: req.user._id, providerId: provider._id });
    if (existingFavorite) {
      return res.status(200).json({ favorite: { providerId: provider._id }, message: "Provider already saved to favorites." });
    }

    const favorite = await Favorite.create({ clientId: req.user._id, providerId: provider._id });
    return res.status(201).json({ favorite, message: "Provider saved to favorites." });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(200).json({ message: "Provider already saved to favorites." });
    }
    console.error("Add favorite error:", error);
    return res.status(500).json({ message: "Could not save this provider to favorites." });
  }
}

async function handleRemoveClientFavorite(req, res) {
  try {
    const providerId = String(req.params.providerId || "").trim();
    if (!providerId || !mongoose.isValidObjectId(providerId)) {
      return res.status(400).json({ message: "Choose a valid provider to remove." });
    }

    const result = await Favorite.deleteOne({ clientId: req.user._id, providerId: new mongoose.Types.ObjectId(providerId) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "This provider is not in your favorites." });
    }

    return res.json({ message: "Provider removed from favorites." });
  } catch (error) {
    console.error("Remove favorite error:", error);
    return res.status(500).json({ message: "Could not remove this provider from favorites." });
  }
}

module.exports = {
  handleGetClientFavorites,
  handleAddClientFavorite,
  handleRemoveClientFavorite,
};
