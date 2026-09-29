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
const { body } = require("express-validator");
const { limitAuthAttempts, limitRegistrationChecks } = require("../middleware/rateLimits");
const { validateRequest } = require("../middleware/validateRequest");

const router = express.Router();
const emailField = () => body("email").isString().trim().isEmail().isLength({ max: 254 });
const passwordPattern = /^(?=\S{8,15}$)(?=.*[A-Z])(?=.*[^A-Za-z0-9]).*$/;

const registrationValidation = [
  body("role").isString().isIn(["client", "provider"]),
  body("registrationPhase").isString().equals("start"),
  emailField(),
  body("username").isString().trim().isLength({ min: 3, max: 30 }),
  body("password").isString().matches(passwordPattern),
  body("professions").custom((value, { req }) => req.body.role !== "provider" || (Array.isArray(value) && value.length > 0)),
  body("professions").optional().isArray({ max: 20 }),
  body("professions.*").optional().isString().trim().isLength({ min: 1, max: 80 }),
];

const loginValidation = [
  body("email").isString().trim().isLength({ min: 1, max: 254 }),
  body("password").isString().isLength({ min: 1, max: 256 }),
];

const completionValidation = [
  body("firstName").isString().trim().isLength({ min: 1, max: 80 }),
  body("middleName").optional().isString().trim().isLength({ max: 80 }),
  body("lastName").isString().trim().isLength({ min: 1, max: 80 }),
  body("mobileNumber").isString().matches(/^09\d{9}$/),
  body("province").isString().trim().isLength({ min: 1, max: 100 }),
  body("city").isString().trim().isLength({ min: 1, max: 100 }),
  body("barangay").isString().trim().isLength({ min: 1, max: 100 }),
  body("address").optional().isString().trim().isLength({ max: 300 }),
  body("dateOfBirth").optional().isISO8601({ strict: true }),
  body("geoLocation").optional().isObject(),
  body("geoLocation.type").optional().equals("Point"),
  body("geoLocation.coordinates").optional().isArray({ min: 2, max: 2 }),
  body("geoLocation.coordinates.*").optional().isFloat(),
];

router.post("/register", limitAuthAttempts, registrationValidation, validateRequest, handleRegister);
router.post("/check-registration", limitRegistrationChecks, [
  body("email").optional().isString().trim().isLength({ max: 254 }),
  body("username").optional().isString().trim().isLength({ max: 30 }),
], validateRequest, handleRegistrationAvailability);
router.get("/registration-status", handleRegistrationStatus);
router.post("/registration-tab-closed", limitAuthAttempts, handleRegistrationTabClosed);
router.post("/verify-email", limitAuthAttempts, body("token").isString().matches(/^[a-f\d]{64}$/i), validateRequest, handleVerifyEmail);
router.post("/resend-verification", limitAuthAttempts, emailField(), validateRequest, handleResendVerification);
router.post("/complete-registration", limitAuthAttempts, completionValidation, validateRequest, handleCompleteRegistration);
router.post("/login", limitAuthAttempts, loginValidation, validateRequest, handleLogin);
router.post("/forgot-password", limitAuthAttempts, emailField(), validateRequest, handleForgotPassword);
router.post("/reset-password", limitAuthAttempts, [
  emailField(),
  body("code").isString().matches(/^\d{6}$/),
  body("password").isString().matches(passwordPattern),
], validateRequest, handleResetPassword);

module.exports = router;