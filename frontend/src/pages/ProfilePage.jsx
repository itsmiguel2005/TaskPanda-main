import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const bookings = [
  {
    id: 1,
    status: "Pending Request",
    worker: "Johhny Cruz",
    cred: "TESDA NC II Carpenter",
    task: "Desktop Table Repair",
    date: "Sep 9, 2026",
    price: "P500",
  },
  {
    id: 2,
    status: "Confirmed",
    worker: "Maria Santos",
    cred: "TESDA NC II Electrician",
    task: "Circuit Breaker Replacement",
    date: "Sep 10, 2026",
    price: "P800",
  },
  {
    id: 3,
    status: "Completed",
    worker: "Ricky Padilla",
    cred: "Licensed Landscaper",
    task: "Front Yard Landscaping",
    date: "Sep 5, 2026",
    price: "P1,200",
  },
];

function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [changed, setChanged] = useState(false);

  const validate = () => {
    const e = {};
    if (!currentPassword) e.currentPassword = "Current password is required";
    if (!newPassword) e.newPassword = "New password is required";
    else if (newPassword.length < 8) e.newPassword = "Minimum 8 characters";
    if (!confirmPassword) e.confirmPassword = "Please confirm your password";
    else if (confirmPassword !== newPassword) e.confirmPassword = "Passwords do not match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setChanged(true);
    setTimeout(() => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setChanged(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="p-6">
          <h3 className="text-lg font-bold text-gray-900">Change Password</h3>
          <p className="mt-1 text-sm text-gray-500">Update your account password</p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                required
              />
              {errors.currentPassword && <p className="mt-1 text-xs text-red-500">{errors.currentPassword}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                required
              />
              {errors.newPassword && <p className="mt-1 text-xs text-red-500">{errors.newPassword}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                required
              />
              {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword}</p>}
            </div>
          </div>
          {changed && (
            <div className="mt-4 rounded-lg bg-green-50 p-3 text-center text-sm font-medium text-green-700">
              Password changed successfully
            </div>
          )}
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Update Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { isLoggedIn, role, isVerified, logout } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);

  const stats = useMemo(() => {
    const total = bookings.length;
    const completed = bookings.filter((b) => b.status === "Completed").length;
    const active = bookings.filter(
      (b) => b.status === "Pending Request" || b.status === "Confirmed"
    ).length;
    const cancelled = bookings.filter((b) => b.status === "Cancelled").length;
    const totalSpent = bookings.reduce((sum, b) => {
      const num = parseInt(b.price.replace(/[^0-9]/g, ""), 10);
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
    return { total, completed, active, cancelled, totalSpent };
  }, []);

  const roleLabel = role === "provider" ? "Service Provider" : role === "admin" ? "Administrator" : "Homeowner";
  const recentBookings = bookings.slice(0, 3);

  const handleSignOut = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-16 pb-12">
      <Header showNav activeTab="Profile" />

      <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8">
        {/* User Card */}
        <div className="rounded-2xl bg-white p-8 shadow-sm text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary-100 text-2xl font-bold text-primary-700 ring-4 ring-primary-50">
            M
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Miguel</h1>
          <p className="text-sm text-gray-500">{roleLabel}</p>
          <p className="mt-2 flex items-center justify-center gap-1 text-sm text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            Dagupan City, Pangasinan
          </p>
          <p className="mt-1 text-xs text-gray-400">Member since Jan 2025</p>
          <div className="mt-3">
            {isVerified ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Unverified
              </span>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <button
            onClick={() => navigate("/bookings")}
            className="rounded-xl bg-white p-4 text-center shadow-sm transition hover:shadow-md"
          >
            <p className="text-2xl">📋</p>
            <p className="mt-1 text-sm font-medium text-gray-700">Bookings</p>
            <p className="text-xs text-gray-400">{stats.active} active</p>
          </button>
          <button
            onClick={() => navigate("/messages")}
            className="rounded-xl bg-white p-4 text-center shadow-sm transition hover:shadow-md"
          >
            <p className="text-2xl">💬</p>
            <p className="mt-1 text-sm font-medium text-gray-700">Messages</p>
            <p className="text-xs text-gray-400">Chat</p>
          </button>
          <button
            onClick={() => navigate("/explore")}
            className="rounded-xl bg-white p-4 text-center shadow-sm transition hover:shadow-md"
          >
            <p className="text-2xl">🔍</p>
            <p className="mt-1 text-sm font-medium text-gray-700">Explore</p>
            <p className="text-xs text-gray-400">Find pros</p>
          </button>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="mt-0.5 text-xs text-gray-500">Total</p>
          </div>
          <div className="rounded-xl bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{stats.completed}</p>
            <p className="mt-0.5 text-xs text-gray-500">Completed</p>
          </div>
          <div className="rounded-xl bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
            <p className="mt-0.5 text-xs text-gray-500">Active</p>
          </div>
        </div>

        {/* Recent Bookings */}
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Recent Bookings</h2>
            <button
              onClick={() => navigate("/bookings")}
              className="text-xs font-medium text-primary-600 hover:text-primary-800"
            >
              View All &gt;
            </button>
          </div>
          <div className="space-y-2">
            {recentBookings.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">{b.task}</p>
                  <p className="text-xs text-gray-500">{b.worker} · {b.date}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-gray-900">{b.price}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div className="mt-6 rounded-2xl bg-white shadow-sm">
          <button
            onClick={() => navigate("/profile/edit")}
            className="flex w-full items-center justify-between px-5 py-4 border-b border-gray-100 transition hover:bg-gray-50"
          >
            <span className="text-sm font-medium text-gray-700">Edit Profile</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-400">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </button>
          {!isVerified && (
            <button
              onClick={() => navigate("/profile/verify")}
              className="flex w-full items-center justify-between px-5 py-4 border-b border-gray-100 transition hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-amber-600">Verify Identity</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-amber-400">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowChangePassword(true)}
            className="flex w-full items-center justify-between px-5 py-4 border-b border-gray-100 transition hover:bg-gray-50"
          >
            <span className="text-sm font-medium text-gray-700">Change Password</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-400">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </button>
          {isLoggedIn && (
            <button
              onClick={handleSignOut}
              className="flex w-full items-center justify-between px-5 py-4 transition hover:bg-red-50"
            >
              <span className="text-sm font-medium text-red-600">Sign Out</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-red-400">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
