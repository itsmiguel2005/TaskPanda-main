const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const mailer = require("../services/mailer");
const { handleResetPassword } = require("./authController");

const originalFindOne = User.findOne;
const originalUpdateOne = User.updateOne;
const originalHasValidSmtpCredentials = mailer.hasValidSmtpCredentials;
const originalSendPasswordChangedEmail = mailer.sendPasswordChangedEmail;
const originalConsoleError = console.error;

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

test("password reset responds successfully without waiting for notification email delivery", async () => {
  const user = {
    _id: "user-id",
    email: "user@example.com",
    passwordHash: await bcrypt.hash("OldPass1!", 4),
    passwordResetTokenHash: await bcrypt.hash("123456", 4),
    passwordResetExpiresAt: new Date(Date.now() + 60_000),
  };
  User.findOne = () => ({
    select: async () => user,
  });
  let passwordUpdateCompleted = false;
  User.updateOne = async () => {
    passwordUpdateCompleted = true;
    return { matchedCount: 1 };
  };
  mailer.hasValidSmtpCredentials = true;
  let rejectDelivery;
  let deliveredEmail;
  mailer.sendPasswordChangedEmail = (email) => {
    deliveredEmail = email;
    return new Promise((resolve, reject) => {
      rejectDelivery = reject;
    });
  };
  console.error = () => {};

  try {
    const response = createResponse();
    await handleResetPassword({
      body: { email: user.email, code: "123456", password: "NewPass1!" },
    }, response);

    assert.equal(passwordUpdateCompleted, true);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.message, "Password reset successfully.");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(deliveredEmail, user.email);

    rejectDelivery(new Error("SMTP unavailable"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.message, "Password reset successfully.");
  } finally {
    User.findOne = originalFindOne;
    User.updateOne = originalUpdateOne;
    mailer.hasValidSmtpCredentials = originalHasValidSmtpCredentials;
    mailer.sendPasswordChangedEmail = originalSendPasswordChangedEmail;
    console.error = originalConsoleError;
  }
});

test("invalid password-reset codes atomically increment the per-account attempt counter", async () => {
  const user = {
    _id: "user-id",
    email: "user@example.com",
    passwordHash: await bcrypt.hash("OldPass1!", 4),
    passwordResetTokenHash: await bcrypt.hash("123456", 4),
    passwordResetExpiresAt: new Date(Date.now() + 60_000),
    passwordResetAttempts: 0,
  };
  User.findOne = () => ({ select: async () => user });
  let updateQuery;
  let updateDocument;
  User.updateOne = async (query, update) => {
    updateQuery = query;
    updateDocument = update;
    return { matchedCount: 1 };
  };

  try {
    const response = createResponse();
    await handleResetPassword({
      body: { email: user.email, code: "654321", password: "NewPass1!" },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, "The reset code is incorrect.");
    assert.equal(updateQuery._id, user._id);
    assert.equal(updateQuery.passwordResetTokenHash, user.passwordResetTokenHash);
    assert.equal(updateQuery.$or.length, 2);
    assert.deepEqual(updateDocument, { $inc: { passwordResetAttempts: 1 } });
  } finally {
    User.findOne = originalFindOne;
    User.updateOne = originalUpdateOne;
  }
});

test("password reset rejects codes after the per-account attempt limit", async () => {
  const user = {
    _id: "user-id",
    email: "user@example.com",
    passwordResetTokenHash: await bcrypt.hash("123456", 4),
    passwordResetExpiresAt: new Date(Date.now() + 60_000),
    passwordResetAttempts: 5,
  };
  User.findOne = () => ({ select: async () => user });
  let updateCalled = false;
  User.updateOne = async () => {
    updateCalled = true;
    return { matchedCount: 1 };
  };

  try {
    const response = createResponse();
    await handleResetPassword({
      body: { email: user.email, code: "123456", password: "NewPass1!" },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.match(response.body.message, /too many incorrect reset codes/i);
    assert.equal(updateCalled, false);
  } finally {
    User.findOne = originalFindOne;
    User.updateOne = originalUpdateOne;
  }
});

test.after(() => {
  User.findOne = originalFindOne;
  User.updateOne = originalUpdateOne;
  mailer.hasValidSmtpCredentials = originalHasValidSmtpCredentials;
  mailer.sendPasswordChangedEmail = originalSendPasswordChangedEmail;
  console.error = originalConsoleError;
});
