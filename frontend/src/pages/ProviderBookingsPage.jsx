import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import { useBookings } from "../context/BookingContext.jsx";
import BookingProgress from "../components/BookingProgress.jsx";
import StatusChangeConfirmation from "../components/StatusChangeConfirmation.jsx";
import CompletionProofModal from "../components/CompletionProofModal.jsx";
import RevisionReviewPanel from "../components/RevisionReviewPanel.jsx";
import BookingHistory from "../components/BookingHistory.jsx";
import AddressActions from "../components/AddressActions.jsx";
import { canRequestCancellation, getCancellationLockMessage, requiresCancellationApproval } from "../utils/bookingCancellation.js";

const STATUS_ACTIONS = {
  Confirmed: { status: "en_route", nextStatus: "On the Way", buttonLabel: "I'm On My Way" },
  "On the Way": { status: "in_progress", nextStatus: "In Progress", buttonLabel: "Start Task" },
  "In Progress": { status: "complete", nextStatus: "Completed", buttonLabel: "Mark as Complete" },
};
const TIME_SLOTS = ["7:30 AM", "9:00 AM", "10:30 AM", "1:30 PM", "3:00 PM", "4:30 PM", "6:00 PM"];

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

const initialBookings = [
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

const tabs = [
  { key: "All", label: "All" },
  { key: "Incoming Requests", label: "Incoming" },
  { key: "Active", label: "Active" },
  { key: "Completed", label: "Completed" },
  { key: "Cancelled", label: "Cancelled" },
  { key: "Declined", label: "Declined" },
];

function parsePrice(priceStr) {
  const num = parseInt(priceStr.replace(/[^0-9]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

function formatBookingTotal(booking) {
  const amount = Number(booking.offeredPrice ?? booking.offer);
  return Number.isFinite(amount) ? `₱${amount.toLocaleString()}` : String(booking.price || "").replace(/^P/, "₱");
}

function StatusBadge({ status }) {
  const colors = {
    "Pending Request": "bg-amber-100 text-amber-700 border-amber-200",
    Confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Completed: "bg-blue-100 text-blue-700 border-blue-200",
    Cancelled: "bg-red-100 text-red-700 border-red-200",
    "Declined by Provider": "bg-rose-100 text-rose-800 border-rose-200",
    "Cancellation Requested": "bg-amber-100 text-amber-700 border-amber-200",
    "In Revision": "bg-amber-100 text-amber-800 border-amber-200",
    Disputed: "bg-rose-100 text-rose-700 border-rose-200",
    "In Progress": "bg-violet-100 text-violet-700 border-violet-200",
    "On the Way": "bg-cyan-100 text-cyan-800 border-cyan-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em] ${
        colors[status] || "bg-slate-100 text-slate-700 border-slate-200"
      }`}
    >
      {status}
    </span>
  );
}

function StatusDot({ status }) {
  const colors = {
    "Pending Request": "bg-amber-500",
    Confirmed: "bg-green-500",
    Completed: "bg-blue-500",
    Cancelled: "bg-red-500",
    "Declined by Provider": "bg-rose-600",
    "Cancellation Requested": "bg-amber-500",
    "In Progress": "bg-purple-500",
    "On the Way": "bg-cyan-500",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        colors[status] || "bg-gray-400"
      }`}
    />
  );
}

export default function ProviderBookingsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const { bookings, isLoading, error, updateBookingStatus, submitCompletionProof, requestCancellation, sendProviderUpdate, confirmCashSettlement, refreshBookings } = useBookings();
  const [sortBy, setSortBy] = useState("createdAt");
  const [acceptingId, setAcceptingId] = useState(null);
  const [statusChange, setStatusChange] = useState(null);
  const [cancelingId, setCancelingId] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [rejectingId, setRejectingId] = useState(null);
  const [completionBookingId, setCompletionBookingId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [providerUpdateId, setProviderUpdateId] = useState(null);
  const [providerUpdateNote, setProviderUpdateNote] = useState("");
  const [isRescheduleRequest, setIsRescheduleRequest] = useState(false);
  const [proposedServiceDate, setProposedServiceDate] = useState("");
  const [proposedTimeSlot, setProposedTimeSlot] = useState(TIME_SLOTS[0]);
  const [providerUpdateError, setProviderUpdateError] = useState("");
  const [providerUpdateSuccess, setProviderUpdateSuccess] = useState(false);

  const safeBookings = Array.isArray(bookings) ? bookings : [];
  const query = searchQuery.trim().toLowerCase();
  const matchesSearch = (booking) => !query || [booking.client, booking.task, booking.description]
    .some((value) => String(value || "").toLowerCase().includes(query));
  const requests = safeBookings.filter((booking) => booking.status === "Pending Request" && matchesSearch(booking));
  const managedBookings = safeBookings.filter((booking) => booking.status !== "Pending Request" && matchesSearch(booking));
  const filteredManagedBookings = managedBookings.filter((booking) => {
    if (activeTab === "All") return true;
    if (activeTab === "Active") return ["Confirmed", "On the Way", "In Progress", "Cancellation Requested", "In Revision", "Disputed"].includes(booking.status);
    if (activeTab === "Completed") return booking.status === "Completed";
    if (activeTab === "Cancelled") return booking.status === "Cancelled";
    if (activeTab === "Declined") return booking.status === "Declined by Provider";
    return false;
  });

  const sortedRequests = useMemo(() => {
    return [...requests].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [requests]);

  const sortedBookings = useMemo(() => {
    let result = [...filteredManagedBookings];
    if (sortBy === "createdAt") {
      result.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } else if (sortBy === "date") {
      result.sort((a, b) => new Date(a.serviceDate || 0) - new Date(b.serviceDate || 0));
    } else if (sortBy === "price") {
      result.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
    } else if (sortBy === "status") {
      const order = { "Pending Request": 0, Confirmed: 1, "On the Way": 2, "In Progress": 3, Completed: 4, Cancelled: 5, "Declined by Provider": 6 };
      result.sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));
    }
    return result;
  }, [filteredManagedBookings, sortBy]);

  const stats = useMemo(() => ({
    total: requests.length + managedBookings.length,
    incoming: requests.length,
    active: managedBookings.filter((b) => ["Confirmed", "On the Way", "In Progress", "Cancellation Requested", "In Revision", "Disputed"].includes(b.status)).length,
    completed: managedBookings.filter((b) => b.status === "Completed").length,
    cancelled: managedBookings.filter((b) => b.status === "Cancelled").length,
    declined: managedBookings.filter((b) => b.status === "Declined by Provider").length,
    earnings: managedBookings
      .filter((b) => b.status === "Completed")
      .reduce((sum, b) => sum + parsePrice(b.price), 0),
  }), [requests, managedBookings]);

  const showIncoming = activeTab === "All" || activeTab === "Incoming Requests";
  const showBookings = activeTab !== "Incoming Requests";
  const visibleBookingCount = (showIncoming ? requests.length : 0) + (showBookings ? filteredManagedBookings.length : 0);

  const detailItem = useMemo(() => {
    if (!detailId) return null;
    return (
      requests.find((r) => r.id === detailId) ||
      managedBookings.find((b) => b.id === detailId) ||
      null
    );
  }, [detailId, requests, managedBookings]);
  const cancelBooking = safeBookings.find((booking) => booking.id === cancelingId);

  function acceptRequest(id) {
    const req = requests.find((r) => r.id === id);
    if (!req) return;
    setAcceptingId(id);
  }

  async function confirmAcceptRequest() {
    if (!acceptingId) return;
    try {
      await updateBookingStatus(acceptingId, "Confirmed");
    } catch (error) {
      window.alert(error.message);
    } finally {
      setAcceptingId(null);
    }
  }

  async function handleCancelBooking() {
    if (!cancelingId || !cancelBooking || !canRequestCancellation(cancelBooking)) {
      throw new Error(cancelBooking ? getCancellationLockMessage(cancelBooking) || "Cancellation is no longer available." : "This booking is no longer available.");
    }
    await requestCancellation(cancelingId, "request", cancellationReason);
    setCancelingId(null);
    setCancellationReason("");
  }

  async function handleCancellationResponse(id, action) {
    try {
      await requestCancellation(id, action);
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function handleSendProviderUpdate(event) {
    event.preventDefault();
    if (!providerUpdateId) return;
    setProviderUpdateError("");
    try {
      await sendProviderUpdate(providerUpdateId, {
        note: providerUpdateNote,
        proposedServiceDate: isRescheduleRequest ? proposedServiceDate : "",
        proposedTimeSlot: isRescheduleRequest ? proposedTimeSlot : "",
      });
      setProviderUpdateId(null);
      setProviderUpdateNote("");
      setIsRescheduleRequest(false);
      setProviderUpdateSuccess(true);
    } catch (requestError) {
      setProviderUpdateError(requestError.message);
    }
  }

  const handleCashSettlementConfirmation = async (bookingId, confirmation) => {
    try {
      await confirmCashSettlement(bookingId, confirmation);
      await refreshBookings(undefined, true);
    } catch (requestError) {
      window.alert(requestError.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pt-16 text-slate-800">
      <Header showNav activeTab="Bookings" role="provider" />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-600">Provider dashboard</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Manage Bookings</h1>
          <p className="mt-2 text-sm text-slate-500">
            View incoming requests and manage your jobs.
          </p>
        </div>
        {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {isLoading && <p className="mb-4 text-sm text-slate-500">Loading bookings...</p>}

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-7">
          {[
            { label: "Total", value: stats.total, tone: "bg-white text-slate-700 border-slate-200" },
            { label: "Incoming", value: stats.incoming, tone: "bg-amber-50 text-amber-700 border-amber-100" },
            { label: "Active", value: stats.active, tone: "bg-emerald-50 text-emerald-700 border-emerald-100" },
            { label: "Completed", value: stats.completed, tone: "bg-blue-50 text-blue-700 border-blue-100" },
            { label: "Cancelled", value: stats.cancelled, tone: "bg-rose-50 text-rose-700 border-rose-100" },
            { label: "Declined", value: stats.declined, tone: "bg-rose-50 text-rose-800 border-rose-100" },
            { label: "Earnings", value: `₱${stats.earnings.toLocaleString()}`, tone: "bg-white text-slate-700 border-slate-200" },
          ].map((s) => (
            <div key={s.label} className={`rounded-2xl border ${s.tone} px-3 py-3 text-center shadow-sm`}>
              <p className="text-2xl font-bold tracking-tight">{s.value}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-current/75">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 pb-1 sm:grid-cols-3 lg:grid-cols-6">
          {tabs.map((tab) => {
            const count =
              tab.key === "All"
                ? requests.length + managedBookings.length
                : tab.key === "Incoming Requests"
                ? requests.length
                : tab.key === "Active"
                ? managedBookings.filter((booking) => ["Confirmed", "On the Way", "In Progress", "Cancellation Requested", "In Revision", "Disputed"].includes(booking.status)).length
                : tab.key === "Completed"
                ? managedBookings.filter((booking) => booking.status === "Completed").length
                : tab.key === "Declined"
                ? managedBookings.filter((booking) => booking.status === "Declined by Provider").length
                : managedBookings.filter((booking) => booking.status === "Cancelled").length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex min-h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-xs font-semibold transition sm:text-sm ${
                  activeTab === tab.key
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {tab.label}
                <span
                  className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                    activeTab === tab.key
                      ? "bg-white/15 text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
          </div>
          <label className="relative block w-full">
            <span className="sr-only">Search bookings</span>
            <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search client or repair" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400"><circle cx="10.8" cy="10.8" r="6.3" /><path strokeLinecap="round" d="m16 16 4.2 4.2" /></svg>
          </label>
        </div>

        {showBookings && filteredManagedBookings.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">My Bookings</h2>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="createdAt">Submitted: Newest</option>
              <option value="date">Service date: Earliest</option>
              <option value="price">Sort: Price</option>
              <option value="status">Sort: Status</option>
            </select>
          </div>
        )}

        {/* Incoming Requests */}
        {showIncoming && (
          <div className="mb-8">
            {requests.length > 0 ? (
              <>
                <h2 className="mb-4 text-lg font-semibold text-gray-900">
                  Incoming Requests
                  <span className="ml-2 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-amber-100 px-2 text-xs font-medium text-amber-700">
                    {requests.length}
                  </span>
                </h2>
                <div className="space-y-4">
                  {sortedRequests.map((req) => (
                    <div
                      key={req.id}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="p-5 sm:p-6">
                        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg font-bold text-amber-700 ring-1 ring-amber-200">
                              {req.client.charAt(0)}
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-slate-900">
                                {req.client}
                              </h3>
                              <p className="text-sm text-slate-500">
                                New booking request
                              </p>
                            </div>
                          </div>
                          <StatusBadge status="Pending Request" />
                        </div>

                        <div className="mt-4">
                          <h4 className="text-base font-bold text-slate-800">
                            {req.task}
                          </h4>
                          <p className="mt-1 text-sm leading-relaxed text-slate-500">
                            {req.description}
                          </p>
                          {req.photoUrls?.length > 0 && (
                            <div className="mt-3 flex gap-2">
                              {req.photoUrls.map((url) => <img key={url} src={url} alt="Repair item" className="h-16 w-16 rounded-lg object-cover" />)}
                            </div>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-slate-400">
                              <path fillRule="evenodd" d="M19.5 6.75a3 3 0 00-6 0v7.5a3 3 0 006 0V6.75zM3.75 9.75a3 3 0 016 0v7.5a3 3 0 01-6 0V9.75zM15.75 2.25a3 3 0 016 0v7.5a3 3 0 01-6 0V2.25z" clipRule="evenodd" />
                            </svg>
                            <span>{req.address}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-slate-400">
                              <path fillRule="evenodd" d="M19.5 6.75a3 3 0 00-6 0v7.5a3 3 0 006 0V6.75zM3.75 9.75a3 3 0 016 0v7.5a3 3 0 01-6 0V9.75zM15.75 2.25a3 3 0 016 0v7.5a3 3 0 01-6 0V2.25z" clipRule="evenodd" />
                            </svg>
                            <span>{req.date}</span>
                            <span className="text-slate-300">|</span>
                            <span>{req.time}</span>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl font-bold text-slate-900">{req.price}</span>
                            <button
                              onClick={() => setDetailId(req.id)}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Details
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setRejectingId(req.id)}
                              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                            >
                              Decline
                            </button>
                            <button
                              onClick={() => acceptRequest(req.id)}
                              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
                            >
                              Accept
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* My Bookings */}
        {showBookings && (
          <div>
            {filteredManagedBookings.length > 0 ? (
              <>
                <div className="space-y-4">
                  {sortedBookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="p-5 sm:p-6">
                        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-700 shadow-inner ring-1 ring-primary-200">
                              {booking.client.charAt(0)}
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-slate-900">
                                {booking.client}
                              </h3>
                              <p className="text-sm text-slate-500">Submitted {booking.createdAt ? new Date(booking.createdAt).toLocaleString() : ""}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <StatusDot status={booking.status} />
                            <StatusBadge status={booking.status} />
                            <button onClick={() => navigate(`/provider/messages?bookingId=${booking.id}`)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Chat</button>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(15rem,1fr)]">
                          <div className="min-w-0">
                          <BookingProgress status={booking.status} />
                          <h4 className="mt-4 text-base font-bold text-slate-800">
                            {booking.task}
                          </h4>
                          <p className="mt-1 text-sm leading-relaxed text-slate-500">
                            {booking.description}
                          </p>
                          {booking.status === "Cancellation Requested" && booking.cancellationExpiresAt && (
                            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                              Cancellation requested. Response due {new Date(booking.cancellationExpiresAt).toLocaleString()}.
                            </p>
                          )}
                          {booking.cancellationOutcome === "rejected" && (
                            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">The cancellation was declined. This booking remains active.</p>
                          )}
                          {booking.providerUpdates?.map((update) => (
                            <div key={update.id} className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-xs text-cyan-950">
                              <p className="font-semibold">Your update{update.type === "reschedule" ? " · Time change request" : ""} ({update.status})</p>
                              <p className="mt-1">{update.note}</p>
                              {update.type === "reschedule" && <p className="mt-1">Proposed: {new Date(update.proposedServiceDate).toLocaleDateString()} at {update.proposedTimeSlot}</p>}
                            </div>
                          ))}
                          {booking.status === "Completed" && booking.clientRating != null && (
                            <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-950">
                              <p className="font-semibold">Client review: <span aria-label={`${booking.clientRating} out of 5 stars`} className="inline-flex items-center gap-0.5">{[1, 2, 3, 4, 5].map((star) => (<span key={star} style={{ color: star <= Number(booking.clientRating || 0) ? "#fbbf24" : "#d1d5db", lineHeight: 1 }}>{"★"}</span>))}</span></p>
                              {booking.clientReview && <p className="mt-1">{booking.clientReview}</p>}
                              {booking.clientReviewPhotos?.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {booking.clientReviewPhotos.map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="Client review attachment" className="h-14 w-14 rounded-md object-cover" /></a>)}
                                </div>
                              )}
                            </div>
                          )}
                          {booking.photoUrls?.length > 0 && (
                            <div className="mt-3 flex gap-2">
                              {booking.photoUrls.map((url) => <img key={url} src={url} alt="Repair item" className="h-16 w-16 rounded-lg object-cover" />)}
                            </div>
                          )}
                        </div>

                          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                          <div className="flex items-start gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mt-0.5 h-4 w-4 text-slate-400">
                              <path fillRule="evenodd" d="M19.5 6.75a3 3 0 00-6 0v7.5a3 3 0 006 0V6.75zM3.75 9.75a3 3 0 016 0v7.5a3 3 0 01-6 0V9.75zM15.75 2.25a3 3 0 016 0v7.5a3 3 0 01-6 0V2.25z" clipRule="evenodd" />
                            </svg>
                            <AddressActions address={booking.address} />
                          </div>
                          <div className="flex items-start gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mt-0.5 h-4 w-4 text-slate-400">
                              <path fillRule="evenodd" d="M19.5 6.75a3 3 0 00-6 0v7.5a3 3 0 006 0V6.75zM3.75 9.75a3 3 0 016 0v7.5a3 3 0 01-6 0V9.75zM15.75 2.25a3 3 0 016 0v7.5a3 3 0 01-6 0V2.25z" clipRule="evenodd" />
                            </svg>
                            <span className="font-medium text-slate-800">{booking.date}</span>
                            <span className="text-slate-300">|</span>
                            <span>{booking.time}</span>
                          </div>
                          <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${booking.urgency === "Emergency" ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-700"}`}>
                            {booking.urgency || "Flexible"} service
                          </span>
                          </div>
                        </div>
                        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                          <BookingHistory events={booking.statusHistory} />
                        </div>

                        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <span><span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total</span><span className="text-2xl font-bold text-slate-900">{formatBookingTotal(booking)}</span></span>
                            <button
                              onClick={() => setDetailId(booking.id)}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              {booking.status === "In Revision" ? "Review revision" : "Details"}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {STATUS_ACTIONS[booking.status] && (
                              <button
                                onClick={() => STATUS_ACTIONS[booking.status].status === "complete"
                                  ? setCompletionBookingId(booking.id)
                                  : setStatusChange({ bookingId: booking.id, ...STATUS_ACTIONS[booking.status] })}
                                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
                              >
                                {STATUS_ACTIONS[booking.status].buttonLabel}
                              </button>
                            )}
                            {booking.status === "Confirmed" && (
                              <button
                                onClick={() => {
                                  setProviderUpdateId(booking.id);
                                  setProviderUpdateNote("");
                                  setProposedServiceDate(booking.serviceDate?.slice(0, 10) || "");
                                  setProposedTimeSlot(booking.timeSlot || TIME_SLOTS[0]);
                                  setIsRescheduleRequest(false);
                                  setProviderUpdateError("");
                                }}
                                className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-900 transition hover:bg-cyan-100"
                              >
                                Send Update
                              </button>
                            )}
                            {booking.paymentMethod === "cash" && ["Completed", "Settled"].includes(booking.status) && (
                              <button
                                type="button"
                                onClick={() => handleCashSettlementConfirmation(booking.id, "cash_received")}
                                disabled={Boolean(booking.cashReceivedConfirmedAt || booking.providerConfirmedCash) || !booking.cashPaidConfirmedAt}
                                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${booking.cashReceivedConfirmedAt || booking.providerConfirmedCash ? "cursor-not-allowed bg-emerald-100 text-emerald-800" : !booking.cashPaidConfirmedAt ? "cursor-not-allowed bg-gray-100 text-gray-500" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                              >
                                {booking.cashReceivedConfirmedAt || booking.providerConfirmedCash ? "Cash Received Confirmed" : !booking.cashPaidConfirmedAt ? "Waiting for client payment" : "Confirm Cash Received"}
                              </button>
                            )}
                            {canRequestCancellation(booking) ? (
                              <button
                                onClick={() => { setCancelingId(booking.id); setCancellationReason(""); }}
                                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                              >
                                Cancel
                              </button>
                            ) : getCancellationLockMessage(booking) && (
                              <button type="button" disabled title={getCancellationLockMessage(booking)} className="cursor-not-allowed rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500">Cancellation locked</button>
                            )}
                            {booking.status === "Cancellation Requested" && booking.cancellationRequestedBy === "client" && (
                              <>
                                <button
                                  onClick={() => handleCancellationResponse(booking.id, "reject")}
                                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                                >
                                  Reject Cancellation
                                </button>
                                <button
                                  onClick={() => handleCancellationResponse(booking.id, "approve")}
                                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                                >
                                  Approve Cancellation
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        )}

        {visibleBookingCount === 0 && !isLoading && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-base font-semibold text-gray-700">No bookings found</p>
            <p className="mt-1 text-sm text-gray-500">
              {activeTab === "Incoming Requests"
                ? "New client requests will appear here."
                : activeTab === "Active"
                ? "Confirmed active jobs will appear here."
                : activeTab === "Cancellation Requests"
                ? "Pending cancellation requests will appear here."
                : activeTab === "Completed"
                ? "Completed jobs will appear here."
                : activeTab === "Cancelled"
                ? "Canceled bookings will appear here."
                : activeTab === "Declined"
                ? "Requests declined by you will appear here."
                : "No requests or bookings are available yet."}
            </p>
            {activeTab !== "All" && (
              <button
                onClick={() => setActiveTab("All")}
                className="mt-4 rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-700"
              >
                View All
              </button>
            )}
          </div>
        )}
      </div>

      {/* Accept Confirmation Modal */}
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
          onConfirm={handleCancelBooking}
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
        bookingName={safeBookings.find((booking) => booking.id === completionBookingId)?.task}
        onSubmit={(note, photos) => submitCompletionProof(completionBookingId, note, photos)}
        onClose={() => setCompletionBookingId(null)}
      />}

      {providerUpdateId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setProviderUpdateId(null)}>
          <form onSubmit={handleSendProviderUpdate} className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900">Update the client</h2>
              <p className="mt-1 text-sm text-gray-500">Send a delay note or request a different appointment time before you head out.</p>
              <label htmlFor="provider-update-note" className="mt-4 block text-sm font-medium text-gray-700">Message to client</label>
              <textarea id="provider-update-note" value={providerUpdateNote} onChange={(event) => setProviderUpdateNote(event.target.value)} maxLength={500} rows={3} required placeholder="Explain the delay or schedule change" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30" />
              <label className="mt-4 flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={isRescheduleRequest} onChange={(event) => setIsRescheduleRequest(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600" />
                Request a new appointment time
              </label>
              {isRescheduleRequest && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium text-gray-700">Proposed date
                    <input type="date" value={proposedServiceDate} onChange={(event) => setProposedServiceDate(event.target.value)} required min={new Date().toISOString().slice(0, 10)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </label>
                  <label className="text-sm font-medium text-gray-700">Proposed time
                    <select value={proposedTimeSlot} onChange={(event) => setProposedTimeSlot(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                      {TIME_SLOTS.map((slot) => <option key={slot}>{slot}</option>)}
                    </select>
                  </label>
                </div>
              )}
              {providerUpdateError && <p role="alert" className="mt-3 text-sm text-red-700">{providerUpdateError}</p>}
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => setProviderUpdateId(null)} className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-700">Cancel</button>
                <button type="submit" disabled={!providerUpdateNote.trim() || (isRescheduleRequest && !proposedServiceDate)} className="flex-1 rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Send to client</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {providerUpdateSuccess && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setProviderUpdateSuccess(false)}>
          <section role="dialog" aria-modal="true" className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-lg font-bold text-gray-900">Update sent to client</p>
            <button onClick={() => setProviderUpdateSuccess(false)} className="mt-5 w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white">Done</button>
          </section>
        </div>
      )}

      {/* Decline Confirmation */}
      {rejectingId && (
        <StatusChangeConfirmation
          nextStatus="Declined by Provider"
          onConfirm={() => updateBookingStatus(rejectingId, "declined")}
          onClose={() => setRejectingId(null)}
        />
      )}

      {/* Detail Modal */}
      {detailItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetailId(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <div className="relative h-28 bg-gradient-to-r from-primary-500 to-primary-700">
                <div className="absolute -bottom-10 left-6">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white text-2xl font-bold bg-primary-100 text-primary-700">
                    {detailItem.client.charAt(0)}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDetailId(null)}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-gray-500 transition hover:bg-white hover:text-gray-700"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <div className="px-6 pt-12 pb-6">
              <h2 className="text-xl font-bold text-gray-900">{detailItem.client}</h2>
              <p className="text-sm text-gray-500">{detailItem.task}</p>
              <div className="mt-3 flex items-center gap-2">
                {detailItem.status ? (
                  <>
                    <StatusDot status={detailItem.status} />
                    <StatusBadge status={detailItem.status} />
                  </>
                ) : (
                  <StatusBadge status="Pending Request" />
                )}
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-500">Description</span>
                  <span className="text-right text-gray-700">{detailItem.description}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-500">Address</span>
                  <span className="font-medium text-gray-800">{detailItem.address}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-500">Date &amp; Time</span>
                  <span className="font-medium text-gray-800">{detailItem.date} at {detailItem.time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Price</span>
                  <span className="font-bold text-gray-900">{detailItem.price}</span>
                </div>
              </div>
              <RevisionReviewPanel booking={detailItem} />

              <div className="mt-6 flex gap-2">
                <button
                  onClick={() => {
                    setDetailId(null);
                    navigate(`/provider/messages?bookingId=${detailItem.id}`);
                  }}
                  className="flex-1 rounded-lg bg-purple-600 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700"
                >
                  Chat Client
                </button>
                {canRequestCancellation(detailItem) && (
                  <button
                    onClick={() => {
                      setDetailId(null);
                      setCancelingId(detailItem.id);
                      setCancellationReason("");
                    }}
                    className="flex-1 rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
