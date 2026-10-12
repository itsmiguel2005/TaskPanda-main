const {
  createHmac,
  randomInt,
  timingSafeEqual,
} = require("crypto");

const JWT_HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const LOGIN_OTP_TTL_SECONDS = 5 * 60;

function generateLoginOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashLoginOtpCode(code, userId, secret) {
  return createHmac("sha256", secret).update(`${String(userId)}\0${code}`).digest("hex");
}

function signPreAuthToken(userId, secret, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: "taskpanda",
    aud: "taskpanda-otp",
    sub: String(userId),
    typ: "otp",
    iat: issuedAt,
    exp: issuedAt + LOGIN_OTP_TTL_SECONDS,
  })).toString("base64url");
  const signingInput = `${JWT_HEADER}.${payload}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

function verifyPreAuthToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== JWT_HEADER) return null;

  const signingInput = `${parts[0]}.${parts[1]}`;
  const expectedSignature = createHmac("sha256", secret).update(signingInput).digest();
  let actualSignature;
  try {
    actualSignature = Buffer.from(parts[2], "base64url");
  } catch {
    return null;
  }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const nowSeconds = Math.floor(now / 1000);
  if (
    payload.iss !== "taskpanda" ||
    payload.aud !== "taskpanda-otp" ||
    payload.typ !== "otp" ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp) ||
    payload.iat > nowSeconds ||
    payload.exp <= nowSeconds ||
    payload.exp - payload.iat > LOGIN_OTP_TTL_SECONDS
  ) {
    return null;
  }
  return payload;
}

function timingSafeHexEqual(left, right) {
  if (!/^[a-f\d]{64}$/i.test(String(left)) || !/^[a-f\d]{64}$/i.test(String(right))) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

module.exports = {
  LOGIN_OTP_TTL_SECONDS,
  generateLoginOtpCode,
  hashLoginOtpCode,
  signPreAuthToken,
  verifyPreAuthToken,
  timingSafeHexEqual,
};
