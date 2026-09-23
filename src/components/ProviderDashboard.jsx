import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Header from "../components/Header.jsx";

const initialJobs = [
  {
    id: 1,
    client: "Miguel Torres",
    task: "Desktop Table Repair",
    description: "Broken leg needs reinforcement. Wood glue and screw repair.",
    address: "12 Rizal St, Dagupan City",
    date: "Sep 9, 2026",
    time: "09:00 AM",
    price: "P500",
    status: "Confirmed",
  },
  {
    id: 2,
    client: "Liza Cristobal",
    task: "Front Yard Landscaping",
    description: "Lawn mowing, hedge trimming, and flower bed redesign.",
    address: "8 Aquino Drive, Dagupan City",
    date: "Sep 5, 2026",
    time: "08:00 AM",
    price: "P1,200",
    status: "Completed",
  },
];

const initialRequests = [
  {
    id: 1,
    client: "Ana Reyes",
    task: "Leaking Pipe Fix",
    description: "Kitchen sink pipe is leaking, needs immediate repair.",
    address: "32 Bonifacio St, Dagupan City",
    date: "Sep 14, 2026",
    time: "10:00 AM",
    price: "P1,200",
  },
  {
    id: 2,
    client: "Carlos Magsaysay",
    task: "Bookshelf Assembly",
    description: "Need help assembling a 5-tier bookshelf. All parts included.",
    address: "17 Magsaysay Rd, Dagupan City",
    date: "Sep 15, 2026",
    time: "02:00 PM",
    price: "P800",
  },
];

function parseDate(dateStr) {
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const match = dateStr.match(/(\w{3})\s+(\d+),\s+(\d+)/);
  if (!match) return new Date("1970-01-01");
  return new Date(parseInt(match[3]), months[match[1]] || 0, parseInt(match[2]));
}

