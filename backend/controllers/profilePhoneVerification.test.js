const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../models/User");
const config = require("../config/env");
const sms = require("../utils/sendSms");
const { hashLoginOtpCode } = require("../services/loginOtpSecurity");

const originalSecret = config.authOtpSecret;
const originalSendSms = sms.sendSms;
config.authOtpSecret = "a".repeat(64);
let lastSentCode;
let lastSentPhone;
let sendCallCount = 0;
sms.sendSms = async (phone, otpCode) => {
  sendCallCount += 1;
  lastSentPhone = phone;
  lastSentCode = otpCode;
};
const {
  handleSendProfilePhoneOtp,
  handleVerifyProfilePhoneOtp,
  handleUpdateProfile,
} = require("./profileController");

function makeResponse() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("new profile phone stays pending while its hashed five-minute OTP is sent", async () => {
  const originalFindOne = User.findOne;
  const originalUpdateOne = User.updateOne;
  let update;
  lastSentCode = "";
  User.findOne = () => ({ select: async () => null });
  User.updateOne = async (_filter, changes) => {
    update = changes;
    return { matchedCount: 1 };
  };
  const req = {
    body: { phone: "09171234567" },
    user: { _id: "legacy-user", mobileNumber: "09170000000", phoneVerified: false },
  };
  lastSentPhone = "";
  const res = makeResponse();

  try {
    await handleSendProfilePhoneOtp(req, res);

    assert.equal(res.statusCode, 200);
    assert.match(lastSentCode, /^\d{6}$/);
    assert.equal(lastSentPhone, "09171234567");
    assert.equal(update.$set.phoneOtpHash, hashLoginOtpCode(lastSentCode, "legacy-user", config.authOtpSecret));
    assert.equal(update.$set.phoneOtpAttempts, 0);
    assert.equal(update.$set.pendingMobileNumber, "09171234567");
    assert.equal(update.$set.mobileNumber, undefined);
    assert.ok(update.$set.phoneOtpExpiresAt.getTime() > Date.now());
    assert.ok(update.$set.phoneOtpExpiresAt.getTime() <= Date.now() + 5 * 60 * 1000);
  } finally {
    User.findOne = originalFindOne;
    User.updateOne = originalUpdateOne;
  }
});

test("profile phone OTP refuses numbers already linked to another account", async () => {
  const originalFindOne = User.findOne;
  const originalUpdateOne = User.updateOne;
  sendCallCount = 0;
  let updateCalled = false;
  User.findOne = () => ({ select: async () => ({ _id: "another-user" }) });
  User.updateOne = async () => {
    updateCalled = true;
    return { matchedCount: 1 };
  };
  const res = makeResponse();

  try {
    await handleSendProfilePhoneOtp({
      body: { phone: "09171234567" },
      user: { _id: "legacy-user", mobileNumber: "09170000000", phoneVerified: false },
    }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /already linked/);
    assert.equal(updateCalled, false);
    assert.equal(sendCallCount, 0);
  } finally {
    User.findOne = originalFindOne;
    User.updateOne = originalUpdateOne;
  }
});

test("profile phone OTP rejects an invalid legacy number before sending", async () => {
  const originalUpdateOne = User.updateOne;
  let updateCalled = false;
  sendCallCount = 0;
  User.updateOne = async () => {
    updateCalled = true;
    return { matchedCount: 1 };
  };
  const res = makeResponse();

  try {
    await handleSendProfilePhoneOtp({
      user: { _id: "legacy-user", mobileNumber: "random-number", phoneVerified: false },
      body: { phone: "random-number" },
    }, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /valid Philippine mobile number/);
    assert.equal(updateCalled, false);
    assert.equal(sendCallCount, 0);
  } finally {
    User.updateOne = originalUpdateOne;
  }
});

test("profile phone OTP verification succeeds once and clears the code", async () => {
  const originalFindOne = User.findOne;
  const originalUpdateOne = User.updateOne;
  let update;
  const now = Date.now();
  const otpCode = "123456";
  const user = {
    _id: "legacy-user",
    phoneOtpHash: hashLoginOtpCode(otpCode, "legacy-user", config.authOtpSecret),
    phoneOtpExpiresAt: new Date(now + 60_000),
    phoneOtpAttempts: 0,
  };
  User.findOne = (filter) => ({
    select: async () => Object.prototype.hasOwnProperty.call(filter, "pendingMobileNumber") ? user : null,
  });
  User.updateOne = async (_filter, changes) => {
    update = changes;
    return { matchedCount: 1 };
  };
  const req = {
    body: { phone: "09171234567", otpCode },
    user: { _id: "legacy-user", mobileNumber: "09170000000", phoneVerified: false },
  };
  const res = makeResponse();

  try {
    await handleVerifyProfilePhoneOtp(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(req.user.phoneVerified, true);
    assert.equal(res.body.phoneVerified, true);
    assert.equal(res.body.mobileNumber, "09171234567");
    assert.equal(update.$set.phoneVerified, true);
    assert.equal(update.$set.mobileNumber, "09171234567");
    assert.deepEqual(Object.keys(update.$unset).sort(), ["pendingMobileNumber", "phoneOtpAttempts", "phoneOtpExpiresAt", "phoneOtpHash"]);
  } finally {
    User.findOne = originalFindOne;
    User.updateOne = originalUpdateOne;
  }
});

test("profile phone OTP rejects expired codes without marking the account verified", async () => {
  const originalFindOne = User.findOne;
  const originalUpdateOne = User.updateOne;
  let updateCalled = false;
  User.findOne = () => ({
    select: async () => ({
      _id: "legacy-user",
      phoneOtpHash: hashLoginOtpCode("123456", "legacy-user", config.authOtpSecret),
      phoneOtpExpiresAt: new Date(Date.now() - 1),
    }),
  });
  User.updateOne = async () => {
    updateCalled = true;
    return { matchedCount: 1 };
  };
  const req = {
    body: { phone: "09171234567", otpCode: "123456" },
    user: { _id: "legacy-user", mobileNumber: "09171234567", phoneVerified: false },
  };
  const res = makeResponse();

  try {
    await handleVerifyProfilePhoneOtp(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /expired/);
    assert.equal(req.user.phoneVerified, false);
    assert.equal(updateCalled, false);
  } finally {
    User.findOne = originalFindOne;
    User.updateOne = originalUpdateOne;
  }
});

test("profile updates cannot replace a phone number without OTP verification", async () => {
  let saveCalled = false;
  const req = {
    body: {
      firstName: "Legacy",
      lastName: "User",
      fullName: "Legacy User",
      username: "legacyuser",
      mobileNumber: "09171234567",
    },
    user: {
      _id: "legacy-user",
      role: "client",
      firstName: "Legacy",
      lastName: "User",
      fullName: "Legacy User",
      username: "legacyuser",
      mobileNumber: "09170000000",
      save: async () => {
        saveCalled = true;
      },
    },
  };
  const res = makeResponse();

  await handleUpdateProfile(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.field, "phone");
  assert.match(res.body.message, /only after SMS verification/);
  assert.equal(req.user.mobileNumber, "09170000000");
  assert.equal(saveCalled, false);
});

test.after(() => {
  config.authOtpSecret = originalSecret;
  sms.sendSms = originalSendSms;
});
