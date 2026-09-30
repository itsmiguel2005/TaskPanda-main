const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const parseBoolean = (value) =>
  ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());

function normalizeOrigin(value) {
  try {
    const candidate = String(value || "").trim();
    if (!candidate) return "";
    return new URL(candidate.includes("://") ? candidate : `https://${candidate}`).origin;
  } catch {
    return "";
  }
}

const corsOrigins = [
  ...String(process.env.CORS_ORIGINS || "").split(",").map(normalizeOrigin),
  normalizeOrigin(process.env.APP_URL),
  normalizeOrigin(process.env.VERCEL_URL),
  normalizeOrigin(process.env.VERCEL_BRANCH_URL),
  ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"]),
].filter((origin, index, origins) => origin && origins.indexOf(origin) === index);

const configuredProxyHops = Number(process.env.TRUST_PROXY);
const trustProxy = process.env.VERCEL
  ? 1
  : Number.isInteger(configuredProxyHops) && configuredProxyHops > 0
  ? configuredProxyHops
  : parseBoolean(process.env.TRUST_PROXY);

module.exports = {
  mongoUri: String(process.env.MONGO_URI || "").trim(),
  mongoDbName: String(process.env.MONGO_DB_NAME || "taskpanda").trim(),
  port: process.env.PORT || 3000,
  smtpUser: String(process.env.SMTP_USER || "").replace(/\s+/g, "").trim(),
  smtpPassword: String(process.env.SMTP_PASSWORD || "").replace(/\s+/g, "").trim(),
  smtpHost: String(process.env.SMTP_HOST || "smtp.gmail.com").trim(),
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: parseBoolean(process.env.SMTP_SECURE),
  corsOrigins,
  trustProxy,
  mailFrom: String(process.env.MAIL_FROM || process.env.SMTP_USER || "").replace(/\s+/g, "").trim(),
  adminOtpEmail: String(process.env.ADMIN_OTP_EMAIL || "").trim().toLowerCase(),
  adminOtpSecret: String(process.env.ADMIN_OTP_SECRET || "").trim(),
  appUrl: String(
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173")
  ).replace(/\/+$/, ""),
};