import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "../components/Header.jsx";

const stats = [
  { label: "Total Users", value: "1,247", sub: "853 clients, 394 providers", icon: "👥" },
  { label: "Pending Verifications", value: "12", sub: "ID reviews awaiting", icon: "⏳" },
  { label: "Active Bookings", value: "38", sub: "14 pending, 24 in progress", icon: "📋" },
  { label: "Completed Today", value: "56", sub: "Across all categories", icon: "✅" },
];

const users = [
  { id: 1, name: "Miguel Torres", email: "miguel@taskpanda.com", role: "client", verified: true, status: "Active", joined: "Jan 15, 2025" },
  { id: 2, name: "Ana Reyes", email: "ana@taskpanda.com", role: "provider", verified: true, status: "Active", joined: "Feb 3, 2025" },
  { id: 3, name: "Johhny Cruz", email: "johny@taskpanda.com", role: "provider", verified: false, status: "Pending", joined: "Mar 12, 2025" },
  { id: 4, name: "Maria Santos", email: "maria@taskpanda.com", role: "provider", verified: false, status: "Pending", joined: "Apr 8, 2025" },
  { id: 5, name: "Ricky Padilla", email: "ricky@taskpanda.com", role: "provider", verified: true, status: "Active", joined: "May 20, 2025" },
  { id: 6, name: "Carlos Magsaysay", email: "carlos@taskpanda.com", role: "provider", verified: true, status: "Active", joined: "Jun 2, 2025" },
  { id: 7, name: "Liza Cristobal", email: "liza@taskpanda.com", role: "client", verified: true, status: "Active", joined: "Jul 14, 2025" },
  { id: 8, name: "Bombi Mercado", email: "bombi@taskpanda.com", role: "client", verified: false, status: "Suspended", joined: "Aug 1, 2025" },
  { id: 9, name: "Perez Cruz", email: "perez@taskpanda.com", role: "provider", verified: true, status: "Active", joined: "Sep 5, 2025" },
  { id: 10, name: "Guest User", email: "guest@temp.com", role: "client", verified: false, status: "Pending", joined: "Sep 18, 2025" },
];

const verifications = [
  { id: 1, user: "Johhny Cruz", email: "johny@taskpanda.com", type: "ID Front + Back", idNumber: "PH-1234-5678-9012", certificate: "TEC-2024-0042", idFrontFile: "id-front-johny.jpg", idBackFile: "id-back-johny.jpg", submitted: "10 min ago", status: "Pending" },
  { id: 2, user: "Maria Santos", email: "maria@taskpanda.com", type: "ID Front + Back", idNumber: "PH-9876-5432-1098", certificate: "TEC-2024-0117", idFrontFile: "id-front-maria.jpg", idBackFile: "id-back-maria.jpg", submitted: "1 hour ago", status: "Pending" },
  { id: 3, user: "Bombi Mercado", email: "bombi@taskpanda.com", type: "ID Front", idNumber: "PH-5555-6666-7777", certificate: "", idFrontFile: "id-front-bombi.jpg", idBackFile: null, submitted: "3 hours ago", status: "Pending" },
  { id: 4, user: "Guest User", email: "guest@temp.com", type: "ID Front + Back", idNumber: "TEMP-0001", certificate: "", idFrontFile: "id-front-guest.png", idBackFile: "id-back-guest.png", submitted: "5 hours ago", status: "Pending" },
];

const bookings = [
  { id: 1, client: "Miguel Torres", worker: "Johhny Cruz", task: "Desktop Table Repair", status: "Pending Request", date: "Sep 9, 2026", price: "P500" },
  { id: 2, client: "Liza Cristobal", worker: "Maria Santos", task: "Circuit Breaker Replacement", status: "Confirmed", date: "Sep 10, 2026", price: "P800" },
  { id: 3, client: "Bombi Mercado", worker: "Ricky Padilla", task: "Front Yard Landscaping", status: "Completed", date: "Sep 5, 2026", price: "P1,200" },
  { id: 4, client: "Miguel Torres", worker: "Carlos Magsaysay", task: "Bookshelf Assembly", status: "In Progress", date: "Sep 12, 2026", price: "P650" },
];