function parsePrice(priceStr) {
  const num = parseInt(priceStr.replace(/[^0-9]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

function StatusBadge({ status }) {
  const colors = {
    "Pending Request": "bg-amber-100 text-amber-700 border-amber-200",
    Confirmed: "bg-green-100 text-green-700 border-green-200",
    Completed: "bg-blue-100 text-blue-700 border-blue-200",
    "In Progress": "bg-purple-100 text-purple-700 border-purple-200",
  };
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        colors[status] || "bg-gray-100 text-gray-700 border-gray-200"
      }`}
    >
      {status}
    </span>
  );
}

export default function ProviderDashboard() {
  const navigate = useNavigate();
  const { isLoggedIn, role } = useAuth();
  const [jobs, setJobs] = useState(initialJobs);
  const [requests, setRequests] = useState(initialRequests);
  const [activeTab, setActiveTab] = useState("All");
  const [expandedJob, setExpandedJob] = useState(null);

  const sortedRequests = useMemo(() => {
    return [...requests].sort((a, b) => parseDate(b.date) - parseDate(a.date));
  }, [requests]);

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => parseDate(b.date) - parseDate(a.date));
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    if (activeTab === "Active") return sortedJobs.filter((j) => j.status !== "Completed");
    if (activeTab === "Completed") return sortedJobs.filter((j) => j.status === "Completed");
    return sortedJobs;
  }, [sortedJobs, activeTab]);

  const stats = useMemo(() => {
    const activeJobs = jobs.filter((j) => j.status !== "Completed").length;
    const completedJobs = jobs.filter((j) => j.status === "Completed").length;
    const earnings = jobs
      .filter((j) => j.status === "Completed")
      .reduce((sum, j) => sum + parsePrice(j.price), 0);
    return {
      rating: "4.9",
      reviews: "128 reviews",
      activeJobs,
      completedJobs,
      earnings: `₱${earnings.toLocaleString()}`,
    };
  }, [jobs]);

  const jobTabs = useMemo(() => {
    const all = jobs.length;
    const active = jobs.filter((j) => j.status !== "Completed").length;
    const completed = jobs.filter((j) => j.status === "Completed").length;
    return [
      { label: "All", count: all },
      { label: "Active", count: active },
      { label: "Completed", count: completed },
    ];
  }, [jobs]);

  function acceptRequest(id) {
    const req = requests.find((r) => r.id === id);
    if (!req) return;
    if (!window.confirm(`Accept request from ${req.client} for "${req.task}"?`)) return;
    setRequests((prev) => prev.filter((r) => r.id !== id));
    setJobs((prev) => [
      ...prev,
      { ...req, status: "Pending Request" },
    ]);
  }

  function rejectRequest(id) {
    setRequests((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-16 pb-12">
      <Header showNav activeTab="Home" role="provider" notifCount={requests.length} />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Page Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Provider Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your jobs, requests, and earnings
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xl">⭐</span>
              <span className="text-xs text-gray-500">Rating</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">{stats.rating}</p>
            <p className="mt-0.5 text-xs text-gray-400">{stats.reviews}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔧</span>
              <span className="text-xs text-gray-500">Active Jobs</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">{stats.activeJobs}</p>
            <p className="mt-0.5 text-xs text-gray-400">In progress</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xl">✅</span>
              <span className="text-xs text-gray-500">Completed</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">{stats.completedJobs}</p>
            <p className="mt-0.5 text-xs text-gray-400">All time</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xl">💰</span>
              <span className="text-xs text-gray-500">Earnings</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">{stats.earnings}</p>
            <p className="mt-0.5 text-xs text-gray-400">From completed jobs</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Column */}
          <div className="space-y-6 lg:col-span-2">
            {/* Incoming Requests */}
            <div className="rounded-2xl bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-base font-semibold text-gray-900">
                  Incoming Requests
                  {requests.length > 0 && (
                    <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-medium text-amber-700">
                      {requests.length}
                    </span>
                  )}
                </h2>
              </div>
              {requests.length === 0 ? (
                <div className="py-12 text-center">
                  <span className="text-3xl">📭</span>
                  <p className="mt-2 text-sm text-gray-400">No incoming requests</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {sortedRequests.map((req) => (
                    <div key={req.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                              {req.client}
                            </span>
                            <StatusBadge status="Pending Request" />
                          </div>
                          <p className="mt-1 text-sm font-medium text-gray-700">
                            {req.task}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {req.description}
                          </p>
                          <p className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                            <span>{req.address}</span>
                            <span>{req.date}</span>
                            <span>{req.time}</span>
                            <span className="font-medium text-gray-600">
                              {req.price}
                            </span>
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          <button
                            onClick={() => acceptRequest(req.id)}
                            className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-700"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => rejectRequest(req.id)}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* My Jobs */}
            <div className="rounded-2xl bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-base font-semibold text-gray-900">My Jobs</h2>
              </div>
              <div className="flex gap-1 border-b border-gray-100 px-5 py-2">
                {jobTabs.map((tab) => (
                  <button
                    key={tab.label}
                    onClick={() => setActiveTab(tab.label)}
                    className={`relative rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      activeTab === tab.label
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {tab.label}
                      <span
                        className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                          activeTab === tab.label
                            ? "bg-white/20 text-white"
                            : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        {tab.count}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {filteredJobs.length === 0 ? (
                <div className="py-12 text-center">
                  <span className="text-3xl">📋</span>
                  <p className="mt-2 text-sm text-gray-400">No {activeTab.toLowerCase()} jobs</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredJobs.map((job) => (
                    <div key={job.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                              {job.client}
                            </span>
                            <StatusBadge status={job.status} />
                          </div>
                          <p className="mt-1 text-sm font-medium text-gray-700">
                            {job.task}
                          </p>
                          <button
                            onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                            className="mt-1 text-xs font-medium text-primary-600 transition hover:text-primary-800"
                          >
                            {expandedJob === job.id ? "Hide details" : "View details"}
                          </button>
                          {expandedJob === job.id && (
                            <div className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
                              <p>{job.description}</p>
                              <div className="mt-2 flex items-center gap-3">
                                <span>📍 {job.address}</span>
                                <span>📅 {job.date}</span>
                                <span>🕐 {job.time}</span>
                                <span>💵 {job.price}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Provider Profile Mini Card */}
            <div className="rounded-2xl bg-white p-5 shadow-sm text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-700 ring-4 ring-primary-50">
                {isLoggedIn ? "J" : "?"}
              </div>
              <h3 className="mt-3 text-base font-bold text-gray-900">
                {isLoggedIn ? "Johhny Cruz" : "Guest"}
              </h3>
              <p className="text-xs text-gray-500">{role === "provider" ? "TESDA NC II Carpenter" : "Provider"}</p>
              <div className="mt-3 flex items-center justify-center gap-1 text-sm">
                <span>⭐</span>
                <span className="font-semibold text-gray-900">4.9</span>
                <span className="text-gray-400">(128)</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="rounded-2xl bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Quick Actions
                </h3>
              </div>
              <button
                onClick={() => navigate("/provider-messages")}
                className="flex w-full items-center gap-3 px-5 py-3 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                <span className="text-base">💬</span>
                <span>Messages</span>
              </button>
              <button
                onClick={() => navigate("/provider-bookings")}
                className="flex w-full items-center gap-3 px-5 py-3 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                <span className="text-base">📋</span>
                <span>All Bookings</span>
              </button>
              <button
                onClick={() => navigate("/provider-profile")}
                className="flex w-full items-center gap-3 px-5 py-3 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                <span className="text-base">👤</span>
                <span>My Profile</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
