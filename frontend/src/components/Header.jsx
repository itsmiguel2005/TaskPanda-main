import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const CONVERSATION_READ_EVENT = "taskpanda:conversation-read";

function MenuIcon({ children, className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

export default function Header({ logoColor = "text-primary-700", showNav = false, activeTab = "Home", role = "client", notifCount = 2 }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, role: authRole, user, firstName, logout, token } = useAuth();
  const notifRef = useRef(null);

  useEffect(() => {
    if (!showNav || !isLoggedIn || !token || !["client", "provider"].includes(authRole)) {
      setUnreadMessageCount(0);
      return undefined;
    }

    let active = true;
    let isFetching = false;
    let refreshAfterFetch = false;
    const loadUnreadMessageCount = async () => {
      if (isFetching) {
        refreshAfterFetch = true;
        return;
      }
      isFetching = true;
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [activeResponse, archivedResponse] = await Promise.all([
          fetch("/api/conversations", { headers }),
          fetch("/api/conversations?includeArchived=true", { headers }),
        ]);
        if (!activeResponse.ok || !archivedResponse.ok) return;
        const [activeData, archivedData] = await Promise.all([
          activeResponse.json(),
          archivedResponse.json(),
        ]);
        const conversations = [
          ...(Array.isArray(activeData.conversations) ? activeData.conversations : []),
          ...(Array.isArray(archivedData.conversations) ? archivedData.conversations : []),
        ];
        const totalUnread = conversations.reduce((total, conversation) => total + Math.max(0, Number(conversation.unreadCount) || 0), 0);
        if (active) setUnreadMessageCount(totalUnread);
      } catch {
        // Keep the last known count when the conversation request is temporarily unavailable.
      } finally {
        isFetching = false;
        if (active && refreshAfterFetch) {
          refreshAfterFetch = false;
          void loadUnreadMessageCount();
        }
      }
    };

    const handleConversationRead = (event) => {
      const count = Math.max(0, Number(event.detail?.unreadCount) || 0);
      if (count > 0) setUnreadMessageCount((current) => Math.max(0, current - count));
      if (event.detail?.refresh) void loadUnreadMessageCount();
    };

    void loadUnreadMessageCount();
    const intervalId = window.setInterval(loadUnreadMessageCount, 8_000);
    window.addEventListener(CONVERSATION_READ_EVENT, handleConversationRead);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener(CONVERSATION_READ_EVENT, handleConversationRead);
    };
  }, [authRole, isLoggedIn, showNav, token]);

  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [notifOpen]);

  useEffect(() => {
    setNotifOpen(false);
    setDropdownOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  const clientNavLinks = [
    { label: "Home", icon: "🏠", path: "/dashboard" },
    { label: "Explore", icon: "🔍", path: "/explore" },
    { label: "Bookings", icon: "📋", path: "/bookings" },
    { label: "Messages", icon: "💬", path: "/client/messages" },
    { label: "Profile", icon: "👤", path: "/profile" },
  ];

  const providerNavLinks = [
    { label: "Home", icon: "🏠", path: "/provider-dashboard" },
    { label: "Bookings", icon: "📋", path: "/provider-bookings" },
    { label: "Messages", icon: "💬", path: "/provider/messages" },
    { label: "Profile", icon: "👤", path: "/provider-profile" },
  ];

  const adminNavLinks = [
    { label: "Dashboard", icon: "📊", path: "/admin?section=dashboard" },
    { label: "Users", icon: "👥", path: "/admin?section=users" },
    { label: "Verifications", icon: "⏳", path: "/admin?section=verifications" },
    { label: "Bookings", icon: "📋", path: "/admin?section=bookings" },
  ];

  const navLinks = role === "provider" ? providerNavLinks : role === "admin" ? adminNavLinks : clientNavLinks;

  const displayName = isLoggedIn ? (user?.fullName || user?.username || firstName || "User") : "Guest";
  const firstNameOnly = isLoggedIn ? (user?.fullName?.split(" ")[0] || user?.username || firstName || "User") : "Guest";
  const userEmail = user?.email || "your@email.com";
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "G";
  const accountRoleLabel = authRole === "provider" ? "Provider" : authRole === "admin" ? "Admin" : "Client";
  const dashboardPath = authRole === "provider" ? "/provider-dashboard" : authRole === "admin" ? "/admin?section=dashboard" : "/dashboard";
  const profilePath = authRole === "provider" ? "/provider-profile" : "/profile";

  return (
    <header className="fixed inset-x-0 top-0 z-30 bg-white/80 backdrop-blur-md shadow-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex flex-none items-center gap-3">
          <Link to="/" className={`text-2xl font-extrabold tracking-tight ${logoColor}`}>
            <span className="text-black">Task</span>Panda
          </Link>
        </div>

        {showNav && (
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                to={link.path}
                aria-label={link.label === "Messages" && unreadMessageCount > 0 ? `Messages, ${unreadMessageCount} unread` : link.label}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  activeTab === link.label
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
                {link.label === "Messages" && unreadMessageCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-none text-white shadow-sm">
                    {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex flex-none items-center gap-6">
          {showNav && (
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="inline-flex items-center justify-center rounded-lg p-2 text-gray-600 lg:hidden hover:bg-gray-100"
              aria-label="Toggle navigation"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                {mobileOpen ? (
                  <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                ) : (
                  <path fillRule="evenodd" d="M3 6a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 6zm0 6a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75zm0 6a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                )}
              </svg>
            </button>
          )}
          {showNav && notifCount > 0 && (
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative inline-flex items-center justify-center rounded-lg p-2 text-gray-600 hover:bg-gray-100"
                aria-label="Notifications"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                  <path fillRule="evenodd" d="M12 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 006 15h12a1 1 0 00.707-1.707L18 11.586V8a6 6 0 00-6-6zM10 20a2 2 0 114 0a2 2 0 01-4 0z" clipRule="evenodd" />
                </svg>
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {notifCount}
                </span>
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl border border-gray-100 bg-white shadow-lg">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {role === "provider" ? (
                      <>
                        <Link to="/provider-bookings" onClick={() => setNotifOpen(false)} className="block px-4 py-3 hover:bg-gray-50 border-b border-gray-50">
                          <p className="text-sm text-gray-700">New request from <span className="font-semibold">Ana Reyes</span></p>
                          <p className="text-xs text-gray-400 mt-0.5">Leaking Pipe Fix — 2 min ago</p>
                        </Link>
                        <Link to="/provider-bookings" onClick={() => setNotifOpen(false)} className="block px-4 py-3 hover:bg-gray-50">
                          <p className="text-sm text-gray-700">New request from <span className="font-semibold">Carlos Magsaysay</span></p>
                          <p className="text-xs text-gray-400 mt-0.5">Bookshelf Assembly — 15 min ago</p>
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link to="/bookings" onClick={() => setNotifOpen(false)} className="block px-4 py-3 hover:bg-gray-50 border-b border-gray-50">
                          <p className="text-sm text-gray-700">Your booking <span className="font-semibold">Circuit Breaker Replacement</span> was confirmed</p>
                          <p className="text-xs text-gray-400 mt-0.5">2 hours ago</p>
                        </Link>
                        <Link to="/bookings" onClick={() => setNotifOpen(false)} className="block px-4 py-3 hover:bg-gray-50">
                          <p className="text-sm text-gray-700">Your booking <span className="font-semibold">Desktop Table Repair</span> is pending</p>
                          <p className="text-xs text-gray-400 mt-0.5">5 hours ago</p>
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {showNav && (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-3 text-sm"
              >
                <span className="hidden whitespace-nowrap text-gray-600 sm:inline">Good morning, {firstNameOnly}!</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-4 w-4 text-gray-400"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_22px_44px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                  <div className="border-b border-slate-200 bg-slate-50/90 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-slate-800 to-slate-600 text-sm font-semibold text-white shadow-sm">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                        <p className="truncate text-xs text-slate-500">{userEmail}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-2">
                    <div className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {accountRoleLabel} account
                    </div>

                    <nav className="space-y-1">
                      <Link
                        to={dashboardPath}
                        className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                          <MenuIcon className="h-4 w-4">
                            <path d="M3 11.5h7.5M3 6.5h18M3 16.5h12.5" />
                            <path d="M16.5 7.5V17l4.5-2.5-4.5-2.5Z" />
                          </MenuIcon>
                        </span>
                        Dashboard
                      </Link>
                      <Link
                        to={profilePath}
                        className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                          <MenuIcon className="h-4 w-4">
                            <path d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                            <path d="M4.5 19.5c1.5-3 4-4.5 7.5-4.5s6 1.5 7.5 4.5" />
                          </MenuIcon>
                        </span>
                        Profile
                      </Link>
                      <Link
                        to="/profile/edit"
                        className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                          <MenuIcon className="h-4 w-4">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .7 1.7 1.7 0 0 0-.2 1.04V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-.2-1.04 1.7 1.7 0 0 0-1-.7 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.7-1 1.7 1.7 0 0 0-1.04-.2H2.75a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.04-.2 1.7 1.7 0 0 0 .7-1A1.7 1.7 0 0 0 4.6 7.27l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.7 1.7 1.7 0 0 0 .2-1.04V2.75a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 .2 1.04 1.7 1.7 0 0 0 1 .7 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .7 1 1.7 1.7 0 0 0 1.04.2h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.04.2 1.7 1.7 0 0 0-.7 1Z" />
                          </MenuIcon>
                        </span>
                        Settings
                      </Link>
                    </nav>
                  </div>

                  <div className="border-t border-slate-200 bg-slate-50 px-3 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        logout();
                        navigate("/");
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                    >
                      <MenuIcon className="h-4 w-4">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <path d="M16 17l5-5-5-5" />
                        <path d="M21 12H9" />
                      </MenuIcon>
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {mobileOpen && showNav && (
        <div className="absolute inset-x-0 top-16 z-20 border-b border-gray-200 bg-white px-4 py-3 shadow-lg lg:hidden">
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                to={link.path}
                onClick={() => setMobileOpen(false)}
                aria-label={link.label === "Messages" && unreadMessageCount > 0 ? `Messages, ${unreadMessageCount} unread` : link.label}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  activeTab === link.label
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <span className="text-base">{link.icon}</span>
                <span>{link.label}</span>
                {link.label === "Messages" && unreadMessageCount > 0 && (
                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold leading-none text-white">
                    {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
