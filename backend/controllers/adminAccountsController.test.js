const assert = require("node:assert/strict");
const test = require("node:test");
const User = require("../models/User");
const audit = require("../utils/logAuditAction");
const originalFind = User.find;
const originalFindOne = User.findOne;
const originalCreate = User.create;
const originalLogAuditAction = audit.logAuditAction;
const auditCalls = [];
audit.logAuditAction = (...args) => auditCalls.push(args);
const { handleGetAdminAccounts, handleCreateAdminAccount } = require("./adminAccountsController");

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

test("non-primary admins cannot retrieve the admin account directory", async () => {
  const response = createResponse();
  await handleGetAdminAccounts({ isPrimaryAdmin: false }, response);
  assert.deepEqual(response.body, { isPrimaryAdmin: false, accounts: [] });
});

test("primary admin creates an admin identity with an unrevealed initial password", async () => {
  const originalAccount = {
    _id: "admin-account-id",
    fullName: "Second Admin",
    email: "second@example.com",
    createdAt: new Date("2026-10-14T12:00:00Z"),
  };
  User.findOne = () => ({ select: async () => null });
  User.create = async (document) => {
    assert.equal(document.role, "admin");
    assert.equal(document.emailVerified, true);
    assert.equal(document.registrationComplete, true);
    assert.match(document.passwordHash, /^\$2[aby]\$/);
    assert.equal("password" in document, false);
    return originalAccount;
  };
  auditCalls.length = 0;

  try {
    const response = createResponse();
    await handleCreateAdminAccount({
      body: { fullName: "Second Admin", email: "Second@Example.com" },
      adminEmail: "primary@example.com",
    }, response);
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.account.email, "second@example.com");
    assert.equal(response.body.account.id, "admin-account-id");
    assert.equal("passwordHash" in response.body.account, false);
    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0][1].action, "ADMIN_ACCOUNT_CREATED");
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  }
});

test("duplicate email cannot be provisioned as a second admin", async () => {
  User.findOne = () => ({ select: async () => ({ _id: "existing-account" }) });
  const response = createResponse();
  try {
    await handleCreateAdminAccount({
      body: { fullName: "Duplicate Admin", email: "used@example.com" },
    }, response);
    assert.equal(response.statusCode, 409);
  } finally {
    User.findOne = originalFindOne;
  }
});

test.after(() => {
  User.find = originalFind;
  User.findOne = originalFindOne;
  User.create = originalCreate;
  audit.logAuditAction = originalLogAuditAction;
});
