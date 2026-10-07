const { ipKeyGenerator, rateLimit } = require("express-rate-limit");

function createRateLimiter(limit, windowMs = 15 * 60 * 1000, message = "Too many requests. Please try again later.", options = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    ...options,
    handler: (_req, res) => res.status(429).json({ message }),
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
const limitLocationLookups = createRateLimiter(30, 60 * 1000, "Location lookup limit reached. Please wait a minute and try again.");
const limitBookingCreation = createRateLimiter(10);
const limitVerificationUploads = createRateLimiter(5, 60 * 60 * 1000);
const limitTesdaCertificateUploads = createRateLimiter(
  10,
  60 * 60 * 1000,
  "TESDA certificate submission limit reached.",
  {
    identifier: "tesda-certificate-uploads",
    keyGenerator: (req) => req.user?._id
      ? `user:${String(req.user._id)}`
      : `ip:${ipKeyGenerator(req.ip)}`,
  },
);
const limitChatPhotoUploads = createRateLimiter(30, 15 * 60 * 1000);
const limitTypingUpdates = createRateLimiter(60, 60 * 1000);
const limitProfilePhotoUploads = createRateLimiter(30, 15 * 60 * 1000);

module.exports = { createRateLimiter, limitAuthAttempts, limitRegistrationChecks, limitLocationLookups, limitBookingCreation, limitVerificationUploads, limitTesdaCertificateUploads, limitChatPhotoUploads, limitTypingUpdates, limitProfilePhotoUploads };