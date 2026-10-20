const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const User = require("../models/User");
const { getProviderStreaks } = require("../services/providerStreak");

const MAX_DISTANCE_KM = 10;
const DEFAULT_LIMIT = 24;
const MAP_MARKER_LIMIT = 100;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizePublicText(value) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email hidden]")
    .replace(/(?:\+?63[\s().-]*)?0?9\d{2}[\s().-]*\d{3}[\s.-]*\d{4}/g, (candidate) => {
      const digitCount = candidate.replace(/\D/g, "").length;
      return digitCount >= 10 && digitCount <= 13 ? "[phone hidden]" : candidate;
    });
}

function toPublicProvider(provider, streak) {
  const isVerified = provider.isVerified === true && provider.verificationStatus === "verified";
  return {
    _id: String(provider._id),
    fullName: sanitizePublicText(provider.businessName || provider.fullName || provider.username || "Local provider"),
    username: sanitizePublicText(provider.username || ""),
    profileImage: provider.profileImage || "",
    professions: Array.isArray(provider.professions) ? provider.professions : [],
    bio: sanitizePublicText(provider.bio),
    isVerified,
    verificationStatus: isVerified ? "verified" : "unverified",
    averageRating: Number(provider.averageRating || 0),
    totalReviews: Number(provider.totalReviews || 0),
    city: provider.city || "",
    province: provider.province || "",
    distanceKm: Number(provider.distanceKm || 0),
    lastActive: provider.lastActive || null,
    isOnline: provider.isOnline === true,
    tesdaCertificates: Array.isArray(provider.tesdaCertificates)
      ? provider.tesdaCertificates.map((certificate) => ({ trade: certificate.trade || "", status: "approved" }))
      : [],
    onTimeStreak: streak || { count: 0, milestone: null, nextMilestone: 5 },
  };
}

async function handleDiscoverProviders(req, res) {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  const minKm = Number(req.query.minKm ?? 0);
  const maxKm = Number(req.query.maxKm ?? MAX_DISTANCE_KM);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || DEFAULT_LIMIT));
  const search = String(req.query.q || "").trim().slice(0, 100);
  const categories = String(req.query.categories || "")
    .split(",")
    .map((category) => category.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 20);
  const tesdaOnly = req.query.credential === "tesda";
  const philsysVerifiedOnly = req.query.philsysVerified === "true";

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ message: "Set a valid search location to find nearby providers.", field: "location" });
  }
  if (!Number.isFinite(minKm) || !Number.isFinite(maxKm) || minKm < 0 || maxKm <= minKm || maxKm > MAX_DISTANCE_KM) {
    return res.status(400).json({ message: `Choose a distance range between 0 and ${MAX_DISTANCE_KM} km.`, field: "distance" });
  }

  const providerQuery = {
    role: "provider",
    registrationComplete: true,
    isSuspended: { $ne: true },
    archivedAt: { $exists: false },
    "geoLocation.type": "Point",
  };
  if (categories.length) {
    providerQuery.professions = {
      $in: categories.map((category) => new RegExp(`^${escapeRegex(category)}$`, "i")),
    };
  }
  if (tesdaOnly) providerQuery.tesdaCertificates = { $elemMatch: { status: "approved" } };
  if (philsysVerifiedOnly) {
    providerQuery.isVerified = true;
    providerQuery.verificationStatus = "verified";
  }

  const searchPattern = search ? new RegExp(escapeRegex(search), "i") : null;
  const searchMatch = searchPattern ? {
    $or: [
      { fullName: searchPattern },
      { username: searchPattern },
      { professions: searchPattern },
      { province: searchPattern },
      { city: searchPattern },
      { barangay: searchPattern },
    ],
  } : null;

  try {
    const [result = { providers: [], metadata: [] }] = await User.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [longitude, latitude] },
          key: "geoLocation",
          distanceField: "distanceMeters",
          minDistance: minKm * 1000,
          maxDistance: maxKm * 1000,
          spherical: true,
          query: providerQuery,
        },
      },
      ...(searchMatch ? [{ $match: searchMatch }] : []),
      { $sort: { distanceMeters: 1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          providers: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                businessName: 1,
                fullName: 1,
                username: 1,
                isVerified: 1,
                verificationStatus: 1,
                profileImage: 1,
                professions: 1,
                bio: 1,
                averageRating: 1,
                totalReviews: 1,
                province: 1,
                city: 1,
                lastActive: 1,
                isOnline: 1,
                distanceKm: { $round: [{ $divide: ["$distanceMeters", 1000] }, 2] },
                tesdaCertificates: {
                  $map: {
                    input: {
                      $filter: {
                        input: { $ifNull: ["$tesdaCertificates", []] },
                        as: "certificate",
                        cond: { $eq: ["$$certificate.status", "approved"] },
                      },
                    },
                    as: "certificate",
                    in: { trade: "$$certificate.trade", status: "$$certificate.status" },
                  },
                },
              },
            },
          ],
        },
      },
    ]);

    const providerStreaks = await getProviderStreaks(result.providers.map((provider) => provider._id));
    res.set("Cache-Control", "private, no-store");
    return res.json({
      providers: result.providers.map((provider) => toPublicProvider(
        provider,
        providerStreaks.get(String(provider._id)),
      )),
      total: result.metadata[0]?.total || 0,
      page,
      limit,
      distanceRange: { minKm, maxKm },
    });
  } catch (error) {
    console.error("Provider discovery error:", error);
    return res.status(500).json({ message: "Could not load nearby providers." });
  }
}

