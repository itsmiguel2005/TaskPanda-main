const SystemSettings = require("../models/SystemSettings");

const DEFAULT_SYSTEM_SETTINGS = Object.freeze({
  maxTravelDistanceKm: 50,
  travelBaseFee: 20,
  travelFeePerKm: 10,
  maintenanceMode: false,
});

function serializeSettings(settings) {
  return {
    maxTravelDistanceKm: Number(settings.maxTravelDistanceKm),
    travelBaseFee: Number(settings.travelBaseFee),
    travelFeePerKm: Number(settings.travelFeePerKm),
    maintenanceMode: settings.maintenanceMode === true,
    updatedAt: settings.updatedAt || null,
    updatedBy: settings.updatedBy || "",
  };
}

async function getGlobalSettings() {
  let settings = await SystemSettings.findOne({ key: "global" }).lean();
  if (!settings) {
    try {
      settings = await SystemSettings.findOneAndUpdate(
        { key: "global" },
        { $setOnInsert: { key: "global", ...DEFAULT_SYSTEM_SETTINGS } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();
    } catch (error) {
      if (error.code !== 11000) throw error;
      settings = await SystemSettings.findOne({ key: "global" }).lean();
      if (!settings) throw error;
    }
  }
  return serializeSettings(settings);
}

async function updateGlobalSettings(values, updatedBy) {
  const settings = await SystemSettings.findOneAndUpdate(
    { key: "global" },
    {
      $set: {
        maxTravelDistanceKm: values.maxTravelDistanceKm,
        travelBaseFee: values.travelBaseFee,
        travelFeePerKm: values.travelFeePerKm,
        maintenanceMode: values.maintenanceMode,
        updatedBy,
      },
      $setOnInsert: { key: "global" },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
  return serializeSettings(settings);
}

module.exports = {
  DEFAULT_SYSTEM_SETTINGS,
  getGlobalSettings,
  updateGlobalSettings,
};
