const User = require("../models/User");

const MAX_DISTANCE_KM = 100;
const DEFAULT_LIMIT = 24;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function handleDiscoverProviders(req, res) {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  const minKm = Number(req.query.minKm ?? 0);
  const maxKm = Number(req.query.maxKm ?? 25);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || DEFAULT_LIMIT));
  const search = String(req.query.q || "").trim().slice(0, 100);
  const categories = String(req.query.categories || "")
    .split(",")
    .map((category) => category.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 20);
  const tesdaOnly = req.query.credential === "tesda";

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ message: "Set a valid search location to find nearby providers.", field: "location" });
  }
  if (!Number.isFinite(minKm) || !Number.isFinite(maxKm) || minKm < 0 || maxKm <= minKm || maxKm > MAX_DISTANCE_KM) {
    return res.status(400).json({ message: `Choose a distance range between 0 and ${MAX_DISTANCE_KM} km.`, field: "distance" });
  }

  const providerQuery = {
    role: "provider",
    registrationComplete: true,
    "geoLocation.type": "Point",
  };
  if (categories.length) {
    providerQuery.professions = {
      $in: categories.map((category) => new RegExp(`^${escapeRegex(category)}$`, "i")),
    };
  }
  if (tesdaOnly) providerQuery.tesdaCertificates = { $elemMatch: { status: "approved" } };

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
                fullName: 1,
                username: 1,
                professions: 1,
                bio: 1,
                province: 1,
                city: 1,
                barangay: 1,
                createdAt: 1,
                distanceKm: { $round: [{ $divide: ["$distanceMeters", 1000] }, 1] },
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

    return res.json({
      providers: result.providers,
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

module.exports = { handleDiscoverProviders, MAX_DISTANCE_KM };