async function handleDiscoverProviderMapMarkers(req, res) {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ message: "Move the map to a valid location to find nearby providers.", field: "location" });
  }

  try {
    const providers = await User.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [longitude, latitude] },
          key: "geoLocation",
          distanceField: "distanceMeters",
          maxDistance: MAX_DISTANCE_KM * 1000,
          spherical: true,
          query: {
            role: "provider",
            registrationComplete: true,
            isSuspended: { $ne: true },
            archivedAt: { $exists: false },
            "geoLocation.type": "Point",
          },
        },
      },
      { $sort: { distanceMeters: 1 } },
      { $limit: MAP_MARKER_LIMIT },
      {
        $project: {
          _id: 1,
          businessName: 1,
          fullName: 1,
          username: 1,
          profileImage: 1,
          professions: 1,
          isVerified: 1,
          verificationStatus: 1,
          averageRating: 1,
          totalReviews: 1,
          "mapLocation.type": { $literal: "Point" },
          "mapLocation.coordinates": [
            { $round: [{ $arrayElemAt: ["$geoLocation.coordinates", 0] }, 2] },
            { $round: [{ $arrayElemAt: ["$geoLocation.coordinates", 1] }, 2] },
          ],
        },
      },
    ]);

    return res.json({
      providers: providers.map((provider) => ({
        id: String(provider._id),
        name: sanitizePublicText(provider.businessName || provider.fullName || provider.username || "Local provider"),
        username: sanitizePublicText(provider.username || ""),
        profileImage: provider.profileImage || "",
        professions: provider.professions || [],
        isVerified: provider.isVerified === true || provider.verificationStatus === "verified",
        rating: Number(provider.averageRating || 0),
        reviews: Number(provider.totalReviews || 0),
        mapLocation: provider.mapLocation,
      })),
      approximateLocationPrecision: "about 1 km",
    });
  } catch (error) {
    console.error("Provider map discovery error:", error);
    return res.status(500).json({ message: "Could not load provider map markers." });
  }
}

async function handleGetProviderProfile(req, res) {
  try {
    const provider = await User.findOne({
      _id: req.params.providerId,
      role: "provider",
      registrationComplete: true,
      isSuspended: mongoose.trusted({ $ne: true }),
      archivedAt: null,
    })
      .select("businessName fullName username profileImage professions bio isVerified verificationStatus averageRating totalReviews province city barangay tesdaCertificates +lastActive +isOnline")
      .lean();

    if (!provider) return res.status(404).json({ message: "This provider could not be found." });

    const completedStatuses = ["complete", "closed", "settled", "Completed", "Settled"];
    const [completedJobs, reviews] = await Promise.all([
      Booking.countDocuments({
        providerId: provider._id,
        status: mongoose.trusted({ $in: completedStatuses }),
      }),
      Booking.aggregate([
        {
          $match: {
            providerId: provider._id,
            status: { $in: completedStatuses },
            clientRating: { $gte: 1 },
            clientReview: { $type: "string", $ne: "" },
          },
        },
        { $sort: { reviewedAt: -1, updatedAt: -1, _id: -1 } },
        {
          $group: {
            _id: "$clientId",
            latestReview: { $first: "$$ROOT" },
          },
        },
        { $replaceRoot: { newRoot: "$latestReview" } },
        { $sort: { reviewedAt: -1, updatedAt: -1, _id: -1 } },
        { $limit: 3 },
        {
          $lookup: {
            from: User.collection.name,
            localField: "clientId",
            foreignField: "_id",
            as: "reviewer",
          },
        },
        { $unwind: { path: "$reviewer", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            reviewerName: {
              $ifNull: ["$reviewer.fullName", { $ifNull: ["$reviewer.username", "Client"] }],
            },
            reviewerProfileImage: "$reviewer.profileImage",
            clientRating: 1,
            clientReview: 1,
            clientReviewPhotos: 1,
            reviewedAt: 1,
            updatedAt: 1,
          },
        },
      ]),
    ]);

    return res.json({
      provider: {
        id: String(provider._id),
        name: sanitizePublicText(provider.businessName || provider.fullName || provider.username || "Local provider"),
        username: sanitizePublicText(provider.username || ""),
        profileImage: provider.profileImage || "",
        lastActive: provider.lastActive || null,
        isOnline: provider.isOnline === true,
        professions: provider.professions || [],
        bio: sanitizePublicText(provider.bio),
        verified: provider.isVerified === true || provider.verificationStatus === "verified",
        tesdaCertificates: (provider.tesdaCertificates || [])
          .filter((certificate) => String(certificate.status || "").toLowerCase() === "approved")
          .map((certificate) => ({ trade: certificate.trade || "" })),
        averageRating: Number(provider.averageRating || 0),
        totalReviews: Number(provider.totalReviews || 0),
        completedJobs,
        serviceAreas: [provider.city, provider.province].filter(Boolean).join(", ")
          ? [[provider.city, provider.province].filter(Boolean).join(", ")]
          : [],
        reviews: reviews.map((review) => ({
          id: String(review._id),
          reviewer: sanitizePublicText(review.reviewerName || "Client"),
          reviewerProfileImage: review.reviewerProfileImage || "",
          rating: Number(review.clientRating),
          comment: sanitizePublicText(review.clientReview),
          photos: Array.isArray(review.clientReviewPhotos) ? review.clientReviewPhotos : [],
          reviewedAt: review.reviewedAt || review.updatedAt,
        })),
      },
    });
  } catch (error) {
    console.error("Provider profile error:", error);
    return res.status(500).json({ message: "Could not load this provider's profile." });
  }
}

module.exports = { handleDiscoverProviders, handleDiscoverProviderMapMarkers, handleGetProviderProfile, sanitizePublicText, toPublicProvider, MAX_DISTANCE_KM };
