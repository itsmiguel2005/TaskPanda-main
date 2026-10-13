const assert = require("node:assert/strict");
const test = require("node:test");
const AuditLog = require("./AuditLog");

test("audit log schema requires an admin identity and limits supported categories and actions", () => {
  assert.equal(AuditLog.schema.path("adminId").options.required, true);
  assert.equal(AuditLog.schema.path("adminId").options.ref, "User");
  assert.deepEqual(AuditLog.schema.path("category").enumValues, [
    "SECURITY",
    "OPERATIONS",
    "FINANCIAL",
    "GOVERNANCE",
  ]);
  assert.deepEqual(AuditLog.schema.path("action").enumValues, [
    "ADMIN_LOGIN",
    "ADMIN_LOGOUT",
    "FAILED_LOGIN_ATTEMPT",
    "CREDENTIALS_UPDATED",
    "PASSWORD_RESET",
    "USER_SUSPENDED",
    "USER_UNSUSPENDED",
    "PROVIDER_SUSPENDED",
    "VERIFICATION_APPROVED",
    "VERIFICATION_REJECTED",
    "ROLE_MODIFIED",
    "REFUND_ISSUED",
    "PAYMENT_RELEASED",
    "PLATFORM_FEE_MODIFIED",
    "REPORT_RESOLVED",
    "REVIEW_REMOVED",
    "SYSTEM_SETTING_TOGGLED",
  ]);
});
