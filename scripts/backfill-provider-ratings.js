const mongoose = require("mongoose");
const { mongoUri } = require("../backend/config/env");
const Booking = require("../backend/models/Booking");
const User = require("../backend/models/User");

const REVIEWABLE_STATUSES = ["complete", "closed", "settled", "Completed", "Settled"];

async function backfillProviderRatings() {
  if (!mongoUri) throw new Error("MONGO_URI is not configured.");

  await mongoose.connect(mongoUri);
  const [providers, summaries] = await Promise.all([
    User.find({ role: "provider" }).select("_id").lean(),
    Booking.aggregate([
      { $match: { status: { $in: REVIEWABLE_STATUSES }, clientRating: { $ne: null } } },
      {
        $group: {
          _id: "$providerId",
          totalReviews: { $sum: 1 },
          averageRating: { $avg: "$clientRating" },
        },
      },
    ]),
  ]);

  const summaryByProvider = new Map(summaries.map((summary) => [String(summary._id), summary]));
  if (providers.length) {
    await User.bulkWrite(providers.map((provider) => {
      const summary = summaryByProvider.get(String(provider._id));
      const totalReviews = Number(summary?.totalReviews || 0);
      const averageRating = totalReviews > 0
        ? Number(Number(summary.averageRating || 0).toFixed(1))
        : 0;
      return {
        updateOne: {
          filter: { _id: provider._id, role: "provider" },
          update: { $set: { averageRating, totalReviews } },
        },
      };
    }));
  }

  console.log(`Recalculated rating summaries for ${providers.length} providers.`);
  await mongoose.disconnect();
}

backfillProviderRatings().catch(async (error) => {
  console.error(`Provider rating backfill failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
