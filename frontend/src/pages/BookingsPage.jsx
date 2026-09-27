import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import { useBookings } from "../context/BookingContext.jsx";
import BookingProgress from "../components/BookingProgress.jsx";
import BookingHistory from "../components/BookingHistory.jsx";
import AddressActions from "../components/AddressActions.jsx";

const tabs = ["All", "Pending", "Active", "Completed", "Cancelled"];

function formatBookingTotal(booking) {
  const amount = Number(booking.offeredPrice ?? booking.offer);
  return Number.isFinite(amount) ? `₱${amount.toLocaleString()}` : String(booking.price || "").replace(/^P/, "₱");
}

function StatusBadge({ status }) {
  const colors = {
    "Pending Request": "bg-amber-100 text-amber-700 border-amber-200",
    Confirmed: "bg-green-100 text-green-700 border-green-200",
    "On the Way": "bg-cyan-100 text-cyan-800 border-cyan-200",
    "In Progress": "bg-purple-100 text-purple-700 border-purple-200",
    Completed: "bg-blue-100 text-blue-700 border-blue-200",
    Cancelled: "bg-red-100 text-red-700 border-red-200",
    Declined: "bg-red-100 text-red-700 border-red-200",
    "Cancellation Requested": "bg-amber-100 text-amber-700 border-amber-200",
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

function StatusDot({ status }) {
  const colors = {
    "Pending Request": "bg-amber-500",
    Confirmed: "bg-green-500",
    "On the Way": "bg-cyan-500",
    "In Progress": "bg-purple-500",
    Completed: "bg-blue-500",
    Cancelled: "bg-red-500",
    Declined: "bg-red-500",
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
  const [activeTab, setActiveTab] = useState("All");
  const { bookings, isLoading, error, requestCancellation, submitReview, respondToProviderUpdate, refreshBookings } = useBookings();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [cancelingId, setCancelingId] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewPhotos, setReviewPhotos] = useState([]);
  const [reviewSuccessOpen, setReviewSuccessOpen] = useState(false);

  const stats = useMemo(() => {
    const total = bookings.length;
    const pending = bookings.filter((b) => b.status === "Pending Request").length;
    const active = bookings.filter((b) => ["Confirmed", "On the Way", "In Progress"].includes(b.status)).length;
    const completed = bookings.filter((b) => b.status === "Completed").length;
    const cancelled = bookings.filter((b) => b.status === "Cancelled").length;
    const declined = bookings.filter((b) => b.status === "Declined").length;
    return { total, pending, active, completed, cancelled, declined };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let result = bookings.filter((booking) => {
      const matchesSearch = !query || [booking.worker, booking.cred, booking.task, booking.description]
        .some((value) => String(value || "").toLowerCase().includes(query));
      const matchesTab = activeTab === "All"
        || (activeTab === "Pending" && booking.status === "Pending Request")
        || (activeTab === "Active" && ["Confirmed", "On the Way", "In Progress", "Cancellation Requested"].includes(booking.status))
        || (activeTab === "Completed" && booking.status === "Completed")
        || (activeTab === "Cancelled" && ["Cancelled", "Declined"].includes(booking.status));
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
        Cancelled: 3,
        Declined: 4,
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
    Cancelled: stats.cancelled + stats.declined,
  };

  const detailBooking = bookings.find((b) => b.id === detailId) || null;
  const cancelBooking = bookings.find((b) => b.id === cancelingId);
  const reviewingBooking = bookings.find((b) => b.id === reviewingId);

  const handleCancel = async () => {
    if (!cancelingId) return;
    try {
      await requestCancellation(cancelingId, "request", cancellationReason);
    } catch (requestError) {
      window.alert(requestError.message);
      return;
    }
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

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <Header showNav activeTab="Bookings" />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Bookings</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage your service bookings
          </p>
        </div>
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {isLoading && <p className="mb-4 text-sm text-gray-500">Loading bookings...</p>}

        {/* Summary Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Total", value: stats.total, color: "bg-gray-100 text-gray-700" },
            { label: "Pending", value: stats.pending, color: "bg-amber-50 text-amber-700" },
            { label: "Active", value: stats.active, color: "bg-green-50 text-green-700" },
            { label: "Completed", value: stats.completed, color: "bg-blue-50 text-blue-700" },
            { label: "Cancelled", value: stats.cancelled, color: "bg-red-50 text-red-700" },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-xl ${s.color} px-4 py-3 text-center`}
            >
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs font-medium opacity-80">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${activeTab === tab ? "bg-gray-900 text-white" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"}`}>
                {tab}
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${activeTab === tab ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>{tabCounts[tab]}</span>
              </button>
            ))}
          </div>
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">Search bookings</span>
            <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search provider or repair" className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400"><circle cx="10.8" cy="10.8" r="6.3" /><path strokeLinecap="round" d="m16 16 4.2 4.2" /></svg>
          </label>
        </div>

        <div className="mb-4 flex justify-end">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-purple-500"
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
                className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-700">
                        {booking.worker.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">
                          {booking.worker}
                        </h3>
                        <p className="text-sm text-gray-500">{booking.cred}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <StatusDot status={booking.status} />
                      <StatusBadge status={booking.status} />
                      <button onClick={() => navigate("/messages")} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Contact</button>
                    </div>
                  </div>
                  <BookingProgress status={booking.status} />

                  <div className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 md:grid-cols-[minmax(0,1.5fr)_minmax(14rem,1fr)]">
                    <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-gray-800">
                      {booking.task}
                    </h4>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500">
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
                          {booking.status === "Completed" && booking.clientRating == null && (
                            <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">Task complete. Share a review of your service.</p>
                          )}
                          {booking.clientRating != null && (
                            <p className="mt-2 text-xs font-medium text-amber-700">Your review: {"★".repeat(booking.clientRating)}{"☆".repeat(5 - booking.clientRating)}{booking.clientReview ? ` · ${booking.clientReview}` : ""}</p>
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
                    <div className="space-y-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
                    <div className="flex items-start gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="h-4 w-4 text-gray-400"
                      >
                        <path
                          fillRule="evenodd"
                          d="M19.5 6.75a3 3 0 00-6 0v7.5a3 3 0 006 0V6.75zM3.75 9.75a3 3 0 016 0v7.5a3 3 0 01-6 0V9.75zM15.75 2.25a3 3 0 016 0v7.5a3 3 0 01-6 0V2.25z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>{booking.date}</span>
                      <span className="text-gray-300">|</span>
                      <span>{booking.time}</span>
                    </div>
                    {booking.createdAt && <p className="pl-6 text-xs text-gray-500">Submitted {new Date(booking.createdAt).toLocaleString()}</p>}
                    <div className="flex items-start gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="h-4 w-4 text-gray-400"
                      >
                        <path
                          fillRule="evenodd"
                          d="M11.54 22.35l.07.04.03.02.04.01-.04-.01-.03-.02-.07-.04zm-.91-.65A7.5 7.5 0 0019.5 12c0-3.04-1.96-5.64-4.63-6.86a.75.75 0 00-.74 0A7.49 7.49 0 004.5 12c0 3.95 3.23 7.14 6.91 7.64l.07.04.03.02a1.25 1.25 0 00.42.08l.04-.01-.04.01a1.25 1.25 0 00.42-.08l.03-.02.07-.04z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <AddressActions address={booking.address} />
                    </div>
                    <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${booking.urgency === "Emergency" ? "bg-red-100 text-red-700" : "bg-gray-200 text-gray-700"}`}>
                      {booking.urgency || "Flexible"} service
                    </span>
                  </div>
                  </div>
                  <BookingHistory events={booking.statusHistory} />

                  <div className="mt-5 flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><span className="block text-xs font-medium text-gray-500">Total</span><span className="text-xl font-bold text-gray-900">{formatBookingTotal(booking)}</span></div>
                    <div className="flex flex-wrap gap-2">
                      {["Pending Request", "Confirmed", "On the Way", "In Progress"].includes(booking.status) && (
                        <button
                          onClick={() => setCancelingId(booking.id)}
                          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                        >
                          Cancel
                        </button>
                      )}
                      {booking.status === "Completed" && (
                        <>
                          {booking.clientRating == null && (
                            <button onClick={() => { setReviewingId(booking.id); setReviewRating(5); setReviewText(""); }} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700">
                              Rate Provider
                            </button>
                          )}
                          <button onClick={() => navigate("/explore")} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">Book Again</button>
                        </>
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
      {cancelingId && cancelBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCancelingId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900">
                Cancel Booking?
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Are you sure you want to cancel{" "}
                <span className="font-semibold text-gray-700">
                  {cancelBooking.task}
                </span>{" "}
                with {cancelBooking.worker}? This action cannot be undone.
              </p>
              {Date.now() - new Date(cancelBooking.createdAt).getTime() >= 10 * 60 * 1000 && (
                <div className="mt-4">
                  <label htmlFor="client-cancellation-reason" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Reason for cancellation
                  </label>
                  <textarea
                    id="client-cancellation-reason"
                    value={cancellationReason}
                    onChange={(event) => setCancellationReason(event.target.value)}
                    maxLength={500}
                    rows={3}
                    required
                    placeholder="Tell the provider why you need to cancel"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
                  />
                  <p className="mt-1 text-xs text-gray-500">A cancellation request will be sent to the provider for approval.</p>
                </div>
              )}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setCancelingId(null)}
                  className="flex-1 rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Keep Booking
                </button>
                <button
                  onClick={handleCancel}
                  disabled={Date.now() - new Date(cancelBooking.createdAt).getTime() >= 10 * 60 * 1000 && !cancellationReason.trim()}
                  className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel Booking
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {reviewingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReviewingId(null)}>
          <form onSubmit={handleSubmitReview} className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900">How was your service?</h2>
              <p className="mt-1 text-sm text-gray-500">{reviewingBooking.task} with {reviewingBooking.worker}</p>
              <label htmlFor="client-review-rating" className="mt-5 block text-sm font-medium text-gray-700">Rating</label>
              <select id="client-review-rating" value={reviewRating} onChange={(event) => setReviewRating(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800">
                <option value={5}>5 stars</option>
                <option value={4}>4 stars</option>
                <option value={3}>3 stars</option>
                <option value={2}>2 stars</option>
                <option value={1}>1 star</option>
              </select>
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
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white text-2xl font-bold bg-primary-100 text-primary-700">
                    {detailBooking.worker.charAt(0)}
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
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-500">Price</span>
                  <span className="font-bold text-gray-900">
                    {detailBooking.price}
                  </span>
                </div>
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
                    navigate("/messages");
                  }}
                  className="flex-1 rounded-lg bg-purple-600 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700"
                >
                  Contact Worker
                </button>
                {detailBooking.status === "Pending Request" && (
                  <button
                    onClick={() => {
                      setDetailId(null);
                      setCancelingId(detailBooking.id);
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
