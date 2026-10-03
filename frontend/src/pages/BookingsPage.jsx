import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header.jsx";
import { useBookings } from "../context/BookingContext.jsx";
import BookingProgress from "../components/BookingProgress.jsx";
import BookingHistory from "../components/BookingHistory.jsx";
import AddressActions from "../components/AddressActions.jsx";
import { canRequestCancellation, getCancellationLockMessage } from "../utils/bookingCancellation.js";
import StatusChangeConfirmation from "../components/StatusChangeConfirmation.jsx";
import RevisionRequestModal from "../components/RevisionRequestModal.jsx";
import RequestBookingModal from "../components/RequestBookingModal.jsx";

const tabs = ["All", "Pending", "Active", "Completed", "Cancelled", "Declined"];

function isCompletedLikeStatus(status) {
  return status === "Completed" || status === "Settled";
}

function formatBookingTotal(booking) {
  const amount = Number(booking.totalPrice ?? booking.offeredPrice ?? booking.offer);
  return Number.isFinite(amount) ? `₱${amount.toLocaleString("en-PH", { maximumFractionDigits: 2 })}` : String(booking.price || "").replace(/^P/, "₱");
}

function formatPhpAmount(amount) {
  return `₱${Number(amount || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

function canRequestRevision(booking) {
  const revisions = booking?.revisionRequests || [];
  return isCompletedLikeStatus(booking?.status)
    && !booking.cashReceipt?.receiptNumber
    && revisions.length < 2
    && !revisions.some((revision) => ["open", "accepted"].includes(revision.status));
}

function hasMutualSettlement(booking) {
  return Boolean((booking?.clientConfirmedCash || booking?.cashPaidConfirmedAt) && (booking?.providerConfirmedCash || booking?.cashReceivedConfirmedAt));
}

function revisionLimitReached(booking) {
  return isCompletedLikeStatus(booking?.status)
    && !booking.cashReceipt?.receiptNumber
    && (booking.revisionRequests || []).length >= 2;
}

function StatusBadge({ status }) {
  const colors = {
    "Pending Request": "bg-amber-100 text-amber-700 border-amber-200",
    Confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    "On the Way": "bg-cyan-100 text-cyan-800 border-cyan-200",
    "In Progress": "bg-violet-100 text-violet-700 border-violet-200",
    Completed: "bg-blue-100 text-blue-700 border-blue-200",
    Settled: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Cancelled: "bg-red-100 text-red-700 border-red-200",
    "Declined by Provider": "bg-rose-100 text-rose-800 border-rose-200",
    "Cancellation Requested": "bg-amber-100 text-amber-700 border-amber-200",
    "In Revision": "bg-amber-100 text-amber-800 border-amber-200",
    Disputed: "bg-rose-100 text-rose-700 border-rose-200",
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
    "On the Way": "bg-cyan-500",
    "In Progress": "bg-purple-500",
    Completed: "bg-blue-500",
    Settled: "bg-emerald-500",
    Cancelled: "bg-red-500",
    "Declined by Provider": "bg-rose-600",
    "Cancellation Requested": "bg-amber-500",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        colors[status] || "bg-gray-400"
      }`}
    />
  );
}

