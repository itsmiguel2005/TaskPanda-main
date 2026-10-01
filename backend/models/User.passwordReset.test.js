const assert = require("node:assert/strict");
const test = require("node:test");
const User = require("./User");

test("user schema stores only a hidden reset-token hash and its expiry", () => {
  const tokenHash = User.schema.path("passwordResetTokenHash");
  const expiresAt = User.schema.path("passwordResetExpiresAt");

  assert.ok(tokenHash, "passwordResetTokenHash should exist on the user schema");
  assert.equal(tokenHash.instance, "String");
  assert.equal(tokenHash.options.select, false);
  assert.ok(expiresAt, "passwordResetExpiresAt should exist on the user schema");
  assert.equal(expiresAt.instance, "Date");
  assert.equal(expiresAt.options.select, false);
});