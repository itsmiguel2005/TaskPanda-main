const mongoose = require("mongoose");

const systemSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "global", unique: true, immutable: true },
    maxTravelDistanceKm: { type: Number, min: 1, max: 500, default: 50 },
    travelBaseFee: { type: Number, min: 0, max: 100000, default: 20 },
    travelFeePerKm: { type: Number, min: 0, max: 100000, default: 10 },
    maintenanceMode: { type: Boolean, default: false },
    updatedBy: { type: String, trim: true, lowercase: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);
