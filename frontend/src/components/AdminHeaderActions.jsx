import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch } from "../services/api.js";
import { adminRequest } from "../services/adminApi.js";
import { promptForPushPermission } from "../services/oneSignal.js";

function HeaderIcon({ name, className = "h-5 w-5" }) {
  const shapes = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    check: <path d="m5 12 4 4L19 6" />,
    dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 1 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 1 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 1 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 1 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  };

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shapes[name]}
    </svg>
  );
}

function readNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return window.Notification.permission;
}

function formatNotificationDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AdminHeaderActions() {
  const { user, token, role, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const actionsRef = useRef(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(readNotificationPermission);
  const [pushPromptStatus, setPushPromptStatus] = useState("");
  const [isPrompting, setIsPrompting] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState("");

  const displayName = user?.fullName || user?.username || "Administrator";
  const firstName = displayName.split(/\s+/)[0] || "Administrator";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  useEffect(() => {
    setOpenMenu(null);
  }, [location.pathname, location.search]);

  const loadNotifications = useCallback(async () => {
    if (role !== "admin" || !token) return;
    setIsLoadingNotifications(true);
    setNotificationError("");
    try {
      const payload = await adminRequest("/api/admin/notifications?limit=10", token);
      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
      setUnreadCount(Number.isFinite(payload.unreadCount) ? payload.unreadCount : 0);
    } catch (error) {
      setNotificationError(error.message || "Could not load admin notifications.");
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [role, token]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (openMenu === "notifications") void loadNotifications();
  }, [loadNotifications, openMenu]);

  useEffect(() => {
    if (!openMenu) return undefined;

    const handlePointerDown = (event) => {
      if (!actionsRef.current?.contains(event.target)) setOpenMenu(null);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpenMenu(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  useEffect(() => {
    if (openMenu !== "notifications") return undefined;

    const refreshNotificationPermission = () => {
      setNotificationPermission(readNotificationPermission());
    };

    refreshNotificationPermission();
    window.addEventListener("focus", refreshNotificationPermission);
    document.addEventListener("visibilitychange", refreshNotificationPermission);
    return () => {
      window.removeEventListener("focus", refreshNotificationPermission);
      document.removeEventListener("visibilitychange", refreshNotificationPermission);
    };
  }, [openMenu]);

  const handleEnableAlerts = async () => {
    setIsPrompting(true);
    setPushPromptStatus("");
    try {
      const result = await promptForPushPermission();
      setPushPromptStatus(result);
      setNotificationPermission(readNotificationPermission());
    } catch (error) {
      console.warn("Admin push permission prompt failed:", error.message);
      setPushPromptStatus("error");
    } finally {
      setIsPrompting(false);
    }
  };

  const handleNotificationOpen = async (notification) => {
    if (!notification.isRead) {
      setNotificationError("");
      try {
        await adminRequest(`/api/admin/notifications/${encodeURIComponent(notification.id)}/read`, token, {
          method: "POST",
        });
      } catch (error) {
        setNotificationError(error.message || "Could not mark this notification as read.");
        return;
      }
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, isRead: true } : item
      )));
      setUnreadCount((current) => Math.max(0, current - 1));
    }
    setOpenMenu(null);
    navigate(notification.targetUrl);
  };

  const handleMarkAllNotificationsRead = async () => {
    setNotificationError("");
    try {
      await adminRequest("/api/admin/notifications/read-all", token, { method: "POST" });
      setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      setNotificationError(error.message || "Could not mark notifications as read.");
    }
  };

  const notificationStatus = {
    granted: {
      label: "Enabled",
      message: "This browser allows TaskPanda to show alerts.",
      className: "bg-emerald-50 text-emerald-800",
    },
    denied: {
      label: "Blocked",
      message: "Alerts are blocked. Allow notifications for TaskPanda in your browser settings.",
      className: "bg-rose-50 text-rose-800",
    },
    unsupported: {
      label: "Unsupported",
      message: "This browser does not support push alerts.",
      className: "bg-slate-100 text-slate-700",
    },
    default: {
      label: "Not enabled",
      message: pushPromptStatus === "unavailable"
        ? "Browser alerts are not configured for TaskPanda on this site."
        : pushPromptStatus === "error"
          ? "Could not open the browser alert prompt. Try again."
          : "Choose Allow in your browser to receive alerts.",
      className: "bg-amber-50 text-amber-800",
    },
  }[notificationPermission];

  const handleSignOut = () => {
    setOpenMenu(null);
    if (token && role === "admin") {
      void apiFetch("/api/auth/admin-logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      }).catch((error) => {
        console.warn("Admin sign-out could not be confirmed:", error.message);
      });
    }
    logout();
    navigate("/", { replace: true });
  };

  return (
    <div ref={actionsRef} className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu((current) => current === "notifications" ? null : "notifications")}
          aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
          aria-expanded={openMenu === "notifications"}
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <HeaderIcon name="bell" />
          {unreadCount > 0 && (
            <span aria-hidden="true" className="absolute right-1 top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        {openMenu === "notifications" && (
          <section
            aria-label="Notifications"
            className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.16)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {unreadCount ? `${unreadCount} unread` : "Action items for your admin queues"}
                </p>
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllNotificationsRead}
                  className="min-h-9 shrink-0 rounded-lg px-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div aria-busy={isLoadingNotifications} className="max-h-[min(22rem,55vh)] overflow-y-auto">
              {notificationError && (
                <p role="alert" className="mx-3 mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
                  {notificationError}
                </p>
              )}
              {isLoadingNotifications ? (
                <div role="status" aria-label="Loading notifications" className="space-y-3 px-4 py-4">
                  <span className="sr-only">Loading notifications</span>
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="animate-pulse space-y-2">
                      <div className="h-3 w-2/3 rounded bg-slate-200" />
                      <div className="h-3 w-full rounded bg-slate-100" />
                      <div className="h-2.5 w-1/3 rounded bg-slate-100" />
                    </div>
                  ))}
                </div>
              ) : notifications.length ? (
                <ul aria-label="Recent admin notifications" className="divide-y divide-slate-100">
                  {notifications.map((notification) => (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => void handleNotificationOpen(notification)}
                        aria-label={`Open notification: ${notification.title}`}
                        className={`flex min-h-[76px] w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${notification.isRead ? "bg-white" : "bg-indigo-50/50"}`}
                      >
                        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.isRead ? "bg-transparent" : "bg-indigo-600"}`} />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm leading-5 ${notification.isRead ? "font-medium text-slate-800" : "font-semibold text-slate-950"}`}>
                            {notification.title}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-slate-600">{notification.message}</span>
                          <span className="mt-1 block text-[11px] text-slate-500">
                            {formatNotificationDate(notification.updatedAt || notification.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : !notificationError ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm font-semibold text-slate-800">You’re all caught up.</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">New reports and review requests will appear here.</p>
                </div>
              ) : null}
            </div>
            <div className="border-t border-slate-100 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-blue-800">Browser alerts</h3>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${notificationStatus.className}`}>
                  {notificationPermission === "granted" && <HeaderIcon name="check" className="h-3.5 w-3.5" />}
                  {notificationStatus.label}
                </span>
              </div>
              <p role="status" className="mt-1 text-xs leading-5 text-slate-500">
                {notificationStatus.message}
              </p>
              {notificationPermission === "default" && pushPromptStatus !== "unavailable" && (
                <button
                  type="button"
                  onClick={handleEnableAlerts}
                  disabled={isPrompting}
                  className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-blue-800 transition hover:text-blue-950 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                >
                  {isPrompting ? "Opening browser prompt…" : "Enable browser alerts"}
                </button>
              )}
            </div>
          </section>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu((current) => current === "profile" ? null : "profile")}
          aria-label={`Open admin profile menu for ${displayName}`}
          aria-expanded={openMenu === "profile"}
          className="flex min-h-11 items-center gap-2 rounded-xl px-1.5 text-left transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:gap-3 sm:px-2"
        >
          <span className="hidden max-w-[12rem] truncate text-sm text-blue-900 md:inline">Good morning, {firstName}</span>
          <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-blue-100 bg-blue-50 text-sm font-semibold text-blue-900">
            {user?.profileImage ? (
              <img src={user.profileImage} alt="" className="h-full w-full object-cover" />
            ) : initials}
          </span>
          <HeaderIcon name="chevron" className="hidden h-4 w-4 text-slate-400 sm:block" />
        </button>
        {openMenu === "profile" && (
          <section
            aria-label="Admin profile menu"
            className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.16)]"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-4">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-sm font-bold text-indigo-800">
                {user?.profileImage ? (
                  <img src={user.profileImage} alt="" className="h-full w-full object-cover" />
                ) : initials}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{displayName}</span>
                <span className="block truncate text-xs text-slate-500">{user?.email || "Admin account"}</span>
              </span>
            </div>
            <div className="border-b border-slate-100 px-3 py-3">
              <p className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Admin account
              </p>
              <nav aria-label="Admin profile links" className="mt-2 space-y-1">
                <Link
                  to="/admin?section=dashboard"
                  onClick={() => setOpenMenu(null)}
                  className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <HeaderIcon name="dashboard" className="h-4 w-4" />
                  </span>
                  Dashboard
                </Link>
                <Link
                  to="/admin?section=settings"
                  onClick={() => setOpenMenu(null)}
                  className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <HeaderIcon name="settings" className="h-4 w-4" />
                  </span>
                  Settings
                </Link>
              </nav>
            </div>
            <div className="p-3">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                <HeaderIcon name="logout" className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
