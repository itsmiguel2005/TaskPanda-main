import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useBookings } from "../context/BookingContext.jsx";
import Header from "../components/Header.jsx";
import BookingProgress from "./BookingProgress.jsx";
import StatusChangeConfirmation from "./StatusChangeConfirmation.jsx";
import CompletionProofModal from "./CompletionProofModal.jsx";
import RevisionReviewPanel from "./RevisionReviewPanel.jsx";
import BookingHistory from "./BookingHistory.jsx";
import AddressActions from "./AddressActions.jsx";
import { canRequestCancellation, getCancellationLockMessage, requiresCancellationApproval } from "../utils/bookingCancellation.js";

const STATUS_ACTIONS = {
  Confirmed: { status: "en_route", nextStatus: "On the Way", buttonLabel: "I'm On My Way" },
  "On the Way": { status: "in_progress", nextStatus: "In Progress", buttonLabel: "Start Task" },
  "In Progress": { status: "complete", nextStatus: "Completed", buttonLabel: "Mark as Complete" },
};
const DASHBOARD_TABS = ["All", "Incoming Requests", "Active", "Completed", "Cancelled", "Declined"];
const DISMISSIBLE_JOB_STATUSES = new Set(["Completed", "Settled", "Cancelled", "Declined by Provider"]);
const DISMISSED_JOBS_STORAGE_KEY = "taskpanda-hidden-provider-dashboard-jobs";

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

