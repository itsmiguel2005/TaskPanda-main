const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const test = require("node:test");
const User = require("../models/User");
const audit = require("../utils/logAuditAction");
const originalFindOne = User.findOne;
const originalUpdateOne = User.updateOne;
const originalLogAuditAction = audit.logAuditAction;
const auditCalls = [];
audit.logAuditAction = (...args) => auditCalls.push(args);
const { handleCompleteAdminSetup } = require("./authController");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("admin setup accepts a valid one-time token and consumes it", async () => {
  const setupToken = "a".repeat(64);
  const user = {
    _id: "admin-account-id",
    email: "admin2@taskpanda.com",
    fullName: "Second Admin",
    adminSetupTokenHash: createHash("sha256").update(setupToken).digest("hex"),
    adminSetupExpiresAt: new Date(Date.now() + 60_000),
  };
  User.findOne = (query) => {
    assert.deepEqual(query, { email: user.email, role: "admin" });
    return { select: async (fields) => {
      assert.equal(fields, "+adminSetupTokenHash +adminSetupExpiresAt");
      return user;
    } };
  };
  let updateQuery;
  let updateDocument;
  User.updateOne = async (query, update) => {
    updateQuery = query;
    updateDocument = update;
    return { matchedCount: 1 };
  };
  auditCalls.length = 0;

  try {
    const response = createResponse();
    const request = {
      body: { email: user.email, setupToken, password: "StrongPass1!" },
    };
    await handleCompleteAdminSetup(request, response);

    assert.equal(response.statusCode, 200);
    assert.match(response.body.message, /can now sign in/i);
    assert.equal(updateQuery._id, user._id);
    assert.equal(updateQuery.role, "admin");
    assert.equal(updateQuery.adminSetupTokenHash, user.adminSetupTokenHash);
    assert.ok(updateDocument.$set.passwordHash.startsWith("$2"));
    assert.deepEqual(updateDocument.$unset, { adminSetupTokenHash: 1, adminSetupExpiresAt: 1 });
    assert.equal(request.adminEmail, user.email);
    assert.equal(auditCalls[0][1].action, "ADMIN_ACCOUNT_SETUP_COMPLETED");
  } finally {
    User.findOne = originalFindOne;
    User.updateOne = originalUpdateOne;
  }
});

test("admin setup rejects an invalid token without changing the password", async () => {
  const user = {
    _id: "admin-account-id",
    adminSetupTokenHash: createHash("sha256").update("b".repeat(64)).digest("hex"),
    adminSetupExpiresAt: new Date(Date.now() + 60_000),
  };
  User.findOne = () => ({ select: async () => user });
  let updateCalled = false;
  User.updateOne = async () => {
    updateCalled = true;
    return { matchedCount: 1 };
  };

  try {
    const response = createResponse();
    await handleCompleteAdminSetup({
      body: { email: "admin2@taskpanda.com", setupToken: "a".repeat(64), password: "StrongPass1!" },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.match(response.body.message, /invalid or expired/i);
    assert.equal(updateCalled, false);
  } finally {
    User.findOne = originalFindOne;
    User.updateOne = originalUpdateOne;
  }
});

test.after(() => {
  User.findOne = originalFindOne;
  User.updateOne = originalUpdateOne;
  audit.logAuditAction = originalLogAuditAction;
});
