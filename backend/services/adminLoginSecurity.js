const { createHash, createHmac, randomInt, timingSafeEqual } = require("crypto");
const AdminAuthRateLimit = require("../models/AdminAuthRateLimit");

function generateAdminLoginCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashAdminLoginCode(code, secret) {
  return createHmac("sha256", secret).update(code).digest("hex");
}

function hashAdminChallengeToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function timingSafeHexEqual(left, right) {
  if (!/^[a-f\d]{64}$/i.test(String(left)) || !/^[a-f\d]{64}$/i.test(String(right))) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

async function consumeAdminRateLimit(scope, identity, limit, windowMs) {
  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const windowEnd = (window + 1) * windowMs;
  const key = createHash("sha256")
    .update(`${scope}\0${String(identity)}\0${windowMs}\0${window}`)
    .digest("hex");
  const expiresAt = new Date(windowEnd + 60_000);

  let record;
  try {
    record = await AdminAuthRateLimit.findOneAndUpdate(
      { key },
      { $inc: { count: 1 }, $setOnInsert: { key, expiresAt } },
      { new: true, upsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    record = await AdminAuthRateLimit.findOneAndUpdate(
      { key },
      { $inc: { count: 1 } },
      { new: true }
    );
    if (!record) throw error;
  }

  return {
    allowed: record.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now) / 1000)),
  };
}

module.exports = {
  generateAdminLoginCode,
  hashAdminLoginCode,
  hashAdminChallengeToken,
  timingSafeHexEqual,
  consumeAdminRateLimit,
};