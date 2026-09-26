const express = require("express");
const {
  handleRegister,
  handleRegistrationAvailability,
  handleRegistrationStatus,
  handleRegistrationTabClosed,
  handleVerifyEmail,
  handleResendVerification,
  handleCompleteRegistration,
  handleLogin,
  handleForgotPassword,
  handleResetPassword,
} = require("../controllers/authController");
const { limitAuthAttempts } = require("../middleware/authAttempts");

const router = express.Router();

router.post("/register", limitAuthAttempts, handleRegister);
router.post("/check-registration", handleRegistrationAvailability);
router.get("/registration-status", handleRegistrationStatus);
router.post("/registration-tab-closed", handleRegistrationTabClosed);
router.post("/verify-email", limitAuthAttempts, handleVerifyEmail);
router.post("/resend-verification", limitAuthAttempts, handleResendVerification);
router.post("/complete-registration", limitAuthAttempts, handleCompleteRegistration);
router.post("/login", handleLogin);
router.post("/forgot-password", limitAuthAttempts, handleForgotPassword);
router.post("/reset-password", limitAuthAttempts, handleResetPassword);

module.exports = router;