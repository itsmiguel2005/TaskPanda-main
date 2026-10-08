import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import ProfileSetupPanel from "../components/ProfileSetupPanel.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function ProfileSetting({ label, description, onClick, last = false, tone = "default" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`dashboard-focus flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50 focus-visible:relative ${last ? "" : "border-b border-slate-100"}`}
    >
      <span className="min-w-0">
        <span className={`block text-sm font-semibold ${tone === "danger" ? "text-red-700" : "text-slate-800"}`}>{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-5 text-slate-600">{description}</span>}
      </span>
      <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-slate-400">
        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
      </svg>
    </button>
  );
}

function StatusPill({ verified, status }) {
  const state = verified
    ? { label: "Identity verified", color: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-600" }
    : status === "rejected"
      ? { label: "Verification rejected", color: "bg-rose-50 text-rose-800", dot: "bg-rose-600" }
      : status === "pending"
        ? { label: "Verification pending", color: "bg-amber-50 text-amber-800", dot: "bg-amber-600" }
        : { label: "Verification needed", color: "bg-amber-50 text-amber-800", dot: "bg-amber-600" };

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${state.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} />
      {state.label}
    </span>
  );
}

export default function ProviderProfilePage() {
  const { isVerified, user, logout, refreshProfile, refreshVerificationStatus } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshVerificationStatus();
    };
    refreshWhenVisible();
    const intervalId = window.setInterval(refreshWhenVisible, 10_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshVerificationStatus]);

  const fullName = user?.fullName || [user?.firstName, user?.middleName, user?.lastName].filter(Boolean).join(" ") || user?.username || user?.email || "Provider";
  const location = user?.address || [user?.barangay, user?.city, user?.province].filter(Boolean).join(", ");
  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "Not available";
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const rating = Number(user?.averageRating ?? 0);
  const totalReviews = Number(user?.totalReviews ?? 0);
  const verificationStatus = user?.verificationStatus || "unverified";
  const approvedTesdaCertificates = (user?.tesdaCertificates || [])
    .filter((certificate) => String(certificate.status || "").toLowerCase() === "approved");

  const handleSignOut = () => {
    logout();
    navigate("/");
  };

  return (
    <div>
      <Header showNav activeTab="Profile" role="provider" />
      <main className="dashboard-page">
        <div className="dashboard-shell">
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Your professional profile</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Make your services, experience, and trust signals easy for local clients to understand.</p>
            </div>
            <button type="button" onClick={() => navigate("/profile/edit")} className="dashboard-primary-button dashboard-focus inline-flex items-center justify-center px-4 py-2.5 text-sm">
              Edit profile
            </button>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <aside className="space-y-5 lg:col-span-1">
              <section className="dashboard-panel p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className={`avatar-shell h-16 w-16 border-4 border-blue-50 text-xl font-bold ${user?.profileImage ? "bg-transparent" : "bg-blue-100 text-blue-800"}`}>
                    {user?.profileImage ? <img src={user.profileImage} alt={`${fullName} profile`} className="avatar-image" /> : initials || "?"}
                  </div>
                  <div className="min-w-0 pt-1">
                    <h2 className="wrap-break-word text-lg font-bold leading-6 text-slate-950">{fullName}</h2>
                    <p className="mt-1 text-sm text-slate-600">Service provider{user?.username ? ` · @${user.username}` : ""}</p>
                    <div className="mt-2">
                      <StatusPill verified={isVerified} status={verificationStatus} />
                    </div>
                    {approvedTesdaCertificates.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {approvedTesdaCertificates.map((certificate) => (
                          <span
                            key={certificate.id}
                            className="inline-flex max-w-full items-center gap-1 rounded border border-green-200 bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-800"
                          >
                            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3 w-3 shrink-0">
                              <path fillRule="evenodd" d="M10 1.667a2.5 2.5 0 0 1 2.357 1.666h1.81a2.5 2.5 0 0 1 2.5 2.5v1.81a2.5 2.5 0 0 1 0 4.714v1.81a2.5 2.5 0 0 1-2.5 2.5h-1.81a2.5 2.5 0 0 1-4.714 0h-1.81a2.5 2.5 0 0 1-2.5-2.5v-1.81a2.5 2.5 0 0 1 0-4.714v-1.81a2.5 2.5 0 0 1 2.5-2.5h1.81A2.5 2.5 0 0 1 10 1.667Zm3.09 6.75a.75.75 0 0 0-1.18-.92l-2.74 3.52-1.08-1.08a.75.75 0 0 0-1.06 1.06l1.68 1.68a.75.75 0 0 0 1.12-.07l3.26-4.19Z" clipRule="evenodd" />
                            </svg>
                            <span className="truncate">TESDA · {certificate.trade}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {location && <p className="mt-3 text-xs leading-5 text-slate-600">{location}</p>}
                {!isVerified && verificationStatus === "rejected" && user?.verificationRejectionReason && (
                  <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50/80 px-3.5 py-3 text-sm leading-6 text-rose-900">
                    <span className="font-bold">Review feedback: </span>
                    {user.verificationRejectionReason}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-600">Member since</p>
                  <p className="text-right text-xs font-semibold text-slate-900">{memberSince}</p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-amber-600" aria-hidden="true">
                      <path d="m10 1.5 2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.11l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.5Z" />
                    </svg>
                    {totalReviews > 0 ? `${Number.isFinite(rating) ? rating.toFixed(1) : "0.0"} / 5` : "New to TaskPanda"}
                  </span>
                  {totalReviews > 0 && <span className="text-xs text-slate-600">{totalReviews} {totalReviews === 1 ? "review" : "reviews"}</span>}
                </div>
                <ProfileSetupPanel user={user} role="provider" verified={isVerified} onEdit={() => navigate("/profile/edit")} />
              </section>

              <section className="dashboard-panel">
                <div className="dashboard-panel-heading">
                  <h2 className="text-base font-bold text-slate-950">Your shortcuts</h2>
                  <p className="mt-1 text-sm text-slate-600">Pick up where you left off.</p>
                </div>
                <div className="grid grid-cols-2 divide-x divide-slate-100">
                  <button type="button" onClick={() => navigate("/provider-bookings")} className="dashboard-focus rounded-bl-[1.25rem] p-4 text-left transition hover:bg-slate-50">
                    <span className="block text-sm font-bold text-slate-950">Bookings</span>
                    <span className="mt-1 block text-xs font-semibold text-slate-600">Manage requests</span>
                  </button>
                  <button type="button" onClick={() => navigate("/provider/messages")} className="dashboard-focus rounded-br-[1.25rem] p-4 text-left transition hover:bg-slate-50">
                    <span className="block text-sm font-bold text-slate-950">Messages</span>
                    <span className="mt-1 block text-xs font-semibold text-slate-600">Chat with clients</span>
                  </button>
                </div>
              </section>
            </aside>

            <div className="space-y-5 lg:col-span-2">
            <section className="dashboard-panel">
              <div className="dashboard-panel-heading flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Services & experience</h2>
                  <p className="mt-1 text-sm text-slate-600">What you do and where you work.</p>
                </div>
                <button type="button" onClick={() => navigate("/profile/edit")} className="dashboard-focus rounded-lg px-2 py-1 text-sm font-semibold text-blue-700 transition hover:text-blue-900 focus-visible:outline-blue-600">Edit</button>
              </div>
              <div className="space-y-5 p-5 sm:p-6">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Trades & services</h3>
                  {user?.professions?.length ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {user.professions.map((profession) => (
                        <li key={profession} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-900">{profession}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">Add your services so nearby clients can find the right help.</p>
                  )}
                </div>
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Service area</h3>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{location || "Add your service location"}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Your private map pin helps match you with nearby service requests.</p>
                </div>
                {user?.bio && (
                  <div className="border-t border-slate-100 pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">About your work</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{user.bio}</p>
                  </div>
                )}
              </div>
            </section>

            <section className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <h2 className="text-base font-bold text-slate-950">Verification & credentials</h2>
                <p className="mt-1 text-sm text-slate-600">Build client confidence with verified account details.</p>
              </div>
              <div className="p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${isVerified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {isVerified ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                        <path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                        <path d="M10 6v4m0 3h.01M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{isVerified ? "Identity verification complete" : "Verify your identity"}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {isVerified
                        ? "Your identity has been verified. Submit TESDA certificates separately for review from this section."
                        : "Submit a valid photo ID to verify the identity on your provider account."}
                    </p>
                  </div>
                </div>
                {!isVerified && (
                  <button type="button" onClick={() => navigate("/provider-profile/verify")} className="dashboard-secondary-button dashboard-focus mt-5 w-full px-4 py-2.5 text-sm sm:w-auto">
                    Start verification
                  </button>
                )}
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <h3 className="text-sm font-semibold text-slate-900">TESDA certification</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Submit certificates for a separate review at any time after your identity is verified.
                  </p>
                  {(user?.tesdaCertificates || []).length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {user.tesdaCertificates.map((certificate) => (
                        <li key={certificate.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-3">
                          <span className="text-sm font-semibold text-slate-800">{certificate.trade}</span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            certificate.status === "approved"
                              ? "bg-emerald-50 text-emerald-800"
                              : certificate.status === "rejected"
                                ? "bg-rose-50 text-rose-800"
                                : "bg-amber-50 text-amber-900"
                          }`}>
                            {certificate.status === "approved" ? "Verified" : certificate.status === "rejected" ? "Update requested" : "Pending review"}
                          </span>
                          {certificate.rejectionReason && (
                            <p className="basis-full text-xs leading-5 text-rose-800">Review feedback: {certificate.rejectionReason}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {isVerified ? (
                    <button
                      type="button"
                      onClick={() => navigate("/profile/tesda")}
                      className="dashboard-secondary-button dashboard-focus mt-4 w-full px-4 py-2.5 text-sm sm:w-auto"
                    >
                      Submit TESDA certificate
                    </button>
                  ) : (
                    <p className="mt-3 text-xs font-medium text-slate-600">Verify your identity first to submit a certificate.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <h2 className="text-base font-bold text-slate-950">Pricing & travel</h2>
                <p className="mt-1 text-sm text-slate-600">Know how the booking total is put together.</p>
              </div>
              <div className="p-5 sm:p-6">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Set your service offer per request</p>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">Task pricing is agreed for each booking. Travel fare is calculated from the client-to-provider distance: the ₱20 base fare covers the first 2 km, then the configured per-kilometer rate applies to any remaining distance.</p>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">The travel estimate is shown to clients when they request a booking; it is not a profile-wide rate setting.</p>
              </div>
            </section>

            <section className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <h2 className="text-base font-bold text-slate-950">Availability</h2>
                <p className="mt-1 text-sm text-slate-600">Booking times are checked against your schedule.</p>
              </div>
              <div className="p-5 sm:p-6">
                <p className="text-sm leading-6 text-slate-700">Clients can request open time slots. Active and pending bookings automatically block the same date and time from being booked again.</p>
                <button type="button" onClick={() => navigate("/provider-bookings")} className="dashboard-focus mt-4 inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-blue-700 transition hover:text-blue-900 focus-visible:outline-blue-600">
                  Review your bookings
                  <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.69L10.22 5.03a.75.75 0 1 1 1.06-1.06l5.5 5.5a.75.75 0 0 1 0 1.06l-5.5 5.5a.75.75 0 1 1-1.06-1.06l4.22-4.22H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </section>

            <section className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <h2 className="text-base font-bold text-slate-950">Contact details</h2>
                <p className="mt-1 text-sm text-slate-600">Your account contact information.</p>
              </div>
              <dl className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
                <div className="min-w-0">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email</dt>
                  <dd className="mt-1 break-all text-sm font-medium text-slate-900">{user?.email || "Not provided"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Mobile</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">{user?.mobileNumber || "Not provided"}</dd>
                </div>
              </dl>
            </section>

            <section className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <h2 className="text-base font-bold text-slate-950">Account settings</h2>
                <p className="mt-1 text-sm text-slate-600">Manage your provider profile and account access.</p>
              </div>
              <ProfileSetting label="Edit professional profile" description="Update your services, bio, contact information, or service area." onClick={() => navigate("/profile/edit")} />
              {!isVerified && <ProfileSetting label="Verify identity" description="Submit your ID for identity review." onClick={() => navigate("/provider-profile/verify")} />}
              {isVerified && <ProfileSetting label="Submit TESDA certificate" description="Add or update a TESDA trade credential for separate review." onClick={() => navigate("/profile/tesda")} />}
              <ProfileSetting label="Provider bookings" description="View requests and manage your schedule." onClick={() => navigate("/provider-bookings")} />
              <ProfileSetting label="Messages" description="Continue conversations with clients." onClick={() => navigate("/provider-messages")} />
              <ProfileSetting label="Sign out" description="Sign out of this device." onClick={handleSignOut} last tone="danger" />
            </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
