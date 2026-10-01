const { randomUUID } = require("crypto");
const config = require("../config/env");

const API_URL = "https://api.onesignal.com";

function hasOneSignalCredentials() {
  return Boolean(config.oneSignalAppId && config.oneSignalRestApiKey);
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

async function sendPushNotification(options) {
  if (!hasOneSignalCredentials()) return null;
  return requestOneSignal("/notifications", { body: buildPushPayload(options) });
}

module.exports = {
  buildPushPayload,
  buildRoleFilters,
  hasOneSignalCredentials,
  sendPushNotification,
};