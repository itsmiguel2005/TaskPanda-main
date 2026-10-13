const config = require("../config/env");

const FAILURE_RESPONSE = {
  success: false,
  message: "Security verification failed. Automated behavior detected.",
};

function createRecaptchaVerifier({
  secretKey = config.recaptchaSecretKey,
  fetchImpl = globalThis.fetch,
  minimumScore = 0.5,
  expectedAction,
} = {}) {
  return async function verifyRecaptcha(req, res, next) {
    const token = typeof req.body?.recaptchaToken === "string"
      ? req.body.recaptchaToken.trim()
      : "";

    if (!token || token.length > 4096) {
      return res.status(403).json(FAILURE_RESPONSE);
    }

    if (!secretKey || typeof fetchImpl !== "function") {
      return res.status(503).json({
        success: false,
        message: "Security verification is temporarily unavailable. Please try again.",
      });
    }

    try {
      const response = await fetchImpl("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: secretKey, response: token }),
      });
      if (!response.ok) {
        return res.status(503).json({
          success: false,
          message: "Security verification is temporarily unavailable. Please try again.",
        });
      }

      const verification = await response.json();
      if (
        verification?.success !== true
        || typeof verification.score !== "number"
        || verification.score < minimumScore
        || verification.action !== expectedAction
      ) {
        return res.status(403).json(FAILURE_RESPONSE);
      }

      return next();
    } catch (error) {
      console.error("Google reCAPTCHA verification request failed:", error.message);
      return res.status(503).json({
        success: false,
        message: "Security verification is temporarily unavailable. Please try again.",
      });
    }
  };
}

function verifyRecaptcha(action) {
  return createRecaptchaVerifier({ expectedAction: action });
}

module.exports = { createRecaptchaVerifier, verifyRecaptcha };
