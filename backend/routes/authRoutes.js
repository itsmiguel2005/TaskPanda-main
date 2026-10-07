const express = require("express");
const {
  handleRegister,
  handleRegistrationAvailability,
  handleRegistrationStatus,
  handleRegistrationTabClosed,
  handleResumeRegistration,
  handleVerifyEmail,
  handleResendVerification,
  handleCompleteRegistration,
  handleLogin,
  handleVerifyAdminLogin,
  handleForgotPassword,
  handleResetPassword,
} = require("../controllers/authController");
const { body, query } = require("express-validator");
const { limitAuthAttempts, limitRegistrationChecks, limitLocationLookups } = require("../middleware/rateLimits");
const { validateRequest } = require("../middleware/validateRequest");
const { handleLocationSearch, handleLocationReverseLookup } = require("../controllers/locationController");

const router = express.Router();
const emailField = () => body("email").isString().trim().isEmail().isLength({ max: 254 });
const passwordPattern = /^(?=\S{8,15}$)(?=.*[A-Z])(?=.*[^A-Za-z0-9]).*$/;
const personNamePattern = /^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u;
const registrationPasswordIsGood = (password) => {
  const complexityRequirements = [
    /[A-Z]/.test(password) && /[a-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9\s]/.test(password),
  ];
  return password.length >= 8
    && !/\s/.test(password)
    && complexityRequirements.filter(Boolean).length >= 2;
};
const usernamePattern = /^[A-Za-z0-9_.-]{4,15}$/;

const registrationValidation = [
  body("role").isString().isIn(["client", "provider"]),
  body("registrationPhase").isString().equals("start"),
  emailField(),
  body("username").isString().trim().matches(usernamePattern).withMessage("Username must be 4-15 characters and use only letters, numbers, dots, underscores, or hyphens."),
  body("referralCode").optional({ values: "falsy" }).isString().trim().isLength({ max: 32 }).matches(/^[A-Z0-9-]+$/i),
  body("password").isString().bail().isLength({ min: 8, max: 72 }).bail().custom(registrationPasswordIsGood).withMessage("Password must be at least 8 characters and meet at least two other strength requirements."),
  body("professions").custom((value, { req }) => req.body.role !== "provider" || (Array.isArray(value) && value.length > 0)),
  body("professions").optional().isArray({ max: 20 }),
  body("professions.*").optional().isString().trim().isLength({ min: 1, max: 80 }),
];

const loginValidation = [
  body("email").isString().trim().isLength({ min: 1, max: 254 }),
  body("password").isString().isLength({ min: 8, max: 256 }),
];

const completionValidation = [
  body("fullName").optional().isString().trim().isLength({ min: 1, max: 100 }).matches(personNamePattern),
  body("firstName").isString().trim().isLength({ min: 1, max: 80 }).withMessage("First name must be 1 to 80 characters.").matches(personNamePattern).withMessage("First name may contain letters, spaces, apostrophes, hyphens, and periods only."),
  body("middleName").optional({ values: "falsy" }).isString().trim().isLength({ max: 80 }).withMessage("Middle name must be 80 characters or fewer.").matches(personNamePattern).withMessage("Middle name may contain letters, spaces, apostrophes, hyphens, and periods only."),
  body("lastName").isString().trim().isLength({ min: 1, max: 80 }).withMessage("Last name must be 1 to 80 characters.").matches(personNamePattern).withMessage("Last name may contain letters, spaces, apostrophes, hyphens, and periods only."),
  body("mobileNumber").isString().matches(/^(?:09|\+639)\d{9}$/),
  body("province").isString().trim().isLength({ min: 1, max: 100 }),
  body("city").isString().trim().isLength({ min: 1, max: 100 }),
  body("barangay").isString().trim().isLength({ min: 1, max: 100 }),
  body("address").optional().isString().trim().isLength({ max: 300 }),
  body("dateOfBirth").optional().isISO8601({ strict: true }),
  body("geoLocation").optional({ values: "null" }).isObject(),
  body("geoLocation.type").optional().equals("Point"),
  body("geoLocation.coordinates").optional().isArray({ min: 2, max: 2 }),
  body("geoLocation.coordinates.*").optional().isFloat(),
];

router.post("/register", limitAuthAttempts, registrationValidation, validateRequest, handleRegister);
router.post("/check-registration", limitRegistrationChecks, [
  body("email").optional().isString().trim().isLength({ max: 254 }),
  body("username").optional().isString().trim().matches(usernamePattern).withMessage("Username must be 4-15 characters and use only letters, numbers, dots, underscores, or hyphens."),
], validateRequest, handleRegistrationAvailability);
router.get("/location/search", limitLocationLookups, query("q").isString().isLength({ min: 3, max: 200 }), validateRequest, handleLocationSearch);
router.get("/location/reverse", limitLocationLookups, query("latitude").isFloat({ min: -90, max: 90 }), query("longitude").isFloat({ min: -180, max: 180 }), validateRequest, handleLocationReverseLookup);
router.get("/registration-status", handleRegistrationStatus);
router.post("/registration-resume", limitAuthAttempts, body("code").isString().matches(/^[a-f\d]{12}$/i), validateRequest, handleResumeRegistration);
router.post("/registration-tab-closed", limitAuthAttempts, handleRegistrationTabClosed);
router.post("/verify-email", limitAuthAttempts, body("token").isString().matches(/^[a-f\d]{64}$/i), validateRequest, handleVerifyEmail);
router.post("/resend-verification", limitAuthAttempts, emailField(), validateRequest, handleResendVerification);
router.post("/complete-registration", limitAuthAttempts, completionValidation, validateRequest, handleCompleteRegistration);
router.post("/login", limitAuthAttempts, loginValidation, validateRequest, handleLogin);
router.post("/admin-login/verify", limitAuthAttempts, [
  body("challengeToken").isString().matches(/^[a-f\d]{64}$/i),
  body("code").isString().matches(/^\d{6}$/),
], validateRequest, handleVerifyAdminLogin);
router.post("/forgot-password", limitAuthAttempts, emailField(), validateRequest, handleForgotPassword);
router.post("/reset-password", limitAuthAttempts, [
  emailField(),
  body("code").isString().matches(/^\d{6}$/),
  body("password").isString().matches(passwordPattern),
], validateRequest, handleResetPassword);

module.exports = router;