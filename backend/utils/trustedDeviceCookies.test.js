const assert = require("node:assert/strict");
const test = require("node:test");
const {
  TRUSTED_DEVICE_TTL_SECONDS,
  getTrustedDeviceCookieName,
  getTrustedDeviceToken,
  sendTrustedDeviceCookie,
} = require("./trustedDeviceCookies");

const firstUserId = "0123456789abcdef01234567";
const secondUserId = "fedcba9876543210fedcba98";

test("trusted-device cookies are isolated per account", () => {
  const firstCookieName = getTrustedDeviceCookieName(firstUserId);
  const secondCookieName = getTrustedDeviceCookieName(secondUserId);
  const request = {
    cookies: {
      [firstCookieName]: "first-account-token",
      [secondCookieName]: "second-account-token",
    },
    get: () => "",
  };

  assert.notEqual(firstCookieName, secondCookieName);
  assert.equal(getTrustedDeviceToken(request, firstUserId), "first-account-token");
  assert.equal(getTrustedDeviceToken(request, secondUserId), "second-account-token");
});

test("legacy trusted-device cookies remain usable during migration", () => {
  const request = {
    cookies: { taskpanda_device_trust: "legacy-token" },
    get: () => "",
  };

  assert.equal(getTrustedDeviceToken(request, firstUserId), "legacy-token");
});

test("trusted-device cookie is set with the account-specific name and existing security options", () => {
  let cookieHeader = "";
  sendTrustedDeviceCookie({
    append: (headerName, value) => {
      assert.equal(headerName, "Set-Cookie");
      cookieHeader = value;
    },
  }, firstUserId, "device-token");

  assert.equal(
    cookieHeader,
    `${getTrustedDeviceCookieName(firstUserId)}=device-token; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${TRUSTED_DEVICE_TTL_SECONDS}`,
  );
});

test("trusted-device cookie names reject invalid user IDs", () => {
  assert.throws(() => getTrustedDeviceCookieName("invalid"), TypeError);
});
