import Header from "../components/Header.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function ProviderProfilePage() {
  const { isVerified, user, logout, refreshProfile } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const fullName = user?.fullName || [user?.firstName, user?.middleName, user?.lastName].filter(Boolean).join(" ") || user?.username || user?.email || "Provider";
  const location = user?.address || [user?.barangay, user?.city, user?.province].filter(Boolean).join(", ");
  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "Not available";
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  const handleSignOut = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-16 pb-12">
      <Header showNav activeTab="Profile" role="provider" />

      <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8">
        {/* User Card */}
        <div className="rounded-2xl bg-white p-8 shadow-sm text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-100 text-2xl font-bold text-accent-700 ring-4 ring-accent-50">
            {initials || "?"}
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">{fullName}</h1>
          <p className="text-sm text-gray-500">Service Provider</p>
          {location && <p className="mt-2 text-sm text-gray-500">{location}</p>}
          <p className="mt-1 text-xs text-gray-400">Member since {memberSince}</p>
          <div className="mt-3">
            {isVerified ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                Unverified
              </span>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">Services</h2>
          {user?.professions?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {user.professions.map((profession) => (
                <span key={profession} className="rounded-full bg-accent-50 px-3 py-1 text-sm font-medium text-accent-700">{profession}</span>
              ))}
            </div>
          ) : <p className="mt-2 text-sm text-gray-500">Add the services you offer to your profile.</p>}
          {user?.bio && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-600">{user.bio}</p>}
        </div>

        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">Contact details</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Email</dt><dd className="break-all text-right text-gray-800">{user?.email || "Not provided"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Phone</dt><dd className="text-right text-gray-800">{user?.mobileNumber || "Not provided"}</dd></div>
          </dl>
        </div>

        {/* Settings */}
        <div className="mt-6 rounded-2xl bg-white shadow-sm">
          <button type="button" onClick={() => navigate("/profile/edit")} className="flex w-full items-center justify-between px-5 py-4 border-b border-gray-100 transition hover:bg-gray-50">
            <span className="text-sm font-medium text-gray-700">Edit Profile</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-400">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </button>
          {!isVerified && (
            <button type="button" onClick={() => navigate("/profile/verify")} className="flex w-full items-center justify-between px-5 py-4 border-b border-gray-100 transition hover:bg-gray-50">
              <span className="text-sm font-medium text-amber-600">Verify Identity</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-amber-400">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <button type="button" onClick={handleSignOut} className="flex w-full items-center justify-between px-5 py-4 transition hover:bg-red-50">
            <span className="text-sm font-medium text-gray-700">Sign Out</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-400">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
