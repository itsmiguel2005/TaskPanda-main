const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generateAdminLoginCode,
  hashAdminLoginCode,
  timingSafeHexEqual,
} = require("./adminLoginSecurity");

test("admin login codes are six numeric digits", () => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assert.match(generateAdminLoginCode(), /^\d{6}$/);
  }
});

test("admin code hashes are keyed to both code and configured secret", () => {
  const code = generateAdminLoginCode();
  const secret = "a-secure-test-secret-with-at-least-32-characters";
  const hash = hashAdminLoginCode(code, secret);
  const otherCode = `${code[0] === "0" ? "1" : "0"}${code.slice(1)}`;

  assert.equal(timingSafeHexEqual(hash, hashAdminLoginCode(code, secret)), true);
  assert.equal(timingSafeHexEqual(hash, hashAdminLoginCode(otherCode, secret)), false);
  assert.equal(timingSafeHexEqual(hash, hashAdminLoginCode(code, `${secret}-other`)), false);
});

test("admin code hash comparison rejects malformed values", () => {
  const hash = hashAdminLoginCode("123456", "a-secure-test-secret-with-at-least-32-characters");

  assert.equal(timingSafeHexEqual(hash, "not-a-hash"), false);
  assert.equal(timingSafeHexEqual(hash, "a".repeat(63)), false);
});