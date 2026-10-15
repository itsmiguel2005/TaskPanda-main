const test = require("node:test");
const assert = require("node:assert/strict");
const { getAdminUserStatus } = require("./adminController");

test("completed provider account is active while identity verification is unverified", () => {
  assert.equal(getAdminUserStatus({
    role: "provider",
    emailVerified: true,
    registrationComplete: true,
    verificationStatus: "unverified",
    isVerified: false,
  }), "Active");
});

test("completed account is active while provider identity verification is pending review", () => {
  assert.equal(getAdminUserStatus({
    role: "provider",
    emailVerified: true,
    registrationComplete: true,
    verificationStatus: "pending",
  }), "Active");
});

test("account is pending until email verification is complete", () => {
  assert.equal(getAdminUserStatus({
    role: "client",
    emailVerified: false,
    registrationComplete: true,
  }), "Pending");
});

test("account is pending until onboarding and mobile verification are complete", () => {
  assert.equal(getAdminUserStatus({
    role: "provider",
    emailVerified: true,
    registrationComplete: false,
    verificationStatus: "unverified",
  }), "Pending");
});

test("suspension and archive statuses take precedence over registration status", () => {
  assert.equal(getAdminUserStatus({
    emailVerified: false,
    registrationComplete: false,
    isSuspended: true,
  }), "Suspended");
  assert.equal(getAdminUserStatus({
    emailVerified: false,
    registrationComplete: false,
    archivedAt: new Date(),
  }), "Archived");
});
