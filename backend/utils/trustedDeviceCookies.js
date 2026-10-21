const TRUSTED_DEVICE_TTL_SECONDS = 30 * 24 * 60 * 60;
const TRUSTED_DEVICE_COOKIE_PREFIX = "taskpanda_device_trust";
const LEGACY_TRUSTED_DEVICE_COOKIE = TRUSTED_DEVICE_COOKIE_PREFIX;

function getTrustedDeviceCookieName(userId) {
  const id = String(userId);
  if (!/^[a-f\d]{24}$/i.test(id)) throw new TypeError("A valid user ID is required for a trusted-device cookie.");
  return `${TRUSTED_DEVICE_COOKIE_PREFIX}_${id}`;
}

function getRequestCookie(req, name) {
  const parsedCookie = req.cookies?.[name];
  if (typeof parsedCookie === "string" && parsedCookie) return parsedCookie;
  const cookieHeader = String(req.get("cookie") || "");
  const encodedName = `${name}=`;
  const match = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(encodedName));
  return match ? match.slice(encodedName.length) : "";
}

function getTrustedDeviceToken(req, userId) {
  return getRequestCookie(req, getTrustedDeviceCookieName(userId))
    || getRequestCookie(req, LEGACY_TRUSTED_DEVICE_COOKIE);
}

function sendTrustedDeviceCookie(res, userId, token) {
  const cookieName = getTrustedDeviceCookieName(userId);
  res.append(
    "Set-Cookie",
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${TRUSTED_DEVICE_TTL_SECONDS}`
  );
}

module.exports = {
  TRUSTED_DEVICE_TTL_SECONDS,
  getTrustedDeviceCookieName,
  getTrustedDeviceToken,
  sendTrustedDeviceCookie,
};
