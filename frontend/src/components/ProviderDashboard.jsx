import { useState, useMemo } from "react";
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
const DASHBOARD_TABS = ["All", "Incoming Requests", "Active", "Completed", "Cancelled"];

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
    "In Progress": "bg-purple-100 text-purple-700 border-purple-200",
    "Cancellation Requested": "bg-amber-100 text-amber-700 border-amber-200",
    Cancelled: "bg-red-100 text-red-700 border-red-200",
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
  const { isLoggedIn, role } = useAuth();
  const { bookings, isLoading, error, updateBookingStatus, submitCompletionProof, requestCancellation } = useBookings();
  const [activeTab, setActiveTab] = useState("All");
  const [bookingSearchQuery, setBookingSearchQuery] = useState("");
  const [expandedJob, setExpandedJob] = useState(null);
  const [acceptingId, setAcceptingId] = useState(null);
  const [statusChange, setStatusChange] = useState(null);
  const [cancelingId, setCancelingId] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [completionBookingId, setCompletionBookingId] = useState(null);

  const normalizedBookingQuery = bookingSearchQuery.trim().toLowerCase();
  const matchesBookingSearch = (booking) => !normalizedBookingQuery ||
    [booking.client, booking.task, booking.description].some((value) => String(value || "").toLowerCase().includes(normalizedBookingQuery));
  const requests = bookings.filter((booking) => booking.status === "Pending Request" && matchesBookingSearch(booking));
  const jobs = bookings.filter((booking) => booking.status !== "Pending Request" && matchesBookingSearch(booking));
  const cancelBooking = bookings.find((booking) => booking.id === cancelingId);

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
    if (activeTab === "Cancelled") return sortedJobs.filter((j) => ["Cancelled", "Declined"].includes(j.status));
    return sortedJobs;
  }, [sortedJobs, activeTab]);

  const dashboardTabCounts = {
    All: bookings.length,
    "Incoming Requests": bookings.filter((booking) => booking.status === "Pending Request").length,
    Active: bookings.filter((booking) => ["Confirmed", "On the Way", "In Progress", "Cancellation Requested", "In Revision", "Disputed"].includes(booking.status)).length,
    Completed: bookings.filter((booking) => booking.status === "Completed").length,
    Cancelled: bookings.filter((booking) => ["Cancelled", "Declined"].includes(booking.status)).length,
  };

  const stats = useMemo(() => {
    const activeJobs = jobs.filter((j) => ["Confirmed", "On the Way", "In Progress", "Cancellation Requested", "In Revision", "Disputed"].includes(j.status)).length;
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
    try {
      await updateBookingStatus(id, "Declined");
    } catch (requestError) {
      window.alert(requestError.message);
    }
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
      <Header showNav activeTab="Home" role="provider" notifCount={requests.length} />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
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

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {DASHBOARD_TABS.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${activeTab === tab ? "bg-gray-900 text-white" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"}`}>
                {tab === "Active" ? "My Bookings (Active)" : tab}
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${activeTab === tab ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>{dashboardTabCounts[tab]}</span>
              </button>
            ))}
          </div>
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">Search bookings</span>
            <input type="search" value={bookingSearchQuery} onChange={(event) => setBookingSearchQuery(event.target.value)} placeholder="Search client or repair" className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400"><circle cx="10.8" cy="10.8" r="6.3" /><path strokeLinecap="round" d="m16 16 4.2 4.2" /></svg>
          </label>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Column */}
          <div className="space-y-6 lg:col-span-2">
            {/* Incoming Requests */}
            {(activeTab === "All" || activeTab === "Incoming Requests") && <div className="rounded-2xl bg-white shadow-sm">
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
            </div>}

            {/* My Jobs */}
            {activeTab !== "Incoming Requests" && <div className="rounded-2xl bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-base font-semibold text-gray-900">My Jobs</h2>
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
                            <button onClick={() => navigate(`/provider/messages?bookingId=${job.id}`)} className="ml-auto rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">Chat</button>
                          </div>
                          <BookingProgress status={job.status} />
                          <p className="mt-1 text-sm font-medium text-gray-700">
                            {job.task}
                          </p>
                          {job.status === "Completed" && job.clientRating != null && (
                            <div className="mt-2 rounded-md border border-amber-100 bg-amber-50 p-2.5 text-xs text-amber-950">
                              <p className="font-semibold">Client review: <span className="inline-flex items-center gap-0.5">{[1, 2, 3, 4, 5].map((star) => (<span key={star} style={{ color: star <= Number(job.clientRating || 0) ? "#fbbf24" : "#d1d5db", lineHeight: 1 }}>{"★"}</span>))}</span></p>
                              {job.clientReview && <p className="mt-1">{job.clientReview}</p>}
                              {job.clientReviewPhotos?.length > 0 && <div className="mt-2 flex gap-2">{job.clientReviewPhotos.map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="Client review attachment" className="h-12 w-12 rounded object-cover" /></a>)}</div>}
                            </div>
                          )}
                          {job.status === "Cancellation Requested" && job.cancellationExpiresAt && (
                            <p className="mt-1 text-xs text-amber-700">Cancellation response due {new Date(job.cancellationExpiresAt).toLocaleString()}.</p>
                          )}
                          {job.cancellationOutcome === "rejected" && (
                            <p className="mt-1 text-xs text-red-700">Your cancellation request was declined. The booking remains active.</p>
                          )}
                          <div className="mt-1 flex items-center gap-3">
                            <button
                              onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                              className="text-xs font-medium text-primary-600 transition hover:text-primary-800"
                            >
                              {job.status === "In Revision" ? (expandedJob === job.id ? "Hide revision" : "Review revision") : expandedJob === job.id ? "Hide details" : "View details"}
                            </button>
                            {STATUS_ACTIONS[job.status] && (
                              <button
                                onClick={() => STATUS_ACTIONS[job.status].status === "complete"
                                  ? setCompletionBookingId(job.id)
                                  : setStatusChange({ bookingId: job.id, ...STATUS_ACTIONS[job.status] })}
                                className="text-xs font-semibold text-primary-700 transition hover:text-primary-900"
                              >
                                {STATUS_ACTIONS[job.status].buttonLabel}
                              </button>
                            )}
                            {canRequestCancellation(job) ? (
                              <button
                                onClick={() => { setCancelingId(job.id); setCancellationReason(""); }}
                                className="text-xs font-medium text-red-600 transition hover:text-red-800"
                              >
                                Cancel
                              </button>
                            ) : getCancellationLockMessage(job) && (
                              <button type="button" disabled title={getCancellationLockMessage(job)} className="cursor-not-allowed text-xs font-medium text-gray-400">Cancellation locked</button>
                            )}
                          </div>
                          {expandedJob === job.id && (
                            <div className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
                              <RevisionReviewPanel booking={job} />
                              <p>{job.description}</p>
                              <div className="mt-2"><AddressActions address={job.address} /></div>
                              <div className="mt-2 flex items-center gap-3">
                                <span>📍 {job.address}</span>
                                <span>📅 {job.date}</span>
                                <span>🕐 {job.time}</span>
                                <span>💵 {job.price}</span>
                                <span className={job.urgency === "Emergency" ? "font-semibold text-red-700" : ""}>{job.urgency || "Flexible"}</span>
                              </div>
                              <BookingHistory events={job.statusHistory} />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>}
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
                onClick={() => navigate("/provider/messages")}
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
