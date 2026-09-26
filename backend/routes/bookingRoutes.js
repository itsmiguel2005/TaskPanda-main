const express = require("express");
const { requireAuth } = require("../middleware/requireAuth");
const upload = require("../storage/upload");
const {
  handleListBookings,
  handleCreateBooking,
  handleUpdateBookingStatus,
  handleCancellation,
} = require("../controllers/bookingController");

const router = express.Router();

router.use(requireAuth);
router.get("/", handleListBookings);
router.post("/", upload.array("photos", 5), handleCreateBooking);
router.patch("/:id/status", handleUpdateBookingStatus);
router.patch("/:id/cancel", handleCancellation);

module.exports = router;
