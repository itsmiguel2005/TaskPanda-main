const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const parseBoolean = (value) =>
  ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());

module.exports = {
  mongoUri: String(process.env.MONGO_URI || "").trim(),
  port: process.env.PORT || 3000,
  smtpUser: String(process.env.SMTP_USER || "").replace(/\s+/g, "").trim(),
  smtpPassword: String(process.env.SMTP_PASSWORD || "").replace(/\s+/g, "").trim(),
  smtpHost: String(process.env.SMTP_HOST || "smtp.gmail.com").trim(),
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: parseBoolean(process.env.SMTP_SECURE),
  mailFrom: String(process.env.MAIL_FROM || process.env.SMTP_USER || "").replace(/\s+/g, "").trim(),
};