export default function BookingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedBookingId = searchParams.get("bookingId");
  const [activeTab, setActiveTab] = useState("All");
  const { bookings, isLoading, error, requestCancellation, requestRevision, submitReview, respondToProviderUpdate, refreshBookings, confirmCashSettlement, createBooking } = useBookings();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [cancelingId, setCancelingId] = useState(null);
  const [revisioningId, setRevisioningId] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewPhotos, setReviewPhotos] = useState([]);
  const [reviewSuccessOpen, setReviewSuccessOpen] = useState(false);
  const [rebookingBooking, setRebookingBooking] = useState(null);

  const stats = useMemo(() => {
    const total = bookings.length;
    const pending = bookings.filter((b) => b.status === "Pending Request").length;
    const active = bookings.filter((b) => ["Confirmed", "On the Way", "In Progress"].includes(b.status)).length;
    const completed = bookings.filter((b) => isCompletedLikeStatus(b.status)).length;
    const cancelled = bookings.filter((b) => b.status === "Cancelled").length;
    const declined = bookings.filter((b) => ["Declined", "Declined by Provider"].includes(b.status)).length;
    return { total, pending, active, completed, cancelled, declined };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let result = bookings.filter((booking) => {
      const matchesSearch = !query || [booking.worker, booking.cred, booking.task, booking.description]
        .some((value) => String(value || "").toLowerCase().includes(query));
      const matchesTab = activeTab === "All"
        || (activeTab === "Pending" && booking.status === "Pending Request")
        || (activeTab === "Active" && ["Confirmed", "On the Way", "In Progress", "Cancellation Requested", "In Revision", "Disputed"].includes(booking.status))
        || (activeTab === "Completed" && isCompletedLikeStatus(booking.status))
        || (activeTab === "Cancelled" && booking.status === "Cancelled")
        || (activeTab === "Declined" && booking.status === "Declined by Provider");
      return matchesSearch && matchesTab;
    });
    const sorted = [...result];
    if (sortBy === "createdAt") {
      sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } else if (sortBy === "price") {
      sorted.sort(
        (a, b) =>
          parseInt(b.price.replace(/[^0-9]/g, "")) -
          parseInt(a.price.replace(/[^0-9]/g, ""))
      );
    } else if (sortBy === "status") {
      const order = {
        "Pending Request": 0,
        Confirmed: 1,
        Completed: 2,
        Settled: 2,
        Cancelled: 3,
        "Declined by Provider": 4,
        "Cancellation Requested": 5,
      };
      sorted.sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));
    }
    return sorted;
  }, [bookings, activeTab, searchQuery, sortBy]);

  const tabCounts = {
    All: bookings.length,
    Pending: stats.pending,
    Active: stats.active,
    Completed: stats.completed,
    Cancelled: stats.cancelled,
    Declined: stats.declined,
  };

  const detailBooking = bookings.find((b) => b.id === detailId) || null;
  const cancelBooking = bookings.find((b) => b.id === cancelingId);
  const cancelBookingNeedsReason = Boolean(cancelBooking && Date.now() - new Date(cancelBooking.createdAt).getTime() >= 10 * 60 * 1000);
  const revisionBooking = bookings.find((booking) => booking.id === revisioningId) || null;
  const reviewingBooking = bookings.find((b) => b.id === reviewingId);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (requestedBookingId && bookings.some((booking) => booking.id === requestedBookingId)) {
      setDetailId(requestedBookingId);
    }
  }, [bookings, requestedBookingId]);

  const handleCancel = async () => {
    if (!cancelingId || !cancelBooking || !canRequestCancellation(cancelBooking)) {
      throw new Error(cancelBooking ? getCancellationLockMessage(cancelBooking) || "Cancellation is only available while the booking is pending or confirmed." : "This booking is no longer available.");
    }
    await requestCancellation(cancelingId, "request", cancellationReason);
    setCancelingId(null);
    setCancellationReason("");
  };

  const handleCancellationResponse = async (id, action) => {
    try {
      await requestCancellation(id, action);
    } catch (requestError) {
      window.alert(requestError.message);
    }
  };

  const handleRequestRevision = async (note, photos) => {
    if (!revisioningId) throw new Error("Choose a completed booking first.");
    await requestRevision(revisioningId, note, photos);
    setRevisioningId(null);
  };

  const handleSubmitReview = async (event) => {
    event.preventDefault();
    if (!reviewingId) return;
    try {
      await submitReview(reviewingId, reviewRating, reviewText, reviewPhotos);
      setReviewingId(null);
      setReviewRating(5);
      setReviewText("");
      setReviewPhotos([]);
      setReviewSuccessOpen(true);
    } catch (requestError) {
      window.alert(requestError.message);
    }
  };

  const handleProviderUpdateResponse = async (bookingId, updateId, action) => {
    try {
      await respondToProviderUpdate(bookingId, updateId, action);
    } catch (requestError) {
      window.alert(requestError.message);
    }
  };

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
      <Header showNav activeTab="Bookings" />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-600">Your activity</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">My Bookings</h1>
          <p className="mt-2 text-sm text-slate-500">
            View and manage your service bookings in one place.
          </p>
        </div>
        {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {isLoading && <p className="mb-4 text-sm text-slate-500">Loading bookings...</p>}

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-6">
          {[
            { label: "Total", value: stats.total, tone: "bg-white text-slate-700 border-slate-200" },
            { label: "Pending", value: stats.pending, tone: "bg-amber-50 text-amber-700 border-amber-100" },
            { label: "Active", value: stats.active, tone: "bg-emerald-50 text-emerald-700 border-emerald-100" },
            { label: "Completed", value: stats.completed, tone: "bg-blue-50 text-blue-700 border-blue-100" },
            { label: "Cancelled", value: stats.cancelled, tone: "bg-rose-50 text-rose-700 border-rose-100" },
            { label: "Declined", value: stats.declined, tone: "bg-rose-50 text-rose-800 border-rose-100" },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-2xl border ${s.tone} px-4 py-3 text-center shadow-sm`}
            >
              <p className="text-2xl font-bold tracking-tight">{s.value}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-current/75">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 pb-1 sm:grid-cols-3 lg:grid-cols-6">
            {tabs.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold transition sm:text-sm ${activeTab === tab ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
                {tab}
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${activeTab === tab ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>{tabCounts[tab]}</span>
              </button>
            ))}
          </div>
          <label className="relative block w-full">
            <span className="sr-only">Search bookings</span>
            <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search provider or repair" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400"><circle cx="10.8" cy="10.8" r="6.3" /><path strokeLinecap="round" d="m16 16 4.2 4.2" /></svg>
          </label>
        </div>

        <div className="mb-4 flex justify-end">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="createdAt">Submitted: Newest</option>
            <option value="price">Sort: Price</option>
            <option value="status">Sort: Status</option>
          </select>
        </div>

        {/* Bookings List */}
        <div className="space-y-4">
          {filteredBookings.length > 0 ? (
            filteredBookings.map((booking) => (
              <div
                key={booking.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-bold shadow-inner ring-1 ring-primary-200 ${booking.workerProfileImage ? "bg-white" : "bg-primary-100 text-primary-700"}`}>
                        {booking.workerProfileImage ? (
                          <img src={booking.workerProfileImage} alt={`${booking.worker} profile`} className="h-full w-full object-cover" />
                        ) : booking.worker.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">
                          {booking.worker}
                        </h3>
                        <p className="text-sm text-slate-500">{booking.cred}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <StatusDot status={booking.status} />
                      <StatusBadge status={booking.status} />
                      <button onClick={() => navigate(`/client/messages?bookingId=${booking.id}`)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Chat</button>
                    </div>
                  </div>
                  <div className="mt-4">
                    <BookingProgress status={booking.status} />
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(15rem,1fr)]">
                    <div className="min-w-0">
                    <h4 className="text-base font-bold text-slate-800">
                      {booking.task}
                    </h4>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500">
                      {booking.description}
                    </p>
                          {booking.status === "Cancellation Requested" && booking.cancellationExpiresAt && (
                            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                              Cancellation requested. Response due {new Date(booking.cancellationExpiresAt).toLocaleString()}.
                            </p>
                          )}
                          {booking.cancellationOutcome === "rejected" && (
                            <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">The cancellation was declined. This booking remains active.</p>
                          )}
                          {isCompletedLikeStatus(booking.status) && booking.clientRating == null && (
                            <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">Task complete. Share a review of your service.</p>
                          )}
                          {booking.clientRating != null && (
                            <p className="mt-2 text-xs font-medium text-amber-700">Your review: <span className="inline-flex items-center gap-0.5">{[1, 2, 3, 4, 5].map((star) => (<span key={star} style={{ color: star <= Number(booking.clientRating || 0) ? "#fbbf24" : "#d1d5db", lineHeight: 1 }}>{"★"}</span>))}</span>{booking.clientReview ? ` · ${booking.clientReview}` : ""}</p>
                          )}
                          {booking.clientReviewPhotos?.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {booking.clientReviewPhotos.map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="Photo attached to your review" className="h-16 w-16 rounded-md object-cover" /></a>)}
                            </div>
                          )}
                          {booking.providerUpdates?.map((update) => (
                            <div key={update.id} className="mt-3 rounded-md border border-cyan-100 bg-cyan-50 p-3 text-xs text-cyan-950">
                              <p className="font-semibold">Provider update{update.type === "reschedule" ? " · Time change requested" : ""}</p>
                              <p className="mt-1">{update.note}</p>
                              {update.type === "reschedule" && (
                                <>
                                  <p className="mt-1">Proposed: {new Date(update.proposedServiceDate).toLocaleDateString()} at {update.proposedTimeSlot}</p>
                                  {update.status === "pending" && booking.status === "Confirmed" ? (
                                    <div className="mt-2 flex gap-2">
                                      <button onClick={() => handleProviderUpdateResponse(booking.id, update.id, "accept")} className="rounded border border-cyan-300 bg-white px-2.5 py-1 font-semibold">Accept time</button>
                                      <button onClick={() => handleProviderUpdateResponse(booking.id, update.id, "reject")} className="rounded border border-cyan-300 bg-white px-2.5 py-1 font-semibold">Keep current time</button>
                                    </div>
                                  ) : update.status !== "pending" && <p className="mt-1 font-medium">Request {update.status}.</p>}
                                </>
                              )}
                            </div>
                          ))}
                    {booking.photoUrls?.length > 0 && (
                      <div className="mt-3 flex gap-2">
                        {booking.photoUrls.map((url) => <img key={url} src={url} alt="Repair item" className="h-16 w-16 rounded-lg object-cover" />)}
                      </div>
                    )}
                    </div>
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <div className="flex items-start gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="mt-0.5 h-4 w-4 text-slate-400"
                      >
                        <path
                          fillRule="evenodd"
                          d="M19.5 6.75a3 3 0 00-6 0v7.5a3 3 0 006 0V6.75zM3.75 9.75a3 3 0 016 0v7.5a3 3 0 01-6 0V9.75zM15.75 2.25a3 3 0 016 0v7.5a3 3 0 01-6 0V2.25z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="font-medium text-slate-800">{booking.date}</span>
                      <span className="text-slate-300">|</span>
                      <span>{booking.time}</span>
                    </div>
                    {booking.createdAt && <p className="pl-6 text-xs text-slate-500">Submitted {new Date(booking.createdAt).toLocaleString()}</p>}
                    <div className="flex items-start gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="mt-0.5 h-4 w-4 text-slate-400"
                      >
                        <path
                          fillRule="evenodd"
                          d="M11.54 22.35l.07.04.03.02.04.01-.04-.01-.03-.02-.07-.04zm-.91-.65A7.5 7.5 0 0019.5 12c0-3.04-1.96-5.64-4.63-6.86a.75.75 0 00-.74 0A7.49 7.49 0 004.5 12c0 3.95 3.23 7.14 6.91 7.64l.07.04.03.02a1.25 1.25 0 00.42.08l.04-.01-.04.01a1.25 1.25 0 00.42-.08l.03-.02.07-.04z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <AddressActions address={booking.address} />
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
                    <div><span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total</span><span className="text-2xl font-bold text-slate-900">{formatBookingTotal(booking)}</span></div>
                    <div className="flex flex-wrap gap-2">
                      {canRequestCancellation(booking) ? (
                        <button
                          onClick={() => setCancelingId(booking.id)}
                          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                        >
                          Cancel
                        </button>
                      ) : booking.status !== "Completed" && getCancellationLockMessage(booking) && (
                        <button type="button" disabled title={getCancellationLockMessage(booking)} className="cursor-not-allowed rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500">Cancellation locked</button>
                      )}
                      {isCompletedLikeStatus(booking.status) && (
                        <>
                          {canRequestRevision(booking) && <button type="button" onClick={() => setRevisioningId(booking.id)} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">Request Revision</button>}
                          {revisionLimitReached(booking) && <span className="self-center text-xs font-medium text-amber-800">Revision limit reached</span>}
                          {booking.paymentMethod === "cash" && isCompletedLikeStatus(booking.status) && (
                            <button
                              type="button"
                              onClick={() => handleCashSettlementConfirmation(booking.id, "cash_paid")}
                              disabled={Boolean(booking.cashPaidConfirmedAt || booking.clientConfirmedCash)}
                              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${booking.cashPaidConfirmedAt || booking.clientConfirmedCash ? "cursor-not-allowed bg-emerald-100 text-emerald-800" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                            >
                              {booking.cashPaidConfirmedAt || booking.clientConfirmedCash ? "Cash Paid Confirmed" : "Confirm Cash Paid"}
                            </button>
                          )}
                          {booking.clientRating == null && hasMutualSettlement(booking) && (
                            <button onClick={() => { setReviewingId(booking.id); setReviewRating(5); setReviewText(""); }} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700">
                              Rate Provider
                            </button>
                          )}
                        </>
                      )}
                      {(isCompletedLikeStatus(booking.status) || booking.status === "Cancelled") && (
                        <button type="button" onClick={() => setRebookingBooking(booking)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">Rebook</button>
                      )}
                      {booking.status === "Cancellation Requested" && booking.cancellationRequestedBy === "provider" && (
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
                      {["Pending Request", "Confirmed", "On the Way", "In Progress"].includes(booking.status) && (
                        <button
                          onClick={() => setDetailId(booking.id)}
                          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          Details
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-base font-semibold text-gray-700">
                No bookings found
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {activeTab !== "All"
                  ? `You have no ${activeTab.toLowerCase()} bookings`
                  : "No bookings yet"}
              </p>
              {activeTab !== "All" && (
                <button
                  onClick={() => setActiveTab("All")}
                  className="mt-4 rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-700"
                >
                  View All Bookings
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {cancelingId && cancelBooking && canRequestCancellation(cancelBooking) && (
        <StatusChangeConfirmation
          nextStatus="Cancelled"
          canConfirm={!cancelBookingNeedsReason || Boolean(cancellationReason.trim())}
          onConfirm={handleCancel}
          onClose={() => setCancelingId(null)}
        >
          <p className="mt-2 text-sm text-gray-500">Are you sure you want to cancel <span className="font-semibold text-gray-700">{cancelBooking.task}</span> with {cancelBooking.worker}? This action cannot be undone.</p>
          {cancelBookingNeedsReason && (
            <div className="mt-4">
              <label htmlFor="client-cancellation-reason" className="mb-1.5 block text-sm font-medium text-gray-700">Reason for cancellation</label>
              <textarea id="client-cancellation-reason" value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} maxLength={500} rows={3} required placeholder="Tell the provider why you need to cancel" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30" />
              <p className="mt-1 text-xs text-gray-500">A cancellation request will be sent to the provider for approval.</p>
            </div>
          )}
        </StatusChangeConfirmation>
      )}
      {revisionBooking && canRequestRevision(revisionBooking) && (
        <RevisionRequestModal
          booking={revisionBooking}
          revisionCount={(revisionBooking.revisionRequests || []).length}
          onSubmit={handleRequestRevision}
          onClose={() => setRevisioningId(null)}
        />
      )}

      {reviewingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReviewingId(null)}>
          <form onSubmit={handleSubmitReview} className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900">How was your service?</h2>
              <p className="mt-1 text-sm text-gray-500">{reviewingBooking.task} with {reviewingBooking.worker}</p>
              <label htmlFor="client-review-rating" className="mt-5 block text-sm font-medium text-gray-700">Rating</label>
              <div className="mt-2 flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    aria-label={`Rate ${star} out of 5`}
                    className="text-3xl leading-none transition hover:scale-110 focus:outline-none"
                  >
                    <span className={star <= reviewRating ? "text-amber-500" : "text-gray-300"}>★</span>
                  </button>
                ))}
              </div>
              <label htmlFor="client-review-text" className="mt-4 block text-sm font-medium text-gray-700">Review (optional)</label>
              <textarea id="client-review-text" value={reviewText} onChange={(event) => setReviewText(event.target.value)} maxLength={1000} rows={4} placeholder="Share a few details about the service" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30" />
              <label htmlFor="client-review-photos" className="mt-4 block text-sm font-medium text-gray-700">Photos (up to 5)</label>
              <input id="client-review-photos" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(event) => setReviewPhotos(Array.from(event.target.files || []).slice(0, 5))} className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-xs file:font-semibold" />
              {reviewPhotos.length > 0 && <p className="mt-1 text-xs text-gray-500">{reviewPhotos.length} photo{reviewPhotos.length === 1 ? "" : "s"} selected (5 MB maximum each).</p>}
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => setReviewingId(null)} className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-700">Not now</button>
                <button type="submit" className="flex-1 rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white">Submit Review</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {reviewSuccessOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => { setReviewSuccessOpen(false); refreshBookings(undefined, true); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="review-success-title" className="w-full max-w-sm rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700" aria-hidden="true">✓</div>
              <h2 id="review-success-title" className="mt-4 text-lg font-bold text-gray-900">Review successfully submitted! Thank you for your feedback.</h2>
              <button onClick={() => { setReviewSuccessOpen(false); refreshBookings(undefined, true); }} className="mt-6 w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white">Done</button>
            </div>
          </section>
        </div>
      )}

      {rebookingBooking && (
        <RequestBookingModal
          key={rebookingBooking.id}
          provider={{
            _id: rebookingBooking.providerId,
            fullName: rebookingBooking.worker,
            professions: [rebookingBooking.cred].filter(Boolean),
            address: rebookingBooking.address,
          }}
          initialValues={{
            task: rebookingBooking.description || rebookingBooking.task,
            offer: rebookingBooking.offeredPrice ?? rebookingBooking.offer ?? "",
            urgency: rebookingBooking.urgency || "Flexible",
          }}
          onClose={() => setRebookingBooking(null)}
          onSubmit={createBooking}
        />
      )}

      {/* Booking Detail Modal */}
      {detailBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetailId(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <div className="relative h-28 bg-gradient-to-r from-purple-500 to-indigo-600">
                <div className="absolute -bottom-10 left-6">
                  <div className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-white text-2xl font-bold ${detailBooking.workerProfileImage ? "bg-white" : "bg-primary-100 text-primary-700"}`}>
                    {detailBooking.workerProfileImage ? (
                      <img src={detailBooking.workerProfileImage} alt={`${detailBooking.worker} profile`} className="h-full w-full object-cover" />
                    ) : detailBooking.worker.charAt(0)}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDetailId(null)}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-gray-500 transition hover:bg-white hover:text-gray-700"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
            <div className="px-6 pt-12 pb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {detailBooking.worker}
              </h2>
              <p className="text-sm text-gray-500">{detailBooking.cred}</p>
              <div className="mt-3 flex items-center gap-2">
                <StatusDot status={detailBooking.status} />
                <StatusBadge status={detailBooking.status} />
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-500">Service</span>
                  <span className="font-medium text-gray-800">
                    {detailBooking.task}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-500">Date &amp; Time</span>
                  <span className="font-medium text-gray-800">
                    {detailBooking.date} at {detailBooking.time}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-500">Address</span>
                  <span className="font-medium text-gray-800">
                    {detailBooking.address}
                  </span>
                </div>
                <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">Price breakdown</h3>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-gray-600">Task offer</dt><dd className="font-medium tabular-nums text-gray-900">{formatPhpAmount(detailBooking.offeredPrice ?? detailBooking.offer)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gray-600">Travel fare <span className="block text-xs text-gray-500">{detailBooking.travelDistanceKm == null ? "Distance not recorded" : `${Number(detailBooking.travelDistanceKm).toFixed(2)} km · ₱20 first 2 km + ₱10/km after`}</span></dt><dd className="font-medium tabular-nums text-gray-900">{formatPhpAmount(detailBooking.travelFee)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gray-600">Optional tip</dt><dd className="font-medium tabular-nums text-gray-900">{formatPhpAmount(detailBooking.tipAmount)}</dd></div>
                  </dl>
                  <div className="mt-3 flex justify-between gap-3 border-t border-gray-200 pt-3"><dt className="font-semibold text-gray-800">Total amount due</dt><dd className="font-bold tabular-nums text-gray-950">{formatPhpAmount(detailBooking.totalPrice ?? detailBooking.offeredPrice ?? detailBooking.offer)}</dd></div>
                </section>
                <div className="flex justify-between">
                  <span className="text-gray-500">Description</span>
                  <span className="text-right text-gray-700">
                    {detailBooking.description}
                  </span>
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  onClick={() => {
                    setDetailId(null);
                    navigate(`/client/messages?bookingId=${detailBooking.id}`);
                  }}
                  className="flex-1 rounded-lg bg-purple-600 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700"
                >
                  Chat Provider
                </button>
                {canRequestRevision(detailBooking) && (
                  <button type="button" onClick={() => { setDetailId(null); setRevisioningId(detailBooking.id); }} className="flex-1 rounded-lg border border-amber-200 bg-amber-50 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100">Request Revision</button>
                )}
                {canRequestCancellation(detailBooking) ? (
                  <button
                    onClick={() => {
                      setDetailId(null);
                      setCancelingId(detailBooking.id);
                    }}
                    className="flex-1 rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                  >
                    Cancel
                  </button>
                ) : detailBooking.status !== "Completed" && getCancellationLockMessage(detailBooking) && (
                  <button type="button" disabled title={getCancellationLockMessage(detailBooking)} className="flex-1 cursor-not-allowed rounded-lg bg-gray-100 py-2.5 text-sm font-medium text-gray-500">Cancellation locked</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
