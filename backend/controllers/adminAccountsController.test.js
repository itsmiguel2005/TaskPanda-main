const assert = require("node:assert/strict");
const test = require("node:test");
const User = require("../models/User");
const audit = require("../utils/logAuditAction");
const mailer = require("../services/mailer");
const originalFind = User.find;
const originalFindOne = User.findOne;
const originalCreate = User.create;
const originalDeleteOne = User.deleteOne;
const originalLogAuditAction = audit.logAuditAction;
const originalHasValidSmtpCredentials = mailer.hasValidSmtpCredentials;
const originalSendAdminAccountSetupEmail = mailer.sendAdminAccountSetupEmail;
const auditCalls = [];
const setupEmailCalls = [];
audit.logAuditAction = (...args) => auditCalls.push(args);
mailer.hasValidSmtpCredentials = true;
mailer.sendAdminAccountSetupEmail = async (...args) => setupEmailCalls.push(args);
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

test("primary admin creates a generated alias and sends a one-time setup email", async () => {
  const originalAccount = {
    _id: "admin-account-id",
    fullName: "Second Admin",
    email: "admin2@taskpanda.com",
    adminContactEmail: "second@example.com",
    createdAt: new Date("2026-10-14T12:00:00Z"),
  };
  User.findOne = () => ({ select: async () => null });
  User.create = async (document) => {
    assert.equal(document.role, "admin");
    assert.equal(document.email, "admin2@taskpanda.com");
    assert.equal(document.adminContactEmail, "second@example.com");
    assert.equal(document.emailVerified, true);
    assert.equal(document.registrationComplete, true);
    assert.match(document.passwordHash, /^\$2[aby]\$/);
    assert.match(document.adminSetupTokenHash, /^[a-f\d]{64}$/);
    assert.ok(document.adminSetupExpiresAt > new Date());
    assert.equal("password" in document, false);
    return originalAccount;
  };
  auditCalls.length = 0;
  setupEmailCalls.length = 0;

  try {
    const response = createResponse();
    await handleCreateAdminAccount({
      body: { fullName: "Second Admin", deliveryEmail: "Second@Example.com" },
      adminEmail: "primary@example.com",
    }, response);
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.account.email, "admin2@taskpanda.com");
    assert.equal(response.body.account.deliveryEmail, "second@example.com");
    assert.equal(response.body.account.id, "admin-account-id");
    assert.equal("passwordHash" in response.body.account, false);
    assert.equal(setupEmailCalls.length, 1);
    assert.equal(setupEmailCalls[0][0], "second@example.com");
    assert.equal(setupEmailCalls[0][1], "admin2@taskpanda.com");
    assert.match(setupEmailCalls[0][2], /^[a-f\d]{64}$/);
    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0][1].action, "ADMIN_ACCOUNT_CREATED");
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  }
});

test("generated admin aliases skip already-used login IDs", async () => {
  const checkedEmails = [];
  User.findOne = ({ email }) => {
    checkedEmails.push(email);
    return { select: async () => (email === "admin2@taskpanda.com" ? { _id: "existing-account" } : null) };
  };
  User.create = async (document) => ({
    _id: "next-admin-id",
    fullName: document.fullName,
    email: document.email,
    adminContactEmail: document.adminContactEmail,
    createdAt: new Date(),
  });
  const response = createResponse();
  try {
    await handleCreateAdminAccount({
      body: { fullName: "Next Admin", deliveryEmail: "next@example.com" },
    }, response);
    assert.equal(response.statusCode, 201);
    assert.deepEqual(checkedEmails, ["admin2@taskpanda.com", "admin3@taskpanda.com"]);
    assert.equal(response.body.account.email, "admin3@taskpanda.com");
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  }
});

test("admin account is removed when setup email delivery fails", async () => {
  User.findOne = () => ({ select: async () => null });
  User.create = async () => ({ _id: "undelivered-admin-id" });
  let deletedAccountId = "";
  User.deleteOne = async ({ _id }) => {
    deletedAccountId = _id;
    return { deletedCount: 1 };
  };
  mailer.sendAdminAccountSetupEmail = async () => {
    throw new Error("SMTP unavailable");
  };
  const response = createResponse();

  try {
    await handleCreateAdminAccount({
      body: { fullName: "Undelivered Admin", deliveryEmail: "undelivered@example.com" },
    }, response);
    assert.equal(response.statusCode, 502);
    assert.equal(deletedAccountId, "undelivered-admin-id");
    assert.match(response.body.message, /setup email could not be delivered/i);
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
    User.deleteOne = originalDeleteOne;
    mailer.sendAdminAccountSetupEmail = originalSendAdminAccountSetupEmail;
  }
});

test.after(() => {
  User.find = originalFind;
  User.findOne = originalFindOne;
  User.create = originalCreate;
  User.deleteOne = originalDeleteOne;
  audit.logAuditAction = originalLogAuditAction;
  mailer.hasValidSmtpCredentials = originalHasValidSmtpCredentials;
  mailer.sendAdminAccountSetupEmail = originalSendAdminAccountSetupEmail;
});
