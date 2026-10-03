import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import ProfileSetupPanel from "../components/ProfileSetupPanel.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useBookings } from "../context/BookingContext.jsx";

function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [changed, setChanged] = useState(false);

  const validate = () => {
    const nextErrors = {};
    if (!currentPassword) nextErrors.currentPassword = "Current password is required";
    if (!newPassword) nextErrors.newPassword = "New password is required";
    else if (newPassword.length < 8) nextErrors.newPassword = "Minimum 8 characters";
    if (!confirmPassword) nextErrors.confirmPassword = "Please confirm your password";
    else if (confirmPassword !== newPassword) nextErrors.confirmPassword = "Passwords do not match";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <form onSubmit={handleSubmit} className="p-6">
          <h3 className="text-lg font-bold text-slate-900">Change password</h3>
          <p className="mt-1 text-sm text-slate-600">Choose a strong password you have not used before.</p>
          <div className="mt-5 space-y-4">
            {[
              ["currentPassword", "Current password", currentPassword, setCurrentPassword],
              ["newPassword", "New password", newPassword, setNewPassword],
              ["confirmPassword", "Confirm new password", confirmPassword, setConfirmPassword],
            ].map(([name, label, value, setter]) => (
              <div key={name}>
                <label htmlFor={name} className="block text-sm font-semibold text-slate-700">{label}</label>
                <input
                  id={name}
                  type="password"
                  value={value}
                  onChange={(event) => setter(event.target.value)}
                  autoComplete={name === "currentPassword" ? "current-password" : "new-password"}
                  className="dashboard-focus mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  required
                />
                {errors[name] && <p className="mt-1 text-xs text-red-600">{errors[name]}</p>}
              </div>
            ))}
          </div>
          {changed && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-800">Password changed successfully.</p>}
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={onClose} className="dashboard-secondary-button flex-1 px-4 py-2.5 text-sm">Cancel</button>
            <button type="submit" className="dashboard-primary-button flex-1 px-4 py-2.5 text-sm">Update password</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfileSetting({ label, description, onClick, tone = "default", last = false }) {
  const textTone = tone === "danger" ? "text-red-700" : "text-slate-800";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`dashboard-focus flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50 focus-visible:relative ${last ? "" : "border-b border-slate-100"}`}
    >
      <span className="min-w-0">
        <span className={`block text-sm font-semibold ${textTone}`}>{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-5 text-slate-600">{description}</span>}
      </span>
      <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-slate-400">
        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
      </svg>
    </button>
  );
}

function formatRewardAmount(amount) {
  return `₱${Number(amount || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

function BambooStamp({ filled }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={`h-6 w-6 ${filled ? "text-emerald-800" : "text-slate-300"}`}>
      <path d="M16 26c0-6.5.2-12.5 0-19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 17c-5.8.2-9.2-2.8-9.1-7.8 5.4-.2 8.6 2.5 9.1 7.8Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M16 12c.3-4.5 3.2-7 8-6.8.1 4.7-2.7 7-8 6.8Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      {filled && <path d="M13 15 9 11m8-2 4-3" stroke="white" strokeOpacity=".78" strokeWidth="1" strokeLinecap="round" />}
    </svg>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { isLoggedIn, role, isVerified, logout, user, token, updateUser, refreshProfile } = useAuth();
  const { bookings } = useBookings();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [referralCodeCopied, setReferralCodeCopied] = useState(false);
  const [referralCopyError, setReferralCopyError] = useState("");
  const [referralCodeError, setReferralCodeError] = useState("");
  const [loadingReferralCode, setLoadingReferralCode] = useState(false);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const loadReferralCode = useCallback(async () => {
    if (!token) return;
    setLoadingReferralCode(true);
    setReferralCodeError("");
    try {
      const response = await fetch("/api/rewards", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load your referral code.");
      if (!data.referralCode) throw new Error("Your account does not have a referral code yet.");
      updateUser({ referralCode: data.referralCode });
    } catch (error) {
      setReferralCodeError(error.message || "Could not load your referral code.");
    } finally {
      setLoadingReferralCode(false);
    }
  }, [token, updateUser]);

  useEffect(() => {
    if (role === "client" && !user?.referralCode) void loadReferralCode();
  }, [loadReferralCode, role, user?.referralCode]);

  const roleLabel = role === "provider" ? "Service provider" : role === "admin" ? "Administrator" : "Homeowner";
  const fullName = user?.fullName || [user?.firstName, user?.middleName, user?.lastName].filter(Boolean).join(" ") || user?.username || user?.email || "Client";
  const location = user?.address || [user?.barangay, user?.city, user?.province].filter(Boolean).join(", ");
  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "Not available";
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const recentBookings = Array.isArray(bookings) ? bookings.slice(0, 3) : [];
  const stampProgress = Math.max(0, Math.min(5, Number(user?.stampProgress) || 0));
  const walletVouchers = [...(user?.vouchers || [])].sort((left, right) =>
    new Date(right.awardedAt || 0) - new Date(left.awardedAt || 0)
  );
  const activeVouchers = walletVouchers.filter((voucher) =>
    voucher.status === "active" && (!voucher.expiresAt || new Date(voucher.expiresAt) > new Date())
  );

  const copyReferralCode = async () => {
    if (!user?.referralCode || !navigator.clipboard?.writeText) {
      setReferralCopyError("Copying is unavailable in this browser. Select the code to copy it.");
      return;
    }
    try {
      await navigator.clipboard.writeText(user.referralCode);
      setReferralCodeCopied(true);
      setReferralCopyError("");
      window.setTimeout(() => setReferralCodeCopied(false), 2200);
    } catch {
      setReferralCopyError("We couldn't copy the code. Select it and copy it manually.");
    }
  };

  const handleSignOut = () => {
    logout();
    navigate("/");
  };

  return (
    <div>
      <Header showNav activeTab="Profile" />
      <main className="dashboard-page">
        <div className="dashboard-shell">
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Your profile</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Keep your details current and find your bookings, messages, and account settings in one place.</p>
            </div>
            <button type="button" onClick={() => navigate("/profile/edit")} className="dashboard-primary-button dashboard-focus inline-flex items-center justify-center px-4 py-2.5 text-sm">
              Edit profile
            </button>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <aside className="space-y-5 lg:col-span-1">
              <section className="dashboard-panel p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className={`avatar-shell h-16 w-16 border-4 border-sky-50 text-xl font-bold ${user?.profileImage ? "bg-transparent" : "bg-sky-100 text-sky-800"}`}>
                    {user?.profileImage ? <img src={user.profileImage} alt={`${fullName} profile`} className="avatar-image" /> : initials || "?"}
                  </div>
                  <div className="min-w-0 pt-1">
                    <h2 className="break-words text-lg font-bold leading-6 text-slate-950">{fullName}</h2>
                    <p className="mt-1 text-sm text-slate-600">{roleLabel}</p>
                    <span className={`mt-2 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${isVerified ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${isVerified ? "bg-emerald-600" : "bg-amber-600"}`} />
                      {isVerified ? "Identity verified" : "Verification pending"}
                    </span>
                  </div>
                </div>
                <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-600">Member since</dt>
                    <dd className="text-right font-medium text-slate-900">{memberSince}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-600">Username</dt>
                    <dd className="break-all text-right font-medium text-slate-900">{user?.username ? `@${user.username}` : "Not set"}</dd>
                  </div>
                </dl>
                <ProfileSetupPanel user={user} role="client" onEdit={() => navigate("/profile/edit")} />
              </section>

              <section className="dashboard-panel">
                <div className="dashboard-panel-heading">
                  <h2 className="text-base font-bold text-slate-950">Your shortcuts</h2>
                  <p className="mt-1 text-sm text-slate-600">Pick up where you left off.</p>
                </div>
                <div className="grid grid-cols-2 divide-x divide-slate-100">
                  <button type="button" onClick={() => navigate("/bookings")} className="dashboard-focus rounded-bl-[1.25rem] p-4 text-left transition hover:bg-slate-50">
                    <span className="block text-xl font-bold tabular-nums text-slate-950">{Array.isArray(bookings) ? bookings.length : 0}</span>
                    <span className="mt-1 block text-xs font-semibold text-slate-600">Bookings</span>
                  </button>
                  <button type="button" onClick={() => navigate("/messages")} className="dashboard-focus rounded-br-[1.25rem] p-4 text-left transition hover:bg-slate-50">
                    <span className="block text-sm font-bold text-slate-950">Messages</span>
                    <span className="mt-1 block text-xs font-semibold text-slate-600">Chat with your pros</span>
                  </button>
                </div>
              </section>
            </aside>

            <div className="space-y-5 lg:col-span-2">
              <section id="rewards" className="dashboard-panel scroll-mt-24">
                <div className="dashboard-panel-heading flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">Vouchers &amp; rewards</h2>
                    <p className="mt-1 text-sm text-slate-600">Small thank-yous, ready for your next trip.</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                    {activeVouchers.length} available
                  </span>
                </div>
                <div className="grid lg:grid-cols-2">
                  <div className="p-5 sm:p-6">
                    <h3 className="text-sm font-bold text-slate-900">Your bamboo stamp card</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600">One stamp for every booking you complete and settle. Five stamps earn ₱50 off a future travel fee.</p>
                    <div className="mt-5 grid grid-cols-5 gap-2" aria-label={`${stampProgress} of 5 stamps collected`}>
                      {Array.from({ length: 5 }, (_, index) => {
                        const filled = index < stampProgress;
                        return (
                          <div key={index} className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl ${filled ? "bg-emerald-50" : "bg-slate-50"}`}>
                            <BambooStamp filled={filled} />
                            <span className={`text-[10px] font-semibold ${filled ? "text-emerald-800" : "text-slate-500"}`}>{filled ? "Collected" : "Stamp"}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-xs font-semibold tabular-nums text-slate-600">
                      {stampProgress === 5 ? "5 of 5 stamps · your next booking starts a new card" : `${stampProgress} of 5 stamps · ${5 - stampProgress} to your next voucher`}
                    </p>
                    <div className="mt-6 border-t border-slate-100 pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">Give a friend ₱50</h3>
                          <p className="mt-1 text-xs leading-5 text-slate-600">They get a travel-fee voucher; you get one too.</p>
                        </div>
                        <button
                          type="button"
                          onClick={copyReferralCode}
                          disabled={!user?.referralCode}
                          className="dashboard-secondary-button dashboard-focus px-3 py-2 text-xs disabled:cursor-wait disabled:opacity-60"
                        >
                          {referralCodeCopied ? "Copied" : "Copy code"}
                        </button>
                      </div>
                      <p className="mt-2 break-all rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold tracking-[0.12em] text-slate-900" aria-label="Your referral code">
                        {user?.referralCode || (loadingReferralCode ? "Loading your code…" : "Your code is not available yet.")}
                      </p>
                      {referralCodeError && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-800" role="alert">
                          <span>{referralCodeError}</span>
                          <button type="button" onClick={loadReferralCode} disabled={loadingReferralCode} className="font-semibold underline underline-offset-2 disabled:opacity-60">
                            {loadingReferralCode ? "Retrying…" : "Try again"}
                          </button>
                        </div>
                      )}
                      {referralCopyError && <p className="mt-1 text-xs text-amber-800" role="status">{referralCopyError}</p>}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 p-5 sm:p-6 lg:border-l lg:border-t-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-sm font-bold text-slate-900">Travel-fee wallet</h3>
                      <span className="text-xs font-medium tabular-nums text-slate-500">{activeVouchers.length} ready to use</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">Choose a voucher in the booking summary. It can only reduce the distance-based travel fee.</p>
                    {activeVouchers.length ? (
                      <ul className="mt-4 divide-y divide-slate-100">
                        {activeVouchers.map((voucher) => (
                          <li key={voucher.id} className="flex items-center justify-between gap-4 py-3 first:pt-0">
                            <span className="flex min-w-0 items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-800" aria-hidden="true">
                                <BambooStamp filled />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-slate-900">{voucher.title}</span>
                                <span className="mt-0.5 block text-xs text-slate-500">{voucher.kind === "milestone" ? "Stamp card reward" : "Referral reward"}</span>
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-800">{formatRewardAmount(voucher.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-4 rounded-xl bg-slate-50 px-4 py-5 text-center text-sm leading-6 text-slate-600">
                        No vouchers just yet. Invite a friend or collect five stamps to earn your next travel-fee reward.
                      </p>
                    )}
                    {walletVouchers.some((voucher) => voucher.status === "redeemed") && (
                      <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                        {walletVouchers.filter((voucher) => voucher.status === "redeemed").length} voucher{walletVouchers.filter((voucher) => voucher.status === "redeemed").length === 1 ? "" : "s"} redeemed
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="dashboard-panel">
                <div className="dashboard-panel-heading flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">Contact details</h2>
                    <p className="mt-1 text-sm text-slate-600">The details providers use to stay in touch.</p>
                  </div>
                  <button type="button" onClick={() => navigate("/profile/edit")} className="dashboard-focus rounded-lg px-2 py-1 text-sm font-semibold text-blue-700 transition hover:text-blue-900 focus-visible:outline-blue-600">Update details</button>
                </div>
                <dl className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2 sm:p-6">
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email address</dt>
                    <dd className="mt-1 break-all text-sm font-medium text-slate-900">{user?.email || "Not provided"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Mobile number</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-900">{user?.mobileNumber || "Not provided"}</dd>
                  </div>
                </dl>
              </section>

              <section className="dashboard-panel">
                <div className="dashboard-panel-heading flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">Home address</h2>
                    <p className="mt-1 text-sm text-slate-600">Your saved service location for nearby matches.</p>
                  </div>
                  <button type="button" onClick={() => navigate("/profile/edit")} className="dashboard-secondary-button dashboard-focus px-3 py-2 text-xs">Manage address</button>
                </div>
                <div className="p-5 sm:p-6">
                  <p className="text-sm font-semibold text-slate-900">{location || "Add your barangay, city, and province"}</p>
                  <p className="mt-1.5 text-xs leading-5 text-slate-600">Your precise map pin is kept private and used only to match you with nearby providers.</p>
                </div>
              </section>

              <section className="dashboard-panel">
                <div className="dashboard-panel-heading">
                  <h2 className="text-base font-bold text-slate-950">Payment method</h2>
                  <p className="mt-1 text-sm text-slate-600">Payment is confirmed with each service booking.</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-xs font-extrabold text-slate-700">₱</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Cash for service bookings</p>
                      <p className="mt-0.5 text-xs text-slate-600">The available payment method in TaskPanda.</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Available</span>
                </div>
              </section>

              <section className="dashboard-panel">
                <div className="dashboard-panel-heading flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">Recent bookings</h2>
                    <p className="mt-1 text-sm text-slate-600">Your latest service requests.</p>
                  </div>
                  <button type="button" onClick={() => navigate("/bookings")} className="dashboard-focus rounded-lg px-2 py-1 text-sm font-semibold text-blue-700 transition hover:text-blue-900 focus-visible:outline-blue-600">View all</button>
                </div>
                <div className="p-4 sm:p-5">
                  {recentBookings.length ? (
                    <ul className="divide-y divide-slate-100">
                      {recentBookings.map((booking) => (
                        <li key={booking.id}>
                          <button type="button" onClick={() => navigate("/bookings")} className="dashboard-focus flex w-full items-center justify-between gap-4 rounded-lg py-3 text-left transition hover:bg-slate-50">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-900">{booking.task || booking.description || "Service request"}</span>
                              <span className="mt-1 block text-xs text-slate-600">{booking.worker || booking.providerName || "Provider"}</span>
                            </span>
                            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{booking.status || "Pending"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-600">Your booking history will appear here.</p>
                  )}
                </div>
              </section>

              <section className="dashboard-panel">
                <div className="dashboard-panel-heading">
                  <h2 className="text-base font-bold text-slate-950">Account settings</h2>
                  <p className="mt-1 text-sm text-slate-600">Keep your account secure and up to date.</p>
                </div>
                <ProfileSetting label="Edit personal details" description="Update your name, phone, location, and profile photo." onClick={() => navigate("/profile/edit")} />
                {!isVerified && <ProfileSetting label="Verify your identity" description="Submit an ID to complete account verification." onClick={() => navigate("/profile/verify")} />}
                <ProfileSetting label="Change password" description="Choose a new password for your account." onClick={() => setShowChangePassword(true)} />
                {isLoggedIn && <ProfileSetting label="Sign out" description="Sign out of this device." onClick={handleSignOut} tone="danger" last />}
              </section>
            </div>
          </div>
        </div>
      </main>
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
