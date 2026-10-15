const express = require("express");
const { body, param, query } = require("express-validator");
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const upload = require("../storage/upload");
const { sanitizeMongoInput } = require("../middleware/sanitizeMongoInput");
const { limitBookingCreation } = require("../middleware/rateLimits");
const { validateRequest } = require("../middleware/validateRequest");
const { getGlobalSettings } = require("../services/systemSettings");
const {
  minEstimatedDurationMinutes: MIN_ESTIMATED_DURATION_MINUTES,
  maxTaskOfferPhp: MAX_TASK_OFFER_PHP,
  maxTipPhp: MAX_TIP_PHP,
} = require("../../shared/bookingLimits.json");
const {
  handleListBookings,
  handleDismissDashboardBookings,
  handleRestoreDashboardBookings,
  handleProviderAvailability,
  handleReportRunningLate,
  handleReportProviderNoShow,
  handleRespondToProviderNoShow,
  handleRespondToLateNotice,
  handleServiceLocationSearch,
  handleServiceLocationReverseLookup,
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
const {
  handleRequestRefund,
  handleMarkProviderRepaymentSent,
  handleConfirmRefundReceived,
  handleReportRefundNotReceived,
} = require("../controllers/refundController");
const { handleProviderCashConfirmationByBooking } = require("../controllers/messageController");

const router = express.Router();

async function checkBookingMaintenance(req, res, next) {
  try {
    const settings = await getGlobalSettings();
    if (settings.maintenanceMode) {
      return res.status(503).json({ message: "New bookings are temporarily paused while we perform maintenance. Please try again shortly." });
    }
    req.systemSettings = settings;
    return next();
  } catch (error) {
    console.error("Booking settings lookup error:", error);
    return res.status(503).json({ message: "Booking settings are temporarily unavailable. Please try again." });
  }
}

const validateBookingCreation = [
  body("providerId").optional().isMongoId(),
  body("provider").optional().isMongoId(),
  body("repairDescription").optional().isString().isLength({ min: 1, max: 2000 }),
  body("description").optional().isString().isLength({ min: 1, max: 2000 }),
  body("task").optional().isString().isLength({ min: 1, max: 2000 }),
  body("serviceDetails").optional().isString().isLength({ min: 1, max: 2000 }),
  body("address").optional().isString().isLength({ max: 300 }),
  body("location").optional().isString().isLength({ max: 300 }),
  body("serviceGeoLocation").optional({ values: "falsy" }).custom((value) => {
    if (typeof value === "object") return true;
    if (typeof value !== "string") return false;
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }),
  body("serviceDate").optional().isISO8601(),
  body("date").optional().isISO8601(),
  body("timeSlot").optional().isString().isLength({ min: 1, max: 24 }),
  body("time").optional().isString().isLength({ min: 1, max: 24 }),
  body("offeredPrice").optional().isFloat({ min: 100, max: MAX_TASK_OFFER_PHP * 4 }),
  body("offerPrice").optional().isFloat({ min: 100, max: MAX_TASK_OFFER_PHP * 4 }),
  body("offer").optional().isFloat({ min: 100, max: MAX_TASK_OFFER_PHP * 4 }),
  body("price").optional().isFloat({ min: 100, max: MAX_TASK_OFFER_PHP * 4 }),
  body("estimatedDurationMinutes").optional().isInt({ min: MIN_ESTIMATED_DURATION_MINUTES, max: 720 }),
  body("tipAmount").optional().isFloat({ min: 0, max: MAX_TIP_PHP }),
  body("voucherId").optional({ values: "falsy" }).isMongoId(),
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
  body("counterOfferId").optional({ values: "falsy" }).isMongoId(),
  body("proposedPrice").optional({ values: "falsy" }).isFloat({ min: 100, max: MAX_TASK_OFFER_PHP }),
  body("counterOfferDurationMinutes").optional({ values: "falsy" }).isInt({ min: MIN_ESTIMATED_DURATION_MINUTES, max: 720 }),
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
router.get("/service-location/search", query("q").isString().isLength({ min: 3, max: 200 }), validateRequest, handleServiceLocationSearch);
router.get("/service-location/reverse", query("latitude").isFloat({ min: -90, max: 90 }), query("longitude").isFloat({ min: -180, max: 180 }), validateRequest, handleServiceLocationReverseLookup);
router.get("/availability/:providerId", handleProviderAvailability);
router.post("/dashboard-dismissals", handleDismissDashboardBookings);
router.post("/dashboard-dismissals/restore", handleRestoreDashboardBookings);
router.get("/", handleListBookings);
router.post("/", (req, _res, next) => {
  req.bookingRequestReceivedAt = new Date();
  next();
}, limitBookingCreation, checkBookingMaintenance, upload.array("photos", 5), sanitizeMongoInput, validateBookingCreation, validateRequest, handleCreateBooking);
router.post("/:id/confirm-cash-received", requireRole("provider"), handleProviderCashConfirmationByBooking);
router.post("/refunds/:refundId/repayment-sent", param("refundId").isMongoId(), validateRequest, requireRole("provider"), handleMarkProviderRepaymentSent);
router.post("/refunds/:refundId/confirm-received", param("refundId").isMongoId(), validateRequest, requireRole("client"), handleConfirmRefundReceived);
router.post("/refunds/:refundId/report-not-received", param("refundId").isMongoId(), body("reportNote").isString().trim().isLength({ min: 5, max: 1000 }), validateRequest, requireRole("client"), handleReportRefundNotReceived);
router.patch("/:id/status", validateBookingStatus, validateRequest, handleUpdateBookingStatus);
router.post("/:id/running-late", body("delayMinutes").isInt({ min: 1, max: 720 }), validateRequest, handleReportRunningLate);
router.post("/:id/provider-no-show", handleReportProviderNoShow);
router.post("/:id/provider-no-show-response", body("note").isString().trim().isLength({ min: 1, max: 1000 }), validateRequest, handleRespondToProviderNoShow);
router.patch("/:id/late-notice", body("action").isIn(["wait", "reschedule"]), validateRequest, handleRespondToLateNotice);
router.post("/:id/completion", upload.array("photos", 5), sanitizeMongoInput, body("completionNote").optional().isString().isLength({ max: 2000 }), validateRequest, handleSubmitCompletion);
router.post("/:id/revisions", upload.array("photos", 5), sanitizeMongoInput, body("note").isString().isLength({ min: 1, max: 1000 }), validateRequest, handleCreateRevisionRequest);
router.patch("/:id/revisions/:revisionId", validateRevisionResponse, validateRequest, handleRespondToRevision);
router.patch("/:id/cancel", validateCancellation, validateRequest, handleCancellation);
router.post(
  "/:id/request-refund",
  upload.array("photos", 5),
  sanitizeMongoInput,
  [
    body("reason").isIn(["INCOMPLETE_WORK", "POOR_QUALITY", "OVERCHARGED", "OTHER"]),
    body("requestedAmount").isFloat({ min: 0 }),
    body("description").isString().trim().isLength({ min: 1, max: 2000 }),
  ],
  validateRequest,
  handleRequestRefund
);
router.patch("/:id/review", upload.array("photos", 5), sanitizeMongoInput, body("rating").isFloat({ min: 1, max: 5 }), body("review").optional().isString().isLength({ max: 1000 }), validateRequest, handleBookingReview);
router.post("/:id/rate", upload.array("photos", 5), sanitizeMongoInput, body("rating").isFloat({ min: 1, max: 5 }), body("review").optional().isString().isLength({ max: 1000 }), validateRequest, handleBookingReview);
router.post("/:id/provider-updates", validateProviderUpdate, validateRequest, handleProviderUpdate);
router.patch("/:id/provider-updates", validateProviderUpdateResponse, validateRequest, handleProviderUpdateResponse);
router.post("/:id/counter-offers", validateCounterOffer, validateRequest, handleCreateCounterOffer);
router.patch("/:id/counter-offers/:counterOfferId", validateCounterOfferResponse, validateRequest, handleRespondToCounterOffer);

module.exports = router;
