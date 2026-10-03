const express = require("express");
const { body, param, query } = require("express-validator");
const {
  handleGetAdminAnalytics,
  handleGetAdminUsers,
  handleGetAdminUserDetails,
  handleSetAdminUserSuspension,
  handleArchiveAdminUser,
  handleRestoreAdminUser,
  handleRequestAdminPasswordReset,
} = require("../controllers/adminController");
const {
  handleGetAdminTransactions,
  handleGetAdminRewardAnalytics,
  handleGetAdminSystemSettings,
  handleUpdateAdminSystemSettings,
  handleAdminBroadcast,
} = require("../controllers/adminOperationsController");
const { handleGetAdminBookings, handleOverrideAdminBooking } = require("../controllers/adminBookingController");
const {
  handleGetAdminVerifications,
  handleGetVerificationDocument,
  handleReviewVerification,
} = require("../controllers/verificationController");
const { requireAdmin } = require("../middleware/requireAdmin");
const { validateRequest } = require("../middleware/validateRequest");

const router = express.Router();

router.get("/verifications", requireAdmin, handleGetAdminVerifications);
router.get(
  "/verifications/:userId/documents/:side",
  requireAdmin,
  [param("userId").isMongoId(), param("side").isIn(["front", "back"])],
  validateRequest,
  handleGetVerificationDocument
);
router.patch(
  "/verifications/:userId",
  requireAdmin,
  [
    param("userId").isMongoId(),
    body("action").isIn(["approve", "reject"]),
    body("nameMatchConfirmed").if(body("action").equals("approve")).custom((value) => value === true),
    body("rejectionReason").if(body("action").equals("reject")).isString().trim().isLength({ min: 5, max: 500 }),
  ],
  validateRequest,
  handleReviewVerification
);
router.get("/analytics", requireAdmin, handleGetAdminAnalytics);
router.get(
  "/bookings",
  requireAdmin,
  [
    query("q").optional().isString().isLength({ max: 100 }),
    query("page").optional().isInt({ min: 1, max: 10000 }),
    query("status").optional().isIn(["pending", "approved", "in_progress", "complete", "settled", "canceled", "declined", "expired"]),
  ],
  validateRequest,
  handleGetAdminBookings
);
router.patch(
  "/bookings/:bookingId/override",
  requireAdmin,
  [
    param("bookingId").isMongoId(),
    body("status").isIn(["pending", "approved", "in_progress", "complete", "settled", "canceled", "declined", "expired"]),
    body("reason").isString().trim().isLength({ min: 5, max: 500 }),
  ],
  validateRequest,
  handleOverrideAdminBooking
);
router.get(
  "/transactions",
  requireAdmin,
  [
    query("q").optional().isString().isLength({ max: 100 }),
    query("page").optional().isInt({ min: 1, max: 10000 }),
    query("from").optional().isISO8601({ strict: true }),
    query("to").optional().isISO8601({ strict: true }),
    query("from").custom((value, { req }) => !value || !req.query.to || new Date(value) <= new Date(req.query.to)).withMessage("The start date must be on or before the end date."),
  ],
  validateRequest,
  handleGetAdminTransactions
);
router.get("/rewards/analytics", requireAdmin, handleGetAdminRewardAnalytics);
router.get("/settings", requireAdmin, handleGetAdminSystemSettings);
router.patch(
  "/settings",
  requireAdmin,
  [
    body("maxTravelDistanceKm").isFloat({ min: 1, max: 500 }),
    body("travelBaseFee").isFloat({ min: 0, max: 100000 }),
    body("travelFeePerKm").isFloat({ min: 0, max: 100000 }),
    body("maintenanceMode").isBoolean(),
  ],
  validateRequest,
  handleUpdateAdminSystemSettings
);
router.post(
  "/broadcast",
  requireAdmin,
  [
    body("title").isString().trim().isLength({ min: 1, max: 100 }),
    body("message").isString().trim().isLength({ min: 1, max: 240 }),
  ],
  validateRequest,
  handleAdminBroadcast
);
router.get("/users", requireAdmin, handleGetAdminUsers);
router.get("/users/:userId", requireAdmin, param("userId").isMongoId(), validateRequest, handleGetAdminUserDetails);
router.patch(
  "/users/:userId/suspension",
  requireAdmin,
  [param("userId").isMongoId(), body("suspended").isBoolean()],
  validateRequest,
  handleSetAdminUserSuspension
);
router.post("/users/:userId/archive", requireAdmin, param("userId").isMongoId(), validateRequest, handleArchiveAdminUser);
router.post("/users/:userId/restore", requireAdmin, param("userId").isMongoId(), validateRequest, handleRestoreAdminUser);
router.post("/users/:userId/reset-password", requireAdmin, param("userId").isMongoId(), validateRequest, handleRequestAdminPasswordReset);

module.exports = router;