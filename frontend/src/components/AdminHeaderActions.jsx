import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { promptForPushPermission } from "../services/oneSignal.js";

function HeaderIcon({ name, className = "h-5 w-5" }) {
  const shapes = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
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

export default function AdminHeaderActions() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const actionsRef = useRef(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(readNotificationPermission);
  const [pushPromptStatus, setPushPromptStatus] = useState("");
  const [isPrompting, setIsPrompting] = useState(false);

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

  const notificationMessage = notificationPermission === "granted"
    ? "Browser alerts are enabled for this device."
    : notificationPermission === "denied"
      ? "Alerts are blocked. Allow notifications in your browser settings."
      : notificationPermission === "unsupported"
        ? "This browser does not support push alerts."
        : pushPromptStatus === "unavailable"
          ? "Push alerts are not configured."
          : pushPromptStatus === "error"
            ? "Could not open the browser alert prompt. Try again."
            : "Get browser alerts for important updates.";

  const handleSignOut = () => {
    setOpenMenu(null);
    logout();
    navigate("/", { replace: true });
  };

  return (
    <div ref={actionsRef} className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu((current) => current === "notifications" ? null : "notifications")}
          aria-label="Notifications"
          aria-expanded={openMenu === "notifications"}
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition hover:bg-blue-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <HeaderIcon name="bell" />
        </button>
        {openMenu === "notifications" && (
          <section
            aria-label="Notifications"
            className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.16)]"
          >
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
              <p className="mt-0.5 text-xs text-slate-500">Admin alerts for this device</p>
            </div>
            <div className="px-4 py-4">
              <p className="text-sm font-medium text-slate-800">No new admin notifications</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{notificationMessage}</p>
              {notificationPermission === "default" && (
                <button
                  type="button"
                  onClick={handleEnableAlerts}
                  disabled={isPrompting}
                  className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
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
