const express = require("express");
const { body } = require("express-validator");
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const upload = require("../storage/upload");
const { sanitizeMongoInput } = require("../middleware/sanitizeMongoInput");
const { limitBookingCreation } = require("../middleware/rateLimits");
const { validateRequest } = require("../middleware/validateRequest");
const {
  handleListBookings,
  handleProviderAvailability,
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

const validateBookingCreation = [
  body("providerId").optional().isMongoId(),
  body("provider").optional().isMongoId(),
  body("repairDescription").optional().isString().isLength({ min: 1, max: 2000 }),
  body("description").optional().isString().isLength({ min: 1, max: 2000 }),
  body("task").optional().isString().isLength({ min: 1, max: 2000 }),
  body("serviceDetails").optional().isString().isLength({ min: 1, max: 2000 }),
  body("address").optional().isString().isLength({ max: 300 }),
  body("location").optional().isString().isLength({ max: 300 }),
  body("serviceDate").optional().isISO8601(),
  body("date").optional().isISO8601(),
  body("timeSlot").optional().isString().isLength({ min: 1, max: 24 }),
  body("time").optional().isString().isLength({ min: 1, max: 24 }),
  body("offeredPrice").optional().isFloat({ min: 100, max: 10000000 }),
  body("offerPrice").optional().isFloat({ min: 100, max: 10000000 }),
  body("offer").optional().isFloat({ min: 100, max: 10000000 }),
  body("price").optional().isFloat({ min: 100, max: 10000000 }),
  body("urgency").optional().isIn(["Emergency", "Flexible"]),
  body("paymentMethod").optional().isIn(["cash"]),
  body("termsAccepted").optional().isIn(["true", "True", "false"]),
];

const validateBookingStatus = [
  body("status").isString().trim().isLength({ min: 1, max: 40 }),
  body("action").optional().isString().isIn(["decline"]),
];

const validateCancellation = [
  body("action").optional().isString().isIn(["request", "approve", "reject"]),
  body("reason").optional().isString().isLength({ max: 500 }),
];

const validateRevisionResponse = [
  body("action").isString().isIn(["accept", "dispute"]),
  body("responseNote").optional().isString().isLength({ max: 1000 }),
];

const validateProviderUpdate = [
  body("note").isString().isLength({ min: 1, max: 500 }),
  body("proposedServiceDate").optional({ values: "falsy" }).isISO8601(),
  body("proposedTimeSlot").optional({ values: "falsy" }).isString().isLength({ max: 24 }),
];

const validateProviderUpdateResponse = [
  body("updateId").isMongoId(),
  body("action").isString().isIn(["accept", "reject"]),
];

const validateCounterOffer = [
  body("proposedPrice").optional({ values: "falsy" }).isFloat({ min: 100, max: 10000000 }),
  body("proposedServiceDate").optional({ values: "falsy" }).isISO8601(),
  body("proposedTimeSlot").optional({ values: "falsy" }).isString().isLength({ max: 24 }),
  body("proposedRepairDescription").optional({ values: "falsy" }).isString().isLength({ max: 2000 }),
  body("note").optional({ values: "falsy" }).isString().isLength({ max: 500 }),
];

const validateCounterOfferResponse = body("action").isString().isIn(["accept", "reject"]);

router.param("id", (req, res, next, id) => {
  if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ message: "Choose a valid booking." });
  return next();
});
router.param("revisionId", (req, res, next, id) => {
  if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ message: "Choose a valid revision request." });
  return next();
});
router.param("counterOfferId", (req, res, next, id) => {
  if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ message: "Choose a valid booking offer." });
  return next();
});

router.use(requireAuth, requireRole("client", "provider"));
router.get("/availability/:providerId", handleProviderAvailability);
router.get("/", handleListBookings);
router.post("/", limitBookingCreation, upload.array("photos", 5), sanitizeMongoInput, validateBookingCreation, validateRequest, handleCreateBooking);
router.patch("/:id/status", validateBookingStatus, validateRequest, handleUpdateBookingStatus);
router.post("/:id/completion", upload.array("photos", 5), sanitizeMongoInput, body("completionNote").optional().isString().isLength({ max: 2000 }), validateRequest, handleSubmitCompletion);
router.post("/:id/revisions", upload.array("photos", 5), sanitizeMongoInput, body("note").isString().isLength({ min: 1, max: 1000 }), validateRequest, handleCreateRevisionRequest);
router.patch("/:id/revisions/:revisionId", validateRevisionResponse, validateRequest, handleRespondToRevision);
router.patch("/:id/cancel", validateCancellation, validateRequest, handleCancellation);
router.patch("/:id/review", upload.array("photos", 5), sanitizeMongoInput, body("rating").isFloat({ min: 1, max: 5 }), body("review").optional().isString().isLength({ max: 1000 }), validateRequest, handleBookingReview);
router.post("/:id/rate", upload.array("photos", 5), sanitizeMongoInput, body("rating").isFloat({ min: 1, max: 5 }), body("review").optional().isString().isLength({ max: 1000 }), validateRequest, handleBookingReview);
router.post("/:id/provider-updates", validateProviderUpdate, validateRequest, handleProviderUpdate);
router.patch("/:id/provider-updates", validateProviderUpdateResponse, validateRequest, handleProviderUpdateResponse);
router.post("/:id/counter-offers", validateCounterOffer, validateRequest, handleCreateCounterOffer);
router.patch("/:id/counter-offers/:counterOfferId", validateCounterOfferResponse, validateRequest, handleRespondToCounterOffer);

module.exports = router;