function StatusBadge({ status }) {
  const colors = {
    Active: "bg-green-100 text-green-700 border-green-200",
    Pending: "bg-amber-100 text-amber-700 border-amber-200",
    Suspended: "bg-red-100 text-red-700 border-red-200",
    Confirmed: "bg-green-100 text-green-700 border-green-200",
    Completed: "bg-blue-100 text-blue-700 border-blue-200",
    "In Progress": "bg-accent-100 text-accent-700 border-accent-200",
  };
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
      {status}
    </span>
  );
}

export default function AdminDashboardPage() {
  const [searchParams] = useSearchParams();
  const section = searchParams.get("section") || "dashboard";
  const activeTab = section.charAt(0).toUpperCase() + section.slice(1);
  const [bookTab, setBookTab] = useState("All");

  const tabs = ["All", "Pending Request", "Confirmed", "Completed", "In Progress"];

  const filteredBookings =
    bookTab === "All"
      ? bookings
      : bookings.filter((b) => b.status === bookTab);

  const [viewingVerif, setViewingVerif] = useState(null);

  const approveVerification = (id) => {
    console.log(`[Admin] Approving verification #${id}`);
  };

  const rejectVerification = (id) => {
    console.log(`[Admin] Rejecting verification #${id}`);
  };

  const suspendUser = (id) => {
    console.log(`[Admin] Suspending user #${id}`);
  };

  const resetData = () => {
    if (window.confirm("Are you sure you want to reset all test data? This will clear all mock data.")) {
      console.log("[Admin] Resetting all test data...");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-16 pb-12">
      <Header showNav activeTab={activeTab} role="admin" />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Dev Mode Banner */}
        <div className="mb-4 rounded-lg bg-primary-50 border border-primary-200 px-4 py-3 text-sm font-medium text-primary-700">
          🔧 Debug Mode — Admin Dashboard (not secured)
        </div>

        {section === "dashboard" && (
          <>
            {/* Page Title */}
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
                  <p className="mt-1 text-sm text-gray-500">Platform overview, user management, and debugging tools</p>
                </div>
                <button
                  onClick={resetData}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100"
                >
                  Reset Test Data
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{s.icon}</span>
                    <span className="text-xs text-gray-500">{s.label}</span>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{s.value}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{s.sub}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {section === "users" && (
          <div className="rounded-2xl bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                All Users
                <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gray-100 px-1.5 text-xs font-medium text-gray-700">
                  {users.length}
                </span>
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-medium text-gray-500">
                  <tr>
                    <th className="px-5 py-2.5">Name</th>
                    <th className="px-5 py-2.5">Email</th>
                    <th className="px-5 py-2.5">Role</th>
                    <th className="px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <span className="font-medium text-gray-900">{user.name}</span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{user.email}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${user.role === "provider" ? "bg-accent-100 text-accent-700" : "bg-primary-100 text-primary-700"}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-5 py-3"><StatusBadge status={user.status} /></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {user.verified ? (
                            <button
                              onClick={() => suspendUser(user.id)}
                              className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-50"
                            >
                              Suspend
                            </button>
                          ) : (
                            <button
                              onClick={() => approveVerification(user.id)}
                              className="rounded-lg border border-green-200 px-2 py-1 text-[11px] font-medium text-green-600 transition hover:bg-green-50"
                            >
                              Verify
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(section === "bookings" || section === "dashboard") && (
          <div className="mt-6">
            <div className="rounded-2xl bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-base font-semibold text-gray-900">
                  Bookings
                  <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gray-100 px-1.5 text-xs font-medium text-gray-700">
                    {bookings.length}
                  </span>
                </h2>
              </div>
              <div className="flex gap-1 px-5 pt-3">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setBookTab(tab)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      bookTab === tab
                        ? "bg-gray-900 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="divide-y divide-gray-100">
                {filteredBookings.map((b) => (
                  <div key={b.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{b.task}</span>
                          <StatusBadge status={b.status} />
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{b.client} → {b.worker}</p>
                        <p className="mt-1 text-xs text-gray-400">{b.date} · {b.price}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredBookings.length === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-400">No bookings in this category</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {(section === "verifications" || section === "dashboard") && (
          <div className="mt-6">
            <div className="rounded-2xl bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                  Verification Queue
                  <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-medium text-amber-700">
                    {verifications.length}
                  </span>
                </h2>
              </div>
              {verifications.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-gray-400">No pending verifications</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {verifications.map((v) => (
                    <div key={v.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">{v.user}</p>
                          <p className="truncate text-xs text-gray-500">{v.email}</p>
                          <p className="mt-1 text-[11px] text-gray-400">{v.type} · {v.submitted}</p>
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                            <span className="text-gray-500">ID: <span className="font-medium text-gray-700">{v.idNumber}</span></span>
                            {v.certificate && <span className="text-gray-500">Cert: <span className="font-medium text-gray-700">{v.certificate}</span></span>}
                            {v.idFrontFile && <span className="text-gray-500">ID Front: <span className="font-medium text-gray-700">{v.idFrontFile}</span></span>}
                            {v.idBackFile && <span className="text-gray-500">ID Back: <span className="font-medium text-gray-700">{v.idBackFile}</span></span>}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => setViewingVerif(v)}
                          className="flex-1 rounded-lg bg-blue-600 py-1.5 text-[11px] font-semibold text-white transition hover:bg-blue-700"
                        >
                          View ID
                        </button>
                        <button
                          onClick={() => approveVerification(v.id)}
                          className="flex-1 rounded-lg bg-green-600 py-1.5 text-[11px] font-semibold text-white transition hover:bg-green-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => rejectVerification(v.id)}
                          className="flex-1 rounded-lg border border-gray-200 py-1.5 text-[11px] font-medium text-gray-600 transition hover:bg-gray-100"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* System Info */}
        <div className="mt-6">
          <div className="rounded-2xl bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">System Info</h2>
            </div>
            <div className="px-5 py-4 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">Server</span><span className="font-medium text-gray-900">● Running</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Port</span><span className="font-medium text-gray-900">3000</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Build</span><span className="font-medium text-gray-900">v1.0.0</span></div>
              <div className="flex justify-between"><span className="text-gray-500">DB</span><span className="font-medium text-gray-900">Mock Data</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Uploads</span><span className="font-medium text-gray-900">{5 * 1024}KB limit</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Auth</span><span className="font-medium text-gray-900">Session</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Current Role</span><span className="font-medium text-primary-600">admin</span></div>
            </div>
          </div>
          {viewingVerif && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setViewingVerif(null)}>
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">ID Verification — {viewingVerif.user}</h3>
                  <button onClick={() => setViewingVerif(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-500">ID Front</p>
                    <div className="flex h-40 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50">
                      <div className="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mx-auto h-8 w-8 text-gray-300">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h12a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v16h12V4H6z" clipRule="evenodd" />
                          <path d="M9 8a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V8z" />
                        </svg>
                        <p className="mt-1 text-xs text-gray-400">{viewingVerif.idFrontFile || "No file"}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-500">ID Back</p>
                    <div className="flex h-40 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50">
                      <div className="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mx-auto h-8 w-8 text-gray-300">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h12a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v16h12V4H6z" clipRule="evenodd" />
                          <path d="M9 8a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V8z" />
                        </svg>
                        <p className="mt-1 text-xs text-gray-400">{viewingVerif.idBackFile || "No file"}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <div>
                      <span className="font-medium text-gray-500">ID Number:</span>{" "}
                      <span className="text-gray-900">{viewingVerif.idNumber || "N/A"}</span>
                    </div>
                    {viewingVerif.certificate && (
                      <div>
                        <span className="font-medium text-gray-500">Certificate:</span>{" "}
                        <span className="text-gray-900">{viewingVerif.certificate}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
