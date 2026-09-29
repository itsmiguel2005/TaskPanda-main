const loginAttempts = new Map();

function getLoginLock(identifier) {
  const attempt = loginAttempts.get(identifier);
  if (!attempt || !attempt.lockedUntil || attempt.lockedUntil === Infinity) return attempt;

  if (Date.now() >= attempt.lockedUntil) attempt.lockedUntil = 0;
  return attempt;
}

function recordFailedLogin(identifier) {
  const attempt = loginAttempts.get(identifier) || { failures: 0, lockedUntil: 0 };
  attempt.failures += 1;

  if (attempt.failures === 3) attempt.lockedUntil = Date.now() + 60 * 1000;
  else if (attempt.failures === 4) attempt.lockedUntil = Date.now() + 3 * 60 * 1000;
  else if (attempt.failures >= 5) attempt.lockedUntil = Infinity;

  loginAttempts.set(identifier, attempt);
  return attempt;
}

function clearLoginAttempts(identifier) {
  loginAttempts.delete(identifier);
}

function loginLockResponse(res, attempt) {
  if (attempt.failures >= 5) {
    return res.status(423).json({
      message: "This account has reached the maximum login attempts. Please use Forgot password to regain access.",
      requiresPasswordReset: true,
    });
  }

  const waitMinutes = attempt.failures >= 4 ? 3 : 1;
  return res.status(429).json({
    message: `Too many failed login attempts. Please wait ${waitMinutes} minute${waitMinutes === 1 ? "" : "s"} before trying again.`,
    retryAfterSeconds: waitMinutes * 60,
  });
}

module.exports = { getLoginLock, recordFailedLogin, clearLoginAttempts, loginLockResponse };