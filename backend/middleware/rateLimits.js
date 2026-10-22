const { ipKeyGenerator, rateLimit } = require("express-rate-limit");
const MongoRateLimitStore = require("./MongoRateLimitStore");

let defaultLimiterSequence = 0;

function createRateLimiter(limit, windowMs = 15 * 60 * 1000, message = "Too many requests. Please try again later.", options = {}) {
  const storePrefix = options.identifier || `limiter-${defaultLimiterSequence++}`;
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    ...options,
    store: new MongoRateLimitStore({ prefix: storePrefix }),
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
  "/verify-otp",
  "/resend-otp",
  "/send-sms-otp",
  "/verify-sms-otp",
  "/verify-phone-otp",
  "/forgot-password",
  "/reset-password",
];
const authLimiters = new Map(authPaths.map((path) => [
  path,
  createRateLimiter(path === "/send-sms-otp" ? 3 : 10),
]));
const fallbackAuthLimiter = createRateLimiter(10);

function limitAuthAttempts(req, res, next) {
  return (authLimiters.get(req.path) || fallbackAuthLimiter)(req, res, next);
}

const limitRegistrationChecks = createRateLimiter(30);
const limitLocationLookups = createRateLimiter(30, 60 * 1000, "Location lookup limit reached. Please wait a minute and try again.");
const limitPublicProviderSearch = createRateLimiter(60, 60 * 1000, "Too many provider searches. Please wait a minute and try again.");
const limitBookingCreation = createRateLimiter(10);
const limitPhoneVerificationSends = createRateLimiter(
  3,
  15 * 60 * 1000,
  "Too many verification codes requested. Please wait before trying again.",
  {
    identifier: "phone-verification-sends",
    keyGenerator: (req) => req.user?._id
      ? `user:${String(req.user._id)}`
      : `ip:${ipKeyGenerator(req.ip)}`,
  },
);
const limitVerificationUploads = createRateLimiter(
  10,
  60 * 60 * 1000,
  "Verification submission limit reached. Please wait before trying again.",
  {
    identifier: "verification-uploads",
    keyGenerator: (req) => req.user?._id
      ? `user:${String(req.user._id)}`
      : `ip:${ipKeyGenerator(req.ip)}`,
  },
);
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
const limitBookingPhotoUploads = createRateLimiter(30, 15 * 60 * 1000, "Booking photo upload limit reached. Please try again later.", {
  identifier: "booking-photo-uploads",
  keyGenerator: (req) => req.user?._id
    ? `user:${String(req.user._id)}`
    : `ip:${ipKeyGenerator(req.ip)}`,
});
const limitTypingUpdates = createRateLimiter(60, 60 * 1000);
const limitProfilePhotoUploads = createRateLimiter(30, 15 * 60 * 1000);

module.exports = { createRateLimiter, limitAuthAttempts, limitRegistrationChecks, limitLocationLookups, limitPublicProviderSearch, limitBookingCreation, limitPhoneVerificationSends, limitVerificationUploads, limitTesdaCertificateUploads, limitChatPhotoUploads, limitBookingPhotoUploads, limitTypingUpdates, limitProfilePhotoUploads };