const express = require("express");
const { body, param } = require("express-validator");
const {
  handleGetAdminAnalytics,
  handleGetAdminUsers,
  handleGetAdminUserDetails,
  handleSetAdminUserSuspension,
  handleArchiveAdminUser,
  handleRestoreAdminUser,
  handleRequestAdminPasswordReset,
} = require("../controllers/adminController");
const { requireAdmin } = require("../middleware/requireAdmin");
const { validateRequest } = require("../middleware/validateRequest");

const router = express.Router();

router.get("/analytics", requireAdmin, handleGetAdminAnalytics);
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