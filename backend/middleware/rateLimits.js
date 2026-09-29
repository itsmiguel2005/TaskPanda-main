const { rateLimit } = require("express-rate-limit");

function createRateLimiter(limit, windowMs = 15 * 60 * 1000) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ message: "Too many requests. Please try again later." }),
  });
}

const authPaths = [
  "/register",
  "/registration-tab-closed",
  "/verify-email",
  "/resend-verification",
  "/complete-registration",
  "/login",
  "/forgot-password",
  "/reset-password",
];
const authLimiters = new Map(authPaths.map((path) => [path, createRateLimiter(10)]));
const fallbackAuthLimiter = createRateLimiter(10);

function limitAuthAttempts(req, res, next) {
  return (authLimiters.get(req.path) || fallbackAuthLimiter)(req, res, next);
}

const limitRegistrationChecks = createRateLimiter(30);
const limitBookingCreation = createRateLimiter(10);
const limitVerificationUploads = createRateLimiter(5, 60 * 60 * 1000);

module.exports = { limitAuthAttempts, limitRegistrationChecks, limitBookingCreation, limitVerificationUploads };