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

  const attempts = User.schema.path("passwordResetAttempts");
  assert.ok(attempts, "passwordResetAttempts should exist on the user schema");
  assert.equal(attempts.instance, "Number");
  assert.equal(attempts.options.default, 0);
  assert.equal(attempts.options.select, false);
});

test("user schema stores only a hidden admin setup-token hash and its expiry", () => {
  const tokenHash = User.schema.path("adminSetupTokenHash");
  const expiresAt = User.schema.path("adminSetupExpiresAt");

  assert.ok(tokenHash, "adminSetupTokenHash should exist on the user schema");
  assert.equal(tokenHash.instance, "String");
  assert.equal(tokenHash.options.select, false);
  assert.ok(expiresAt, "adminSetupExpiresAt should exist on the user schema");
  assert.equal(expiresAt.instance, "Date");
  assert.equal(expiresAt.options.select, false);
});

test("admin contact email is excluded from default user queries", () => {
  const adminContactEmail = User.schema.path("adminContactEmail");

  assert.ok(adminContactEmail, "adminContactEmail should exist on the user schema");
  assert.equal(adminContactEmail.options.select, false);
});