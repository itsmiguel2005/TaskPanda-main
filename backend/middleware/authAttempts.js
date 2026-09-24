const authAttempts = new Map();
const loginAttempts = new Map();

function limitAuthAttempts(req, res, next) {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const attempts = (authAttempts.get(key) || []).filter((time) => now - time < windowMs);

  if (attempts.length >= 10) {
    return res.status(429).json({ message: "Too many attempts. Please try again later." });
  }

  attempts.push(now);
  authAttempts.set(key, attempts);
  return next();
}

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

module.exports = { limitAuthAttempts, getLoginLock, recordFailedLogin, clearLoginAttempts, loginLockResponse };