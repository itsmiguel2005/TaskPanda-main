const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LOGIN_OTP_TTL_SECONDS,
  generateLoginOtpCode,
  hashLoginOtpCode,
  signPreAuthToken,
  verifyPreAuthToken,
  timingSafeHexEqual,
} = require("./loginOtpSecurity");

const secret = "test-only-secret-with-at-least-thirty-two-characters";

test("login codes are six numeric digits, including leading zeroes", () => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assert.match(generateLoginOtpCode(), /^\d{6}$/);
  }
});

test("OTP hashes are keyed and bound to the account", () => {
  const hash = hashLoginOtpCode("012345", "user-1", secret);
  assert.match(hash, /^[a-f\d]{64}$/);
  assert.notEqual(hash, hashLoginOtpCode("012345", "user-2", secret));
  assert.notEqual(hash, hashLoginOtpCode("012345", "user-1", `${secret}-different`));
  assert.equal(timingSafeHexEqual(hash, hash), true);
  assert.equal(timingSafeHexEqual(hash, "not-a-hash"), false);
});

test("pre-auth tokens are scoped, signed, and expire after five minutes", () => {
  const now = 1_800_000_000_000;
  const token = signPreAuthToken("user-1", secret, now);
  const payload = verifyPreAuthToken(token, secret, now);
  assert.equal(payload.sub, "user-1");
  assert.equal(payload.exp - payload.iat, LOGIN_OTP_TTL_SECONDS);
  assert.equal(verifyPreAuthToken(token, `${secret}-different`, now), null);
  assert.equal(verifyPreAuthToken(token, secret, now + LOGIN_OTP_TTL_SECONDS * 1000), null);
  assert.equal(verifyPreAuthToken(`${token.slice(0, -1)}x`, secret, now), null);
});
