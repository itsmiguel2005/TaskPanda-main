const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");

const AUDIT_LOG_PAGE_SIZE = 25;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function handleGetAdminAuditLogs(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const requestedLimit = Number.parseInt(req.query.limit, 10) || AUDIT_LOG_PAGE_SIZE;
  const limit = Math.min(100, Math.max(1, requestedLimit));
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.adminName) {
    filter.adminName = mongoose.trusted({
      $regex: escapeRegex(String(req.query.adminName).trim().slice(0, 100)),
      $options: "i",
    });
  }

  try {
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);
    return res.json({
      logs,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("Admin audit log query failed:", error);
    return res.status(500).json({ message: "Could not load system audit logs." });
  }
}

module.exports = { AUDIT_LOG_PAGE_SIZE, handleGetAdminAuditLogs };
