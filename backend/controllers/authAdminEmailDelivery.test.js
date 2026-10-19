const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const AdminLoginChallenge = require("../models/AdminLoginChallenge");
const config = require("../config/env");
const mailer = require("../services/mailer");
const adminLoginSecurity = require("../services/adminLoginSecurity");
const {
  handleLogin,
  handleForgotPassword,
} = require("./authController");

const originalFindOne = User.findOne;
const originalUpdateOne = User.updateOne;
const originalChallengeFindOneAndUpdate = AdminLoginChallenge.findOneAndUpdate;
const originalChallengeDeleteOne = AdminLoginChallenge.deleteOne;
const originalHasValidSmtpCredentials = mailer.hasValidSmtpCredentials;
const originalSendPasswordResetEmail = mailer.sendPasswordResetEmail;
const originalSendAdminLoginOtpEmail = mailer.sendAdminLoginOtpEmail;
const originalConsumeAdminRateLimit = adminLoginSecurity.consumeAdminRateLimit;
const originalAppUrl = config.appUrl;
const originalAdminOtpSecret = config.adminOtpSecret;

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

async function requestPasswordReset(user, sendEmail) {
  const updates = [];
  User.findOne = (query) => {
    assert.deepEqual(query, { email: user.email });
    return {
      select: async (fields) => {
        assert.equal(fields, "+adminContactEmail");
        return user;
      },
    };
  };
  User.updateOne = async (...args) => {
    updates.push(args);
    return { matchedCount: 1 };
  };
  mailer.hasValidSmtpCredentials = true;
  mailer.sendPasswordResetEmail = sendEmail;
  const response = createResponse();
  await handleForgotPassword({ body: { email: user.email } }, response);
  return { response, updates };
}

test("admin alias reset code is sent to the saved admin contact email", async () => {
  const user = {
    _id: "admin-account-id",
    email: "admin2@taskpanda.com",
    adminContactEmail: "owner@example.com",
    role: "admin",
  };
  let delivery;

  try {
    const { response, updates } = await requestPasswordReset(user, async (...args) => {
      delivery = args;
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(delivery.slice(0, 1), ["owner@example.com"]);
    assert.equal(delivery[2], "admin2@taskpanda.com");
    assert.ok(updates[0][1].$set.passwordResetTokenHash);
    assert.ok(updates[0][1].$set.passwordResetExpiresAt instanceof Date);
  } finally {
    User.findOne = originalFindOne;
    User.updateOne = originalUpdateOne;
    mailer.hasValidSmtpCredentials = originalHasValidSmtpCredentials;
    mailer.sendPasswordResetEmail = originalSendPasswordResetEmail;
  }
});

test("failed reset email delivery clears the unusable reset code", async () => {
  const user = {
    _id: "admin-account-id",
    email: "admin2@taskpanda.com",
    adminContactEmail: "owner@example.com",
    role: "admin",
  };

  try {
    const { response, updates } = await requestPasswordReset(user, async () => {
      throw new Error("SMTP rejected message");
    });

    assert.equal(response.statusCode, 502);
    assert.deepEqual(updates[1][0], {
      _id: user._id,
      passwordResetTokenHash: updates[0][1].$set.passwordResetTokenHash,
    });
    assert.deepEqual(updates[1][1], {
      $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 },
    });
  } finally {
    User.findOne = originalFindOne;
    User.updateOne = originalUpdateOne;
    mailer.hasValidSmtpCredentials = originalHasValidSmtpCredentials;
    mailer.sendPasswordResetEmail = originalSendPasswordResetEmail;
  }
});

test("admin sign-in code is delivered to the saved contact email for an alias login", async () => {
  const user = {
    _id: "admin-account-id",
    email: "admin2@taskpanda.com",
    adminContactEmail: "owner@example.com",
    role: "admin",
    fullName: "Second Admin",
    passwordHash: await bcrypt.hash("StrongPass1!", 10),
    isSuspended: false,
  };
  let deliveryEmail;

  User.findOne = () => ({
    select: async (fields) => {
      assert.equal(fields, "+trustedDevices +adminContactEmail");
      return user;
    },
  });
  AdminLoginChallenge.findOneAndUpdate = async () => ({});
  AdminLoginChallenge.deleteOne = async () => ({ deletedCount: 1 });
  adminLoginSecurity.consumeAdminRateLimit = async () => ({ allowed: true });
  mailer.hasValidSmtpCredentials = true;
  mailer.sendAdminLoginOtpEmail = async (email) => {
    deliveryEmail = email;
  };
  config.adminOtpSecret = "s".repeat(32);

  try {
    const response = createResponse();
    await handleLogin({
      body: { email: user.email, password: "StrongPass1!" },
      ip: "127.0.0.1",
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(deliveryEmail, user.adminContactEmail);
    assert.equal(response.body.otpDestination, user.adminContactEmail);
    assert.equal(response.body.requiresAdminOtp, true);
  } finally {
    User.findOne = originalFindOne;
    AdminLoginChallenge.findOneAndUpdate = originalChallengeFindOneAndUpdate;
    AdminLoginChallenge.deleteOne = originalChallengeDeleteOne;
    adminLoginSecurity.consumeAdminRateLimit = originalConsumeAdminRateLimit;
    mailer.hasValidSmtpCredentials = originalHasValidSmtpCredentials;
    mailer.sendAdminLoginOtpEmail = originalSendAdminLoginOtpEmail;
    config.adminOtpSecret = originalAdminOtpSecret;
  }
});

test.after(() => {
  User.findOne = originalFindOne;
  User.updateOne = originalUpdateOne;
  AdminLoginChallenge.findOneAndUpdate = originalChallengeFindOneAndUpdate;
  AdminLoginChallenge.deleteOne = originalChallengeDeleteOne;
  adminLoginSecurity.consumeAdminRateLimit = originalConsumeAdminRateLimit;
  mailer.hasValidSmtpCredentials = originalHasValidSmtpCredentials;
  mailer.sendPasswordResetEmail = originalSendPasswordResetEmail;
  mailer.sendAdminLoginOtpEmail = originalSendAdminLoginOtpEmail;
  config.appUrl = originalAppUrl;
  config.adminOtpSecret = originalAdminOtpSecret;
});

config.appUrl = "http://localhost:5173";
