const express = require("express");
const mongoose = require("mongoose");
const { getGlobalSettings } = require("../services/systemSettings");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    mongo: mongoose.connection.readyState === 1 ? "connected" : "not_connected",
    port: process.env.PORT || 3000,
  });
});

router.get("/public/booking-availability", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const settings = await getGlobalSettings();
    return res.json({ bookingRequestsPaused: settings.maintenanceMode });
  } catch (error) {
    console.error("Public booking availability lookup error:", error);
    return res.status(503).json({ message: "Booking availability status is temporarily unavailable." });
  }
});

module.exports = router;