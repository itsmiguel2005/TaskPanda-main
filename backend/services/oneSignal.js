const { randomUUID } = require("crypto");
const config = require("../config/env");

const API_URL = "https://api.onesignal.com";

function hasOneSignalCredentials() {
  return Boolean(config.oneSignalAppId && config.oneSignalRestApiKey);
}

function hasOneSignalEmailConfig() {
  return Boolean(
    hasOneSignalCredentials() &&
    config.oneSignalEmailVerificationTemplateId &&
    config.oneSignalPasswordResetTemplateId
  );
}

function buildRoleFilters(roles) {
  const allowedRoles = [...new Set(roles.map((role) => String(role).trim().toLowerCase()))];
  if (!allowedRoles.length || allowedRoles.some((role) => !["client", "provider", "admin"].includes(role))) {
    throw new Error("At least one supported OneSignal role is required.");
  }

  return allowedRoles.flatMap((role, index) => [
    ...(index ? [{ operator: "OR" }] : []),
    { field: "tag", key: "role", relation: "=", value: role },
  ]);
}

function buildPushPayload({ userIds = [], roles = [], title, body, url, data = {}, name }) {
  const externalIds = [...new Set(userIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const targetRoles = [...new Set(roles.map((role) => String(role || "").trim().toLowerCase()).filter(Boolean))];
  if (Boolean(externalIds.length) === Boolean(targetRoles.length)) {
    throw new Error("Choose exactly one OneSignal target: user IDs or roles.");
  }

  const appUrl = config.appUrl || (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173");
  if (!appUrl) throw new Error("APP_URL is required for OneSignal push deep links.");

  return {
    app_id: config.oneSignalAppId,
    target_channel: "push",
    name: String(name || title || "TaskPanda alert").slice(0, 128),
    headings: { en: String(title || "TaskPanda update").slice(0, 100) },
    contents: { en: String(body || "You have a new TaskPanda update.").slice(0, 240) },
    url: new URL(url || "/", `${appUrl.replace(/\/+$/, "")}/`).toString(),
    data,
    idempotency_key: randomUUID(),
    ...(externalIds.length
      ? { include_aliases: { external_id: externalIds } }
      : { filters: buildRoleFilters(targetRoles) }),
  };
}

function buildEmailPayload({ email, templateId, customData }) {
  if (!config.oneSignalAppId) throw new Error("ONESIGNAL_APP_ID is not configured.");
  if (!templateId) throw new Error("The required OneSignal email template ID is not configured.");
  if (!/^\S+@\S+\.\S+$/.test(String(email || ""))) throw new Error("A valid recipient email is required.");

  return {
    app_id: config.oneSignalAppId,
    target_channel: "email",
    email_to: [String(email).trim().toLowerCase()],
    template_id: templateId,
    custom_data: customData,
    idempotency_key: randomUUID(),
  };
}

async function requestOneSignal(path, { method = "POST", body } = {}) {
  if (!hasOneSignalCredentials()) throw new Error("ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY are required.");

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Key ${config.oneSignalRestApiKey}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const responseText = await response.text();
  let result = {};
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    result = {};
  }

  if (!response.ok) {
    const errors = Array.isArray(result.errors) ? result.errors : [];
    const summary = errors.map((error) => typeof error === "string" ? error : error.title).filter(Boolean).join("; ");
    throw new Error(`OneSignal request failed (${response.status})${summary ? `: ${summary}` : ""}.`);
  }
  if (path.startsWith("/notifications") && !result.id) {
    throw new Error("OneSignal accepted the request but did not create a message for the target.");
  }
  return result;
}

async function sendTemplateEmail({ email, templateId, customData }) {
  if (!hasOneSignalEmailConfig()) throw new Error("OneSignal email credentials and both transactional template IDs must be configured.");
  return requestOneSignal("/notifications?c=email", {
    body: buildEmailPayload({ email, templateId, customData }),
  });
}

async function sendPasswordResetEmail(email, code) {
  const resetUrl = new URL("/forgot-password", `${config.appUrl}/`);
  resetUrl.searchParams.set("email", String(email).trim().toLowerCase());
  resetUrl.searchParams.set("code", code);
  return sendTemplateEmail({
    email,
    templateId: config.oneSignalPasswordResetTemplateId,
    customData: { otp: code, reset_url: resetUrl.toString(), expiration_minutes: 10 },
  });
}

async function sendEmailVerificationEmail(email, verificationUrl) {
  return sendTemplateEmail({
    email,
    templateId: config.oneSignalEmailVerificationTemplateId,
    customData: { verification_url: verificationUrl, expiration_hours: 24 },
  });
}

async function sendPushNotification(options) {
  if (!hasOneSignalCredentials()) return null;
  return requestOneSignal("/notifications", { body: buildPushPayload(options) });
}

async function listEmailTemplates(offset = 0) {
  const query = new URLSearchParams({ app_id: config.oneSignalAppId, channel: "email", limit: "50", offset: String(offset) });
  return requestOneSignal(`/templates?${query}`, { method: "GET" });
}

async function createEmailTemplate(template) {
  return requestOneSignal("/templates", { body: { app_id: config.oneSignalAppId, isEmail: true, ...template } });
}

module.exports = {
  buildEmailPayload,
  buildPushPayload,
  buildRoleFilters,
  createEmailTemplate,
  hasOneSignalCredentials,
  hasOneSignalEmailConfig,
  listEmailTemplates,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  sendPushNotification,
};