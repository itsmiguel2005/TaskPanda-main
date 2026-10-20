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

test.after(() => {
  User.findOne = originalFindOne;
  User.updateOne = originalUpdateOne;
  mailer.hasValidSmtpCredentials = originalHasValidSmtpCredentials;
  mailer.sendPasswordChangedEmail = originalSendPasswordChangedEmail;
  console.error = originalConsoleError;
});
