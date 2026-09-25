const express = require("express");
const {
  handleRegister,
  handleRegistrationAvailability,
  handleLogin,
  handleForgotPassword,
  handleResetPassword,
} = require("../controllers/authController");
const { limitAuthAttempts } = require("../middleware/authAttempts");

const router = express.Router();

router.post("/register", limitAuthAttempts, handleRegister);
router.post("/check-registration", handleRegistrationAvailability);
router.post("/login", handleLogin);
router.post("/forgot-password", limitAuthAttempts, handleForgotPassword);
router.post("/reset-password", limitAuthAttempts, handleResetPassword);

module.exports = router;