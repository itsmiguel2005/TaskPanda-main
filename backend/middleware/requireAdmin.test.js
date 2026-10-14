const assert = require("node:assert/strict");
const test = require("node:test");
const AdminSession = require("../models/AdminSession");
const User = require("../models/User");
const { requireAdmin, requirePrimaryAdmin } = require("./requireAdmin");

const originalAdminEmail = process.env.ADMIN_EMAIL;
const originalFindSession = AdminSession.findOne;
const originalDeleteSession = AdminSession.deleteOne;
const originalFindUser = User.findOne;

function response() {
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

test("primary admin sessions are identified from the configured primary email", async () => {
  process.env.ADMIN_EMAIL = "primary@example.com";
  AdminSession.findOne = async () => ({ _id: "session-id", adminEmail: "primary@example.com" });
  const req = { get: () => `Bearer ${"a".repeat(64)}` };
  const res = response();
  let nextCalled = false;
  await requireAdmin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.isPrimaryAdmin, true);
  assert.equal(req.adminEmail, "primary@example.com");
  assert.equal(requirePrimaryAdmin(req, res, () => {}), undefined);
});

test("database-backed admin sessions are accepted but not treated as primary", async () => {
  process.env.ADMIN_EMAIL = "primary@example.com";
  AdminSession.findOne = async () => ({ _id: "session-id", adminEmail: "second@example.com" });
  User.findOne = () => ({
    select: async () => ({ _id: "second-id", fullName: "Second Admin" }),
  });
  const req = { get: () => `Bearer ${"b".repeat(64)}` };
  const res = response();
  let nextCalled = false;
  await requireAdmin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.isPrimaryAdmin, false);
  assert.equal(String(req.adminId), "second-id");
  assert.equal(req.adminName, "Second Admin");

  const deniedResponse = response();
  requirePrimaryAdmin(req, deniedResponse, () => assert.fail("secondary admin must not pass primary-admin guard"));
  assert.equal(deniedResponse.statusCode, 403);
});

test.after(() => {
  AdminSession.findOne = originalFindSession;
  AdminSession.deleteOne = originalDeleteSession;
  User.findOne = originalFindUser;
  if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = originalAdminEmail;
});
