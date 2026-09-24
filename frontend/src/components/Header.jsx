import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Header({ logoColor = "text-primary-700", showNav = false, activeTab = "Home", role = "client", notifCount = 2 }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, role: authRole, firstName } = useAuth();
  const notifRef = useRef(null);

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
    { label: "Messages", icon: "💬", path: "/messages" },
    { label: "Profile", icon: "👤", path: "/profile" },
  ];

  const providerNavLinks = [
    { label: "Home", icon: "🏠", path: "/provider-dashboard" },
    { label: "Bookings", icon: "📋", path: "/provider-bookings" },
    { label: "Messages", icon: "💬", path: "/provider-messages" },
    { label: "Profile", icon: "👤", path: "/provider-profile" },
  ];

  const adminNavLinks = [
    { label: "Dashboard", icon: "📊", path: "/admin?section=dashboard" },
    { label: "Users", icon: "👥", path: "/admin?section=users" },
    { label: "Verifications", icon: "⏳", path: "/admin?section=verifications" },
    { label: "Bookings", icon: "📋", path: "/admin?section=bookings" },
  ];

  const navLinks = role === "provider" ? providerNavLinks : role === "admin" ? adminNavLinks : clientNavLinks;

  const displayName = isLoggedIn ? "Miguel" : "Guest";

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
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  activeTab === link.label
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
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
                <span className="hidden whitespace-nowrap text-gray-600 sm:inline">Good morning, {displayName}!</span>
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
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                  {role === "provider" ? (
                    <Link to="/provider-dashboard" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setDropdownOpen(false)}>
                      Dashboard
                    </Link>
                  ) : role === "admin" ? (
                    <Link to="/admin" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setDropdownOpen(false)}>
                      Dashboard
                    </Link>
                  ) : (
                    <Link to="/dashboard" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setDropdownOpen(false)}>
                      Dashboard
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      navigate("/");
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Sign Out
                  </button>
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
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  activeTab === link.label
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <span className="text-base">{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