function parsePrice(priceStr) {
  const num = parseInt(priceStr.replace(/[^0-9]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

function StatusBadge({ status }) {
  const colors = {
    "Pending Request": "bg-amber-100 text-amber-700 border-amber-200",
    Confirmed: "bg-green-100 text-green-700 border-green-200",
    Completed: "bg-blue-100 text-blue-700 border-blue-200",
    Settled: "bg-emerald-100 text-emerald-800 border-emerald-200",
    "In Progress": "bg-purple-100 text-purple-700 border-purple-200",
    "Cancellation Requested": "bg-amber-100 text-amber-700 border-amber-200",
    Cancelled: "bg-red-100 text-red-700 border-red-200",
    "Declined by Provider": "bg-rose-100 text-rose-800 border-rose-200",
    "On the Way": "bg-cyan-100 text-cyan-800 border-cyan-200",
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
  const { bookings, isLoading, error, updateBookingStatus, submitCompletionProof, requestCancellation } = useBookings();
  const [activeTab, setActiveTab] = useState("All");
  const [bookingSearchQuery, setBookingSearchQuery] = useState("");
  const [expandedJob, setExpandedJob] = useState(null);
  const [acceptingId, setAcceptingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [statusChange, setStatusChange] = useState(null);
  const [cancelingId, setCancelingId] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [completionBookingId, setCompletionBookingId] = useState(null);
  const [dismissedJobIds, setDismissedJobIds] = useState(() => {
    try {
      const savedIds = JSON.parse(window.localStorage.getItem(DISMISSED_JOBS_STORAGE_KEY) || "[]");
      return Array.isArray(savedIds) ? savedIds.map(String) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    window.localStorage.setItem(DISMISSED_JOBS_STORAGE_KEY, JSON.stringify(dismissedJobIds));
  }, [dismissedJobIds]);

  const normalizedBookingQuery = bookingSearchQuery.trim().toLowerCase();
  const matchesBookingSearch = (booking) => !normalizedBookingQuery ||
    [booking.client, booking.task, booking.description].some((value) => String(value || "").toLowerCase().includes(normalizedBookingQuery));
  const requests = bookings.filter((booking) => booking.status === "Pending Request" && matchesBookingSearch(booking));
  const jobs = bookings.filter((booking) => booking.status !== "Pending Request" && matchesBookingSearch(booking));
  const cancelBooking = bookings.find((booking) => booking.id === cancelingId);

  function dismissJob(bookingId) {
    const booking = bookings.find((item) => String(item.id) === String(bookingId));
    if (!booking || !DISMISSIBLE_JOB_STATUSES.has(booking.status)) return;
    setDismissedJobIds((current) => current.includes(String(bookingId)) ? current : [...current, String(bookingId)]);
  }

  const sortedRequests = useMemo(() => {
    return [...requests].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [requests]);

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    if (activeTab === "Incoming Requests") return [];
    if (activeTab === "Active") return sortedJobs.filter((j) => ["Confirmed", "On the Way", "In Progress", "Cancellation Requested", "In Revision", "Disputed"].includes(j.status));
    if (activeTab === "Completed") return sortedJobs.filter((j) => j.status === "Completed");
    if (activeTab === "Cancelled") return sortedJobs.filter((j) => j.status === "Cancelled");
    if (activeTab === "Declined") return sortedJobs.filter((j) => j.status === "Declined by Provider");
    return sortedJobs;
  }, [sortedJobs, activeTab]);
  const visibleJobs = filteredJobs.filter((job) => !dismissedJobIds.includes(String(job.id)));
  const hiddenJobCount = bookings.filter((booking) =>
    dismissedJobIds.includes(String(booking.id)) && DISMISSIBLE_JOB_STATUSES.has(booking.status)
  ).length;

  const dashboardTabCounts = {
    All: bookings.length,
    "Incoming Requests": bookings.filter((booking) => booking.status === "Pending Request").length,
    Active: bookings.filter((booking) => ["Confirmed", "On the Way", "In Progress", "Cancellation Requested", "In Revision", "Disputed"].includes(booking.status)).length,
    Completed: bookings.filter((booking) => booking.status === "Completed").length,
    Cancelled: bookings.filter((booking) => booking.status === "Cancelled").length,
    Declined: bookings.filter((booking) => booking.status === "Declined by Provider").length,
  };

  const stats = useMemo(() => {
    const activeStatuses = ["Confirmed", "On the Way", "In Progress", "Cancellation Requested", "In Revision", "Disputed"];
    const completedStatuses = ["Completed", "Settled"];
    const activeJobs = bookings.filter((booking) => activeStatuses.includes(booking.status)).length;
    const completedJobs = bookings.filter((booking) => completedStatuses.includes(booking.status)).length;
    const earnings = bookings
      .filter((booking) => completedStatuses.includes(booking.status))
      .reduce((sum, j) => sum + parsePrice(j.price), 0);
    const reviewedBookings = bookings.filter((booking) =>
      completedStatuses.includes(booking.status)
      && booking.clientRating !== null
      && booking.clientRating !== undefined
      && Number.isFinite(Number(booking.clientRating))
    );
    const rating = reviewedBookings.length
      ? reviewedBookings.reduce((total, booking) => total + Number(booking.clientRating), 0) / reviewedBookings.length
      : 0;
    return {
      rating,
      reviews: `${reviewedBookings.length} ${reviewedBookings.length === 1 ? "review" : "reviews"}`,
      activeJobs,
      completedJobs,
      earnings: `₱${earnings.toLocaleString()}`,
    };
  }, [bookings]);

  const nextBooking = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return bookings
      .filter((booking) => ["Confirmed", "On the Way", "In Progress"].includes(booking.status))
      .filter((booking) => {
        const date = new Date(booking.serviceDate || booking.createdAt);
        return Number.isFinite(date.getTime()) && date >= startOfToday;
      })
      .sort((a, b) => new Date(a.serviceDate || a.createdAt) - new Date(b.serviceDate || b.createdAt))[0] || null;
  }, [bookings]);

  function acceptRequest(id) {
    const req = requests.find((r) => r.id === id);
    if (!req) return;
    setAcceptingId(id);
  }

  async function confirmAcceptRequest() {
    if (!acceptingId) return;
    try {
      await updateBookingStatus(acceptingId, "Confirmed");
    } catch (requestError) {
      window.alert(requestError.message);
    } finally {
      setAcceptingId(null);
    }
  }

  async function rejectRequest(id) {
    setRejectingId(id);
  }

  async function handleCancelJob() {
    if (!cancelingId || !cancelBooking || !canRequestCancellation(cancelBooking)) {
      throw new Error(cancelBooking ? getCancellationLockMessage(cancelBooking) || "Cancellation is no longer available." : "This booking is no longer available.");
    }
    await requestCancellation(cancelingId, "request", cancellationReason);
    setCancelingId(null);
    setCancellationReason("");
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-16 pb-12">
      <Header showNav activeTab="Home" role="provider" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Page Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Provider Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your jobs, requests, and earnings
          </p>
        </div>
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {isLoading && <p className="mb-4 text-sm text-gray-500">Loading bookings...</p>}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Rating", value: stats.rating, detail: stats.reviews, tone: "border-amber-100 bg-amber-50/70" },
            { label: "Active Jobs", value: stats.activeJobs, detail: "Currently in progress", tone: "border-emerald-100 bg-emerald-50/60" },
            { label: "Completed Jobs", value: stats.completedJobs, detail: "All-time completed", tone: "border-blue-100 bg-blue-50/60" },
            { label: "Total Earnings", value: stats.earnings, detail: "From completed jobs", tone: "border-slate-200 bg-white" },
          ].map((metric) => (
            <div key={metric.label} className={`min-h-28 rounded-2xl border p-4 shadow-sm sm:p-5 ${metric.tone}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
              {metric.label === "Rating" ? (
                <div className="mt-2 flex items-center gap-1" aria-label={metric.value > 0 ? `${metric.value.toFixed(1)} out of 5 stars` : "No ratings yet"}>
                  {[1, 2, 3, 4, 5].map((star) => <span key={star} aria-hidden="true" className={`text-xl leading-none ${metric.value > 0 && star <= Math.round(metric.value) ? "text-amber-500" : "text-slate-300"}`}>★</span>)}
                </div>
              ) : (
                <p className="mt-2 text-2xl font-bold text-slate-900">{metric.value}</p>
              )}
              <p className="mt-1 text-xs text-slate-500">{metric.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            {DASHBOARD_TABS.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-xs font-semibold transition sm:text-sm ${activeTab === tab ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
                {tab === "Active" ? "Active Bookings" : tab}
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${activeTab === tab ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>{dashboardTabCounts[tab]}</span>
              </button>
            ))}
          </div>
          <label className="relative block w-full shrink-0 xl:max-w-sm">
            <span className="sr-only">Search bookings</span>
            <input type="search" value={bookingSearchQuery} onChange={(event) => setBookingSearchQuery(event.target.value)} placeholder="Search client or repair" className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400"><circle cx="10.8" cy="10.8" r="6.3" /><path strokeLinecap="round" d="m16 16 4.2 4.2" /></svg>
          </label>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Column */}
          <div className="space-y-6 lg:col-span-2">
            {/* Incoming Requests */}
            {(activeTab === "All" || activeTab === "Incoming Requests") && <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-bold text-slate-900">
                  Incoming Requests
                  {requests.length > 0 && (
                    <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-50 px-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                      {requests.length}
                    </span>
                  )}
                </h2>
              </div>
              {requests.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm font-medium text-slate-500">No incoming requests</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {sortedRequests.map((req) => (
                    <div key={req.id} className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_11rem] sm:px-6">
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700 ring-1 ring-slate-200">{req.client.charAt(0)}</div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{req.client}</p>
                              <p className="text-xs text-slate-500">New booking request</p>
                            </div>
                          </div>
                          <StatusBadge status="Pending Request" />
                        </div>
                        <div className="mt-4">
                          <h3 className="text-base font-bold text-slate-900">{req.task}</h3>
                          <p className="mt-1 text-sm leading-relaxed text-slate-500">{req.description}</p>
                        </div>
                        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                          <div className="min-w-0">
                            <dt className="font-medium text-slate-400">Location</dt>
                            <dd className="mt-0.5 truncate text-slate-700">{req.address}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-slate-400">Requested time</dt>
                            <dd className="mt-0.5 text-slate-700">{req.date} · {req.time}</dd>
                          </div>
                        </dl>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{req.urgency || "Flexible"}</span>
                          <span className="text-sm font-bold text-slate-900">{req.price}</span>
                        </div>
                      </div>
                      <div className="flex flex-row gap-2 border-t border-slate-100 pt-3 sm:flex-col sm:justify-center sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                          <button
                            onClick={() => acceptRequest(req.id)}
                            className="flex-1 rounded-full bg-primary-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-700 sm:flex-none"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => rejectRequest(req.id)}
                            className="flex-1 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:flex-none"
                          >
                            Decline
                          </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>}

            {/* My Jobs */}
            {activeTab !== "Incoming Requests" && <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-bold text-slate-900">My Jobs</h2>
                {hiddenJobCount > 0 && (
                  <button type="button" onClick={() => setDismissedJobIds([])} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                    Restore {hiddenJobCount} hidden
                  </button>
                )}
              </div>
              {visibleJobs.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-medium text-slate-500">No {activeTab.toLowerCase()} jobs</p>
                </div>
              ) : (
                <div className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent lg:max-h-[calc(100vh-21rem)]">
                  {visibleJobs.map((job) => (
                    <div key={job.id} className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_11rem] sm:px-6">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700 ring-1 ring-slate-200">{job.client?.charAt(0) || "C"}</div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{job.client}</p>
                            <p className="text-xs text-slate-500">Submitted {job.createdAt ? new Date(job.createdAt).toLocaleString() : ""}</p>
                          </div>
                          <StatusBadge status={job.status} />
                          {DISMISSIBLE_JOB_STATUSES.has(job.status) && (
                            <button
                              type="button"
                              onClick={() => dismissJob(job.id)}
                              aria-label={`Archive ${job.task} booking from dashboard`}
                              title="Hide this job from the dashboard"
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                            </button>
                          )}
                        </div>
                        <div className="mt-4">
                          <p className="text-base font-bold text-slate-900">{job.task}</p>
                          <p className="mt-1 text-sm leading-relaxed text-slate-500">{job.description}</p>
                        </div>
                        <div className="mt-3 max-w-md"><BookingProgress status={job.status} /></div>
                        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                          <div className="min-w-0">
                            <dt className="font-medium text-slate-400">Location</dt>
                            <dd className="mt-0.5 truncate text-slate-700">{job.address}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-slate-400">Schedule</dt>
                            <dd className="mt-0.5 text-slate-700">{job.date} · {job.time}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-slate-400">Agreed price</dt>
                            <dd className="mt-0.5 font-semibold text-slate-900">{job.price}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-slate-400">Service category</dt>
                            <dd className="mt-0.5 text-slate-700">{job.cred || "Local service"}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-slate-400">Urgency</dt>
                            <dd className={`mt-0.5 text-slate-700 ${job.urgency === "Emergency" ? "font-semibold text-rose-700" : ""}`}>{job.urgency || "Flexible"}</dd>
                          </div>
                        </dl>
                          {job.status === "Completed" && job.clientRating != null && (
                            <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-xs text-amber-950">
                              <p className="font-semibold">Client review: <span className="inline-flex items-center gap-0.5">{[1, 2, 3, 4, 5].map((star) => (<span key={star} style={{ color: star <= Number(job.clientRating || 0) ? "#fbbf24" : "#d1d5db", lineHeight: 1 }}>{"★"}</span>))}</span></p>
                              {job.clientReview && <p className="mt-1">{job.clientReview}</p>}
                              {job.clientReviewPhotos?.length > 0 && <div className="mt-2 flex gap-2">{job.clientReviewPhotos.map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="Client review attachment" className="h-12 w-12 rounded object-cover" /></a>)}</div>}
                            </div>
                          )}
                          {job.status === "Cancellation Requested" && job.cancellationExpiresAt && (
                            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Cancellation response due {new Date(job.cancellationExpiresAt).toLocaleString()}.</p>
                          )}
                          {job.cancellationOutcome === "rejected" && (
                            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">Your cancellation request was declined. The booking remains active.</p>
                          )}
                          {expandedJob === job.id && (
                            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                              <RevisionReviewPanel booking={job} />
                              <p className="mt-2">{job.description}</p>
                              <div className="mt-2"><AddressActions address={job.address} /></div>
                              <BookingHistory events={job.statusHistory} />
                            </div>
                          )}
                      </div>
                      <div className="flex flex-row flex-wrap gap-2 border-t border-slate-100 pt-3 sm:flex-col sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                        <button onClick={() => navigate(`/provider/messages?bookingId=${job.id}`)} className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:flex-none">Open conversation</button>
                        <button
                          onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                          className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:flex-none"
                        >
                          {job.status === "In Revision" ? (expandedJob === job.id ? "Hide revision" : "Review revision") : expandedJob === job.id ? "Hide details" : "View details"}
                        </button>
                        {STATUS_ACTIONS[job.status] && (
                          <button
                            onClick={() => STATUS_ACTIONS[job.status].status === "complete"
                              ? setCompletionBookingId(job.id)
                              : setStatusChange({ bookingId: job.id, ...STATUS_ACTIONS[job.status] })}
                            className="flex-1 rounded-full bg-primary-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-700 sm:flex-none"
                          >
                            {STATUS_ACTIONS[job.status].buttonLabel}
                          </button>
                        )}
                        {canRequestCancellation(job) ? (
                          <button
                            onClick={() => { setCancelingId(job.id); setCancellationReason(""); }}
                            className="flex-1 rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 sm:flex-none"
                          >
                            Cancel booking
                          </button>
                        ) : getCancellationLockMessage(job) && (
                          <button type="button" disabled title={getCancellationLockMessage(job)} className="flex-1 cursor-not-allowed rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-400 sm:flex-none">Cancellation locked</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-600">Next up</p>
                  <h2 className="mt-1 text-base font-bold text-slate-900">Upcoming Schedule</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{nextBooking ? "Scheduled" : "Clear"}</span>
              </div>
              {nextBooking ? (
                <div className="p-5">
                  <p className="text-sm font-semibold text-primary-700">{nextBooking.date} · {nextBooking.time}</p>
                  <h3 className="mt-2 text-base font-bold text-slate-900">{nextBooking.task}</h3>
                  <p className="mt-1 text-sm text-slate-600">{nextBooking.client}</p>
                  <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">{nextBooking.address || "Address to be confirmed"}</p>
                  <div className="mt-4 flex flex-col gap-2">
                    <button type="button" onClick={() => navigate(`/provider/messages?bookingId=${nextBooking.id}`)} className="w-full rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-700">Open conversation</button>
                    <button type="button" onClick={() => setActiveTab("Active")} className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">View active jobs</button>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm font-medium text-slate-700">No upcoming jobs</p>
                  <p className="mt-1 text-xs text-slate-500">Accepted bookings will appear here.</p>
                  <button type="button" onClick={() => navigate("/provider-bookings")} className="mt-4 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Manage bookings</button>
                </div>
              )}
            </section>

            {/* Quick Actions */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Quick Actions
                </h3>
              </div>
              <button
                onClick={() => navigate("/provider/messages")}
                className="flex w-full items-center gap-3 px-5 py-3 text-sm text-slate-600 transition hover:bg-slate-50"
              >
                <span className="text-base">💬</span>
                <span>Messages</span>
              </button>
              <button
                onClick={() => navigate("/provider-bookings")}
                className="flex w-full items-center gap-3 px-5 py-3 text-sm text-slate-600 transition hover:bg-slate-50"
              >
                <span className="text-base">📋</span>
                <span>All Bookings</span>
              </button>
              <button
                onClick={() => navigate("/provider-profile")}
                className="flex w-full items-center gap-3 px-5 py-3 text-sm text-slate-600 transition hover:bg-slate-50"
              >
                <span className="text-base">👤</span>
                <span>My Profile</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {acceptingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setAcceptingId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900">Accept Request?</h3>
              <p className="mt-2 text-sm text-gray-500">
                {(() => {
                  const request = requests.find((item) => item.id === acceptingId);
                  return request ? `Accept ${request.client}'s request for "${request.task}"?` : "Accept this booking request?";
                })()}
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setAcceptingId(null)}
                  className="flex-1 rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Keep Request
                </button>
                <button
                  type="button"
                  onClick={confirmAcceptRequest}
                  className="flex-1 rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700"
                >
                  Accept
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {statusChange && (
        <StatusChangeConfirmation
          nextStatus={statusChange.nextStatus}
          onConfirm={() => updateBookingStatus(statusChange.bookingId, statusChange.status)}
          onClose={() => setStatusChange(null)}
        />
      )}
      {rejectingId && (
        <StatusChangeConfirmation
          nextStatus="Declined by Provider"
          onConfirm={() => updateBookingStatus(rejectingId, "declined")}
          onClose={() => setRejectingId(null)}
        />
      )}
      {cancelingId && cancelBooking && canRequestCancellation(cancelBooking) && (
        <StatusChangeConfirmation
          nextStatus="Cancelled"
          cancellationRequiresApproval={requiresCancellationApproval(cancelBooking)}
          canConfirm={!requiresCancellationApproval(cancelBooking) || Boolean(cancellationReason.trim())}
          onConfirm={handleCancelJob}
          onClose={() => setCancelingId(null)}
        >
          <p className="mt-2 text-sm text-gray-600">{cancelBooking.task} for {cancelBooking.client}</p>
          {requiresCancellationApproval(cancelBooking) && (
            <label className="mt-4 block text-sm font-medium text-gray-700">Reason for cancellation
              <textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} maxLength={500} rows={3} required placeholder="Explain why you need to cancel" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
          )}
        </StatusChangeConfirmation>
      )}
      {completionBookingId && <CompletionProofModal
        bookingName={bookings.find((booking) => booking.id === completionBookingId)?.task}
        onSubmit={(note, photos) => submitCompletionProof(completionBookingId, note, photos)}
        onClose={() => setCompletionBookingId(null)}
      />}
    </div>
  );
}
