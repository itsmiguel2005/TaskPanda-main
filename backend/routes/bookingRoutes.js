const express = require("express");
const { requireAuth } = require("../middleware/requireAuth");
const upload = require("../storage/upload");
const {
  handleListBookings,
  handleCreateBooking,
  handleUpdateBookingStatus,
  handleCancellation,
  handleBookingReview,
  handleProviderUpdate,
  handleProviderUpdateResponse,
  handleCreateCounterOffer,
  handleRespondToCounterOffer,
  handleSubmitCompletion,
  handleCreateRevisionRequest,
  handleRespondToRevision,
} = require("../controllers/bookingController");

const router = express.Router();

router.use(requireAuth);
router.get("/", handleListBookings);
router.post("/", upload.array("photos", 5), handleCreateBooking);
router.patch("/:id/status", handleUpdateBookingStatus);
router.post("/:id/completion", upload.array("photos", 5), handleSubmitCompletion);
router.post("/:id/revisions", upload.array("photos", 5), handleCreateRevisionRequest);
router.patch("/:id/revisions/:revisionId", handleRespondToRevision);
router.patch("/:id/cancel", handleCancellation);
router.patch("/:id/review", upload.array("photos", 5), handleBookingReview);
router.post("/:id/rate", upload.array("photos", 5), handleBookingReview);
router.post("/:id/provider-updates", handleProviderUpdate);
router.patch("/:id/provider-updates", handleProviderUpdateResponse);
router.post("/:id/counter-offers", handleCreateCounterOffer);
router.patch("/:id/counter-offers/:counterOfferId", handleRespondToCounterOffer);

module.exports = router;
