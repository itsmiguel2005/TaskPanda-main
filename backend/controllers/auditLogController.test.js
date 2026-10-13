const assert = require("node:assert/strict");
const test = require("node:test");
const AuditLog = require("../models/AuditLog");
const { handleGetAdminAuditLogs } = require("./auditLogController");

test("admin audit log query filters, sorts, and paginates newest-first entries", async () => {
  const originalFind = AuditLog.find;
  const originalCountDocuments = AuditLog.countDocuments;
  const captured = {};
  const entries = [{ _id: "entry-1", action: "ADMIN_LOGIN" }];
  AuditLog.find = (filter) => {
    captured.filter = filter;
    return {
      sort(value) {
        captured.sort = value;
        return this;
      },
      skip(value) {
        captured.skip = value;
        return this;
      },
      limit(value) {
        captured.limit = value;
        return this;
      },
      lean: async () => entries,
    };
  };
  AuditLog.countDocuments = async (filter) => {
    captured.countFilter = filter;
    return 31;
  };

  const response = {
    json(value) {
      this.body = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
  try {
    await handleGetAdminAuditLogs({
      query: { page: "2", limit: "15", category: "SECURITY", adminName: "ops+1@example.com" },
    }, response);

    assert.equal(captured.filter.category, "SECURITY");
    assert.equal(captured.filter.adminName.$regex, "ops\\+1@example\\.com");
    assert.deepEqual(captured.sort, { createdAt: -1, _id: -1 });
    assert.equal(captured.skip, 15);
    assert.equal(captured.limit, 15);
    assert.equal(captured.countFilter, captured.filter);
    assert.deepEqual(response.body, {
      logs: entries,
      pagination: { page: 2, limit: 15, total: 31, pages: 3 },
    });
  } finally {
    AuditLog.find = originalFind;
    AuditLog.countDocuments = originalCountDocuments;
  }
});
