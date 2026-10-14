const express = require("express");
const { body, param, query } = require("express-validator");
const {
  handleGetAdminAnalytics,
  handleGetAdminPandaBotHealth,
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
  handleListAdminRefunds,
  handleResolveAdminRefund,
  handleResolveRefundRepayment,
} = require("../controllers/refundController");
const {
  handleGetAdminSupportReports,
  handleGetAdminSupportReportDetails,
  handleUpdateAdminSupportReport,
} = require("../controllers/adminSupportReportsController");
const {
  handleGetAdminProviderNoShowReports,
  handleReviewAdminProviderNoShowReport,
} = require("../controllers/adminProviderNoShowReportsController");
const {
  handleGetAdminVerifications,
  handleGetVerificationDocument,
  handleGetTesdaCertificateDocument,
  handleReviewTesdaCertificate,
  handleReviewVerification,
} = require("../controllers/verificationController");
const { requireAdmin, requirePrimaryAdmin } = require("../middleware/requireAdmin");
const { validateRequest } = require("../middleware/validateRequest");
const { handleGetAdminAuditLogs } = require("../controllers/auditLogController");
const { handleGetAdminAccounts, handleCreateAdminAccount } = require("../controllers/adminAccountsController");

const router = express.Router();

router.get(
  "/audit-logs",
  requireAdmin,
  [
    query("page").optional().isInt({ min: 1, max: 100000 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("category").optional().isIn(["SECURITY", "OPERATIONS", "FINANCIAL", "GOVERNANCE"]),
    query("adminName").optional().isString().trim().isLength({ max: 100 }),
  ],
  validateRequest,
  handleGetAdminAuditLogs
);
router.get("/verifications", requireAdmin, handleGetAdminVerifications);
router.get(
  "/verifications/:userId/tesda/:certificateId/document",
  requireAdmin,
  [param("userId").isMongoId(), param("certificateId").isMongoId()],
  validateRequest,
  handleGetTesdaCertificateDocument
);
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
router.patch(
  "/verifications/:userId/tesda/:certificateId",
  requireAdmin,
  [
    param("userId").isMongoId(),
    param("certificateId").isMongoId(),
    body("action").isIn(["approve", "reject"]),
    body("certificateInspected").if(body("action").equals("approve")).custom((value) => value === true),
    body("rejectionReason").if(body("action").equals("reject")).isString().trim().isLength({ min: 5, max: 500 }),
  ],
  validateRequest,
  handleReviewTesdaCertificate
);
router.get("/analytics", requireAdmin, handleGetAdminAnalytics);
router.get("/analytics/pandabot", requireAdmin, handleGetAdminPandaBotHealth);
router.get(
  "/support-reports",
  requireAdmin,
  [query("status").optional().isIn(["open", "resolved", "all"]), query("page").optional().isInt({ min: 1, max: 10000 })],
  validateRequest,
  handleGetAdminSupportReports
);
router.get(
  "/support-reports/:conversationId/:reportId",
  requireAdmin,
  [param("conversationId").isMongoId(), param("reportId").isMongoId()],
  validateRequest,
  handleGetAdminSupportReportDetails
);
router.patch(
  "/support-reports/:conversationId/:reportId",
  requireAdmin,
  [
    param("conversationId").isMongoId(),
    param("reportId").isMongoId(),
    body("action").isIn(["resolve", "reopen", "save_notes", "suspend", "send_warning"]),
    body("notes").optional().isString().isLength({ max: 2000 }),
    body("notes").if(body("action").equals("save_notes")).isString().isLength({ max: 2000 }),
    body("reason").if(body("action").isIn(["suspend", "send_warning"])).isString().trim().isLength({ min: 5, max: 500 }),
  ],
  validateRequest,
  handleUpdateAdminSupportReport
);
router.get(
  "/provider-no-show-reports",
  requireAdmin,
  [
    query("status").optional().isIn(["needs_review", "reviewed", "all"]),
    query("page").optional().isInt({ min: 1, max: 10000 }),
  ],
  validateRequest,
  handleGetAdminProviderNoShowReports
);
router.patch(
  "/provider-no-show-reports/:bookingId",
  requireAdmin,
  [
    param("bookingId").isMongoId(),
    body("action").isIn(["confirm", "dismiss"]),
    body("notes").optional().isString().isLength({ max: 2000 }),
  ],
  validateRequest,
  handleReviewAdminProviderNoShowReport
);
router.get(
  "/bookings",
  requireAdmin,
  [
    query("q").optional().isString().isLength({ max: 100 }),
    query("page").optional().isInt({ min: 1, max: 10000 }),
    query("status").optional().isIn(["pending", "approved", "in_progress", "complete", "settled", "canceled", "declined", "expired", "refund_pending", "refund_repayment_pending", "refund_repayment_reported", "refund_repayment_overdue", "refunded", "partially_refunded"]),
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
  "/refunds",
  requireAdmin,
  [
    query("status").optional().isIn(["PENDING", "APPROVED", "REJECTED", "ALL"]),
    query("page").optional().isInt({ min: 1, max: 10000 }),
  ],
  validateRequest,
  handleListAdminRefunds
);
router.post(
  "/refunds/:id/resolve",
  requireAdmin,
  [
    param("id").isMongoId(),
    body("action").isIn(["APPROVE_FULL", "APPROVE_PARTIAL", "REJECT"]),
    body("approvedCashAmount").if(body("action").isIn(["APPROVE_FULL", "APPROVE_PARTIAL"])).isFloat({ min: 0 }),
    body("adminNotes").optional().isString().isLength({ max: 2000 }),
    body("adminNotes").if(body("action").equals("REJECT")).isString().trim().isLength({ min: 5, max: 2000 }),
  ],
  validateRequest,
  handleResolveAdminRefund
);
router.post(
  "/refunds/:id/repayment-review",
  requireAdmin,
  [
    param("id").isMongoId(),
    body("action").isIn(["CONFIRM_RECEIVED", "REOPEN_WINDOW", "LIFT_SUSPENSION"]),
    body("notes").isString().trim().isLength({ min: 5, max: 2000 }),
  ],
  validateRequest,
  handleResolveRefundRepayment
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
router.get("/admin-accounts", requireAdmin, handleGetAdminAccounts);
router.post(
  "/admin-accounts",
  requireAdmin,
  requirePrimaryAdmin,
  [
    body("fullName").isString().trim().isLength({ min: 2, max: 100 }),
    body("email").isEmail().customSanitizer((value) => value.trim().toLowerCase()).isLength({ max: 254 }),
  ],
  validateRequest,
  handleCreateAdminAccount
);
router.get("/settings", requireAdmin, handleGetAdminSystemSettings);
router.patch(
  "/settings",
  requireAdmin,
  [
    body("maxTravelDistanceKm").isFloat({ min: 1, max: 500 }),
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