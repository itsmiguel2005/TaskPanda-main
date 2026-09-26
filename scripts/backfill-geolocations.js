const mongoose = require("mongoose");
const { mongoUri } = require("../backend/config/env");
const User = require("../backend/models/User");
const { geocodeAddress } = require("../backend/services/geocoder");

async function backfillGeoLocations() {
  if (!mongoUri) throw new Error("MONGO_URI is not configured.");

  await mongoose.connect(mongoUri);
  const users = await User.find({
    registrationComplete: true,
    "geoLocation.coordinates": { $exists: false },
  }).select("role address barangay city province");

  let updated = 0;
  let unresolved = 0;
  for (const user of users) {
    const location = await geocodeAddress(user.address, {
      barangay: user.barangay,
      city: user.city,
      province: user.province,
    });

    if (!location) {
      unresolved += 1;
      console.log(`Unresolved ${user.role} ${user._id}`);
      continue;
    }

    await User.updateOne(
      { _id: user._id, "geoLocation.coordinates": { $exists: false } },
      { $set: { geoLocation: location } }
    );
    updated += 1;
    console.log(`Updated ${user.role} ${user._id}: ${location.coordinates.join(",")}`);
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  console.log(`Backfill complete: ${updated} updated, ${unresolved} unresolved.`);
  await mongoose.disconnect();
}

backfillGeoLocations().catch(async (error) => {
  console.error(`Geolocation backfill failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});