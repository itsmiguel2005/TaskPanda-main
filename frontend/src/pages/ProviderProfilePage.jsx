import Header from "../components/Header.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useState } from "react";

export default function ProviderProfilePage() {
  const { isVerified } = useAuth();
  const [profession, setProfession] = useState("TESDA NC II Carpenter");
  return (
    <div className="min-h-screen bg-gray-50 pt-16 pb-12">
      <Header showNav activeTab="Profile" role="provider" />

      <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8">
        {/* User Card */}
        <div className="rounded-2xl bg-white p-8 shadow-sm text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-100 text-2xl font-bold text-accent-700 ring-4 ring-accent-50">
            JC
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Johhny Cruz</h1>
          <p className="text-sm text-gray-500">{profession}</p>
          <p className="mt-2 flex items-center justify-center gap-1 text-sm text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            Dagupan City, Pangasinan
          </p>
          <p className="mt-1 text-xs text-gray-400">Member since Mar 2024</p>
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

        {/* Stats */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">4.9</p>
            <p className="mt-0.5 text-xs text-gray-500">Rating</p>
          </div>
          <div className="rounded-xl bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">2</p>
            <p className="mt-0.5 text-xs text-gray-500">Active</p>
          </div>
          <div className="rounded-xl bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">47</p>
            <p className="mt-0.5 text-xs text-gray-500">Completed</p>
          </div>
        </div>

        {/* Settings */}
        <div className="mt-6 rounded-2xl bg-white shadow-sm">
          <a href="/profile/edit" className="flex items-center justify-between px-5 py-4 border-b border-gray-100 transition hover:bg-gray-50">
            <span className="text-sm font-medium text-gray-700">Edit Profile</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-400">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </a>
          {!isVerified && (
            <a href="/profile/verify" className="flex items-center justify-between px-5 py-4 border-b border-gray-100 transition hover:bg-gray-50">
              <span className="text-sm font-medium text-amber-600">Verify Identity</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-amber-400">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </a>
          )}
          <a href="#" className="flex items-center justify-between px-5 py-4 border-b border-gray-100 transition hover:bg-gray-50">
            <span className="text-sm font-medium text-gray-700">Change Password</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-400">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </a>
          <a href="/" className="flex items-center justify-between px-5 py-4 transition hover:bg-gray-50">
            <span className="text-sm font-medium text-gray-700">Sign Out</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-400">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
