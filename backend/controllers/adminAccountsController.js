const bcrypt = require("bcryptjs");
const { createHash, randomBytes } = require("crypto");
const User = require("../models/User");
const { logAuditAction } = require("../utils/logAuditAction");
const config = require("../config/env");
const mailer = require("../services/mailer");

async function handleGetAdminAccounts(req, res) {
  if (!req.isPrimaryAdmin) return res.json({ isPrimaryAdmin: false, accounts: [] });
  try {
    const accounts = await User.find({ role: "admin" })
      .select("fullName email adminContactEmail createdAt isSuspended archivedAt")
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    return res.json({
      isPrimaryAdmin: true,
      accounts: accounts.map((account) => ({
        id: String(account._id),
        fullName: account.fullName || account.email,
        email: account.email,
        deliveryEmail: account.adminContactEmail || account.email,
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
  const deliveryEmail = String(req.body.deliveryEmail || "").trim().toLowerCase();
  if (!mailer.hasValidSmtpCredentials || !config.appUrl) {
    return res.status(503).json({ message: "Admin invitations are unavailable because email delivery is not configured." });
  }

  let account;
  let cleanupFailed = false;
  try {
    let loginEmail = "";
    const primaryAdminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    for (let suffix = 2; suffix <= 10001; suffix += 1) {
      const candidate = `admin${suffix}@taskpanda.com`;
      if (candidate === primaryAdminEmail) continue;
      const existingAccount = await User.findOne({ email: candidate }).select("_id");
      if (!existingAccount) {
        loginEmail = candidate;
        break;
      }
    }
    if (!loginEmail) {
      console.error("Admin account creation failed: no generated login aliases are available.");
      return res.status(503).json({ message: "Could not generate an available admin login. Please try again later." });
    }

    const initialPassword = randomBytes(32).toString("hex");
    const setupToken = randomBytes(32).toString("hex");
    const setupTokenHash = createHash("sha256").update(setupToken).digest("hex");
    const setupExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    account = await User.create({
      role: "admin",
      fullName,
      username: "",
      email: loginEmail,
      adminContactEmail: deliveryEmail,
      passwordHash: await bcrypt.hash(initialPassword, 12),
      adminSetupTokenHash: setupTokenHash,
      adminSetupExpiresAt: setupExpiresAt,
      emailVerified: true,
      registrationComplete: true,
    });
    await mailer.sendAdminAccountSetupEmail(deliveryEmail, loginEmail, setupToken);
    void logAuditAction(req, {
      category: "GOVERNANCE",
      action: "ADMIN_ACCOUNT_CREATED",
      targetResource: "AdminAccount",
      targetId: account._id,
      details: `Created an admin account for ${account.email} and sent its setup invitation.`,
    });
    return res.status(201).json({
      message: `Admin account created. A one-time password setup link was sent to ${deliveryEmail}. The login email is ${loginEmail}.`,
      account: {
        id: String(account._id),
        fullName: account.fullName,
        email: account.email,
        deliveryEmail,
        createdAt: account.createdAt,
        isAvailable: true,
      },
    });
  } catch (error) {
    if (account) {
      try {
        const cleanupResult = await User.deleteOne({ _id: account._id });
        if (!cleanupResult.deletedCount) {
          cleanupFailed = true;
          console.error("Admin account cleanup did not remove the account after setup email delivery failed:", String(account._id));
        }
      } catch (cleanupError) {
        cleanupFailed = true;
        console.error("Failed to remove admin account after setup email delivery failed:", cleanupError);
      }
    }
    if (error.code === 11000) return res.status(409).json({ message: "The generated admin login is already in use. Please try again." });
    console.error("Admin account creation failed:", error);
    if (cleanupFailed) {
      return res.status(500).json({ message: "Setup email delivery failed and the pending admin account could not be removed. Check Admin accounts before retrying." });
    }
    return res.status(account ? 502 : 500).json({
      message: account
        ? "The setup email could not be delivered, and the admin account was removed. Please try again."
        : "Could not create the admin account.",
    });
  }
}

module.exports = { handleGetAdminAccounts, handleCreateAdminAccount };
