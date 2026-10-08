import { useEffect, useState } from "react";

const ONLINE_WINDOW_MS = 90 * 1000;
const STATUS_REFRESH_INTERVAL_MS = 15 * 1000;
const MIN_ACTIVITY_TIMESTAMP = new Date("2000-01-01T00:00:00Z").getTime();

function parseActivityDate(value) {
  if (!value) return null;
  const date = new Date(value);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) && timestamp >= MIN_ACTIVITY_TIMESTAMP ? date : null;
}

export function isUserOnline(lastActive, now = Date.now(), isOnline) {
  if (isOnline === false) return false;
  if (!lastActive) return isOnline === true;
  const lastActiveTime = new Date(lastActive).getTime();
  return Number.isFinite(lastActiveTime)
    && lastActiveTime <= now + 60 * 1000
    && now - lastActiveTime < ONLINE_WINDOW_MS;
}

export function formatLastActive(lastActive, now = Date.now(), isOnline) {
  if (!lastActive) return "Activity unavailable";
  const date = parseActivityDate(lastActive);
  if (!date) return "Activity unavailable";
  const lastActiveTime = date.getTime();

  const elapsedMinutes = Math.max(0, Math.floor((now - lastActiveTime) / 60_000));
  if (isUserOnline(date, now, isOnline)) return "Active now";
  if (elapsedMinutes < 1) return "Active less than a minute ago";
  if (elapsedMinutes < 60) {
    const unit = elapsedMinutes === 1 ? "minute" : "minutes";
    return `Active ${elapsedMinutes} ${unit} ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    const unit = elapsedHours === 1 ? "hour" : "hours";
    return `Active ${elapsedHours} ${unit} ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    const unit = elapsedDays === 1 ? "day" : "days";
    return `Active ${elapsedDays} ${unit} ago`;
  }
  return `Active ${date.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`;
}

export function UserLastActive({ lastActive, lastOfflineAt, isOnline, className = "" }) {
  const [now, setNow] = useState(Date.now());
  const [offlineObservedAt, setOfflineObservedAt] = useState(() => (
    isOnline === false ? Date.now() : null
  ));

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), STATUS_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (isOnline === true) {
      setOfflineObservedAt(null);
    } else if (isOnline === false && offlineObservedAt === null) {
      setOfflineObservedAt(Date.now());
    }
  }, [isOnline, offlineObservedAt]);

  const offlineDate = parseActivityDate(lastOfflineAt);
  const activeDate = parseActivityDate(lastActive);
  const activityDate = isOnline === false
    ? offlineDate || activeDate || (offlineObservedAt ? new Date(offlineObservedAt) : null)
    : activeDate;
  if (!activityDate && isOnline !== true) return null;
  const label = formatLastActive(activityDate, now, isOnline);

  return (
    <span
      className={`block truncate text-[11px] leading-4 ${isUserOnline(activityDate, now, isOnline) ? "font-medium text-emerald-700" : "text-slate-600"} ${className}`}
      title={activityDate ? `Last active ${activityDate.toLocaleString("en-PH")}` : label}
      aria-label={label}
    >
      {label}
    </span>
  );
}

export default function UserOnlineStatus({ lastActive, isOnline, className = "" }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), STATUS_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  const online = isUserOnline(lastActive, now, isOnline);
  const label = online ? "Online" : "Offline";

  return (
    <span
      className={`inline-flex h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white shadow-sm ${online ? "bg-emerald-500" : "bg-slate-400"} ${className}`}
      aria-label={`User is ${label.toLowerCase()}`}
      role="img"
      title={online ? "Online" : "Offline"}
    />
  );
}
