const bcrypt = require("bcryptjs");
const { randomBytes } = require("crypto");
const User = require("../models/User");
const { logAuditAction } = require("../utils/logAuditAction");

async function handleGetAdminAccounts(req, res) {
  if (!req.isPrimaryAdmin) return res.json({ isPrimaryAdmin: false, accounts: [] });
  try {
    const accounts = await User.find({ role: "admin" })
      .select("fullName email createdAt isSuspended archivedAt")
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    return res.json({
      isPrimaryAdmin: true,
      accounts: accounts.map((account) => ({
        id: String(account._id),
        fullName: account.fullName || account.email,
        email: account.email,
        createdAt: account.createdAt,
        isAvailable: !account.isSuspended && !account.archivedAt,
      })),
    });
  } catch (error) {
    console.error("Admin account list failed:", error);
    return res.status(500).json({ message: "Could not load admin accounts." });
  }
}

async function handleCreateAdminAccount(req, res) {
  const fullName = String(req.body.fullName || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  try {
    const existingAccount = await User.findOne({ email }).select("_id");
    if (existingAccount) return res.status(409).json({ message: "An account with this email already exists." });

    const initialPassword = randomBytes(32).toString("hex");
    const account = await User.create({
      role: "admin",
      fullName,
      username: "",
      email,
      passwordHash: await bcrypt.hash(initialPassword, 12),
      emailVerified: true,
      registrationComplete: true,
    });
    void logAuditAction(req, {
      category: "GOVERNANCE",
      action: "ADMIN_ACCOUNT_CREATED",
      targetResource: "AdminAccount",
      targetId: account._id,
      details: `Created an admin account for ${account.email}.`,
    });
    return res.status(201).json({
      message: "Admin account created. Ask the new admin to use Forgot password on the sign-in page to set their own password.",
      account: {
        id: String(account._id),
        fullName: account.fullName,
        email: account.email,
        createdAt: account.createdAt,
        isAvailable: true,
      },
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "An account with this email already exists." });
    console.error("Admin account creation failed:", error);
    return res.status(500).json({ message: "Could not create the admin account." });
  }
}

module.exports = { handleGetAdminAccounts, handleCreateAdminAccount };
