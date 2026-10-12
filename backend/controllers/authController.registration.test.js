const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("crypto");
const User = require("../models/User");
const { handleRegistrationStatus } = require("./authController");

test("registration status can recover a verified session already claimed by a closed tab", async () => {
  const originalFindOne = User.findOne;
  const originalFindOneAndUpdate = User.findOneAndUpdate;
  const sessionToken = "a".repeat(64);
  const registrationSessionTokenHash = createHash("sha256").update(sessionToken).digest("hex");
  const updates = [];

  User.findOne = () => ({
    select: async () => ({
      _id: "registration-user",
      email: "client@example.com",
      username: "client1",
      role: "client",
      emailVerified: true,
      registrationComplete: false,
      registrationResumeClaimedAt: new Date(),
    }),
  });
  User.findOneAndUpdate = async (filter, update) => {
    updates.push({ filter, update });
    return {
      _id: "registration-user",
      email: "client@example.com",
      username: "client1",
      role: "client",
      emailVerified: true,
      registrationComplete: false,
    };
  };

  const makeResponse = () => ({
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  });
  const req = {
    get(name) {
      return name.toLowerCase() === "cookie"
        ? `taskpanda_registration=${sessionToken}`
        : "";
    },
  };

  try {
    const firstResponse = makeResponse();
    const secondResponse = makeResponse();
    await handleRegistrationStatus(req, firstResponse);
    await handleRegistrationStatus(req, secondResponse);

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(secondResponse.statusCode, 200);
    assert.ok(firstResponse.body.onboardingToken);
    assert.ok(secondResponse.body.onboardingToken);
    assert.notEqual(firstResponse.body.onboardingToken, secondResponse.body.onboardingToken);
    assert.equal(firstResponse.body.user.role, "client");
    assert.equal(secondResponse.body.user.role, "client");
    assert.equal(updates.length, 2);
    assert.equal(JSON.stringify(updates[0].filter).includes("registrationResumeClaimedAt"), false);
    assert.equal(
      JSON.stringify(updates[0].filter).includes(registrationSessionTokenHash),
      true,
    );
  } finally {
    User.findOne = originalFindOne;
    User.findOneAndUpdate = originalFindOneAndUpdate;
  }
});
