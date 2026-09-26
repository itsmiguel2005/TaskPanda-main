import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import { useBookings } from "../context/BookingContext.jsx";

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

const tabs = ["All", "Incoming Requests", "Active", "Cancellation Requests", "Completed", "Cancelled"];

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
    Cancelled: "bg-red-100 text-red-700 border-red-200",
    Declined: "bg-red-100 text-red-700 border-red-200",
    "Cancellation Requested": "bg-amber-100 text-amber-700 border-amber-200",
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

function StatusDot({ status }) {
  const colors = {
    "Pending Request": "bg-amber-500",
    Confirmed: "bg-green-500",
    Completed: "bg-blue-500",
    Cancelled: "bg-red-500",
    Declined: "bg-red-500",
    "Cancellation Requested": "bg-amber-500",
    "In Progress": "bg-purple-500",
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
  const { bookings, isLoading, error, updateBookingStatus, requestCancellation } = useBookings();
  const [sortBy, setSortBy] = useState("date");
  const [acceptingId, setAcceptingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [cancelingId, setCancelingId] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [detailId, setDetailId] = useState(null);

  const requests = bookings.filter((booking) => booking.status === "Pending Request");
  const managedBookings = bookings.filter((booking) => booking.status !== "Pending Request");
  const filteredManagedBookings = managedBookings.filter((booking) => {
    if (activeTab === "All") return true;
    if (activeTab === "Active") return booking.status === "Confirmed";
    if (activeTab === "Cancellation Requests") return booking.status === "Cancellation Requested";
    if (activeTab === "Completed") return booking.status === "Completed";
    if (activeTab === "Cancelled") return ["Cancelled", "Declined"].includes(booking.status);
    return false;
  });

  const sortedRequests = useMemo(() => {
    return [...requests].sort((a, b) => parseDate(a.date) - parseDate(b.date));
  }, [requests]);

  const sortedBookings = useMemo(() => {
    let result = [...filteredManagedBookings];
    if (sortBy === "date") {
      result.sort((a, b) => parseDate(b.date) - parseDate(a.date));
    } else if (sortBy === "price") {
      result.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
    } else if (sortBy === "status") {
      const order = { "Pending Request": 0, Confirmed: 1, "In Progress": 2, Completed: 3, Cancelled: 4 };
      result.sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));
    }
    return result;
  }, [filteredManagedBookings, sortBy]);

  const stats = useMemo(() => ({
    incoming: requests.length,
    active: managedBookings.filter((b) => b.status !== "Completed" && b.status !== "Cancelled").length,
    completed: managedBookings.filter((b) => b.status === "Completed").length,
    cancelled: managedBookings.filter((b) => b.status === "Cancelled").length,
    earnings: managedBookings
      .filter((b) => b.status === "Completed")
      .reduce((sum, b) => sum + parsePrice(b.price), 0),
  }), [requests, managedBookings]);

  const showIncoming = activeTab === "All" || activeTab === "Incoming Requests";
  const showBookings = activeTab !== "Incoming Requests";
  const visibleBookingCount = (showIncoming ? requests.length : 0) + (showBookings ? filteredManagedBookings.length : 0);

  const rejectBooking = managedBookings.find((b) => b.id === cancelingId);
  const detailItem = useMemo(() => {
    if (!detailId) return null;
    return (
      requests.find((r) => r.id === detailId) ||
      managedBookings.find((b) => b.id === detailId) ||
      null
    );
  }, [detailId, requests, managedBookings]);

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

  function rejectRequest(id) {
    updateBookingStatus(id, "Declined").catch((error) => window.alert(error.message));
    setRejectingId(null);
  }

  async function handleCancelBooking() {
    if (!cancelingId) return;
    try {
      await requestCancellation(cancelingId, "request", cancellationReason);
      setCancelingId(null);
      setCancellationReason("");
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function handleCancellationResponse(id, action) {
    try {
      await requestCancellation(id, action);
    } catch (error) {
      window.alert(error.message);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <Header showNav activeTab="Bookings" role="provider" />

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Link */}
        <button
          onClick={() => navigate("/provider-dashboard")}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
          </svg>
          Back to Dashboard
        </button>

        {/* Page Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Bookings</h1>
          <p className="mt-1 text-sm text-gray-500">
            View incoming requests and manage your jobs
          </p>
        </div>
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {isLoading && <p className="mb-4 text-sm text-gray-500">Loading bookings...</p>}

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Incoming", value: stats.incoming, color: "bg-amber-50 text-amber-700" },
            { label: "Active", value: stats.active, color: "bg-green-50 text-green-700" },
            { label: "Completed", value: stats.completed, color: "bg-blue-50 text-blue-700" },
            { label: "Cancelled", value: stats.cancelled, color: "bg-red-50 text-red-700" },
            { label: "Earnings", value: `₱${stats.earnings.toLocaleString()}`, color: "bg-gray-100 text-gray-700" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl ${s.color} px-3 py-3 text-center`}>
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-[11px] font-medium opacity-80">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="mb-4 flex flex-wrap gap-1">
          {tabs.map((tab) => {
            const count =
              tab === "All"
                ? requests.length + managedBookings.length
                : tab === "Incoming Requests"
                ? requests.length
                : tab === "Active"
                ? managedBookings.filter((booking) => booking.status === "Confirmed").length
                : tab === "Cancellation Requests"
                ? managedBookings.filter((booking) => booking.status === "Cancellation Requested").length
                : tab === "Completed"
                ? managedBookings.filter((booking) => booking.status === "Completed").length
                : managedBookings.filter((booking) => ["Cancelled", "Declined"].includes(booking.status)).length;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
                }`}
              >
                {tab}
                <span
                  className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                    activeTab === tab
                      ? "bg-white/20 text-white"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sort */}
        {showBookings && filteredManagedBookings.length > 0 && (
          <div className="mb-4 flex justify-end">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-purple-500"
            >
              <option value="date">Sort: Date</option>
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
                      className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
                    >
                      <div className="p-5 sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-100 text-lg font-bold text-accent-700">
                              {req.client.charAt(0)}
                            </div>
                            <div>
                              <h3 className="text-base font-semibold text-gray-900">
                                {req.client}
                              </h3>
                              <p className="text-sm text-gray-500">
                                New booking request
                              </p>
                            </div>
                          </div>
                          <StatusBadge status="Pending Request" />
                        </div>

                        <div className="mt-4 border-t border-gray-100 pt-4">
                          <h4 className="text-sm font-semibold text-gray-800">
                            {req.task}
                          </h4>
                          <p className="mt-1 text-sm leading-relaxed text-gray-500">
                            {req.description}
                          </p>
                          {req.photoUrls?.length > 0 && (
                            <div className="mt-3 flex gap-2">
                              {req.photoUrls.map((url) => <img key={url} src={url} alt="Repair item" className="h-16 w-16 rounded-lg object-cover" />)}
                            </div>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-gray-400">
                              <path fillRule="evenodd" d="M19.5 6.75a3 3 0 00-6 0v7.5a3 3 0 006 0V6.75zM3.75 9.75a3 3 0 016 0v7.5a3 3 0 01-6 0V9.75zM15.75 2.25a3 3 0 016 0v7.5a3 3 0 01-6 0V2.25z" clipRule="evenodd" />
                            </svg>
                            <span>{req.address}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-gray-400">
                              <path fillRule="evenodd" d="M19.5 6.75a3 3 0 00-6 0v7.5a3 3 0 006 0V6.75zM3.75 9.75a3 3 0 016 0v7.5a3 3 0 01-6 0V9.75zM15.75 2.25a3 3 0 016 0v7.5a3 3 0 01-6 0V2.25z" clipRule="evenodd" />
                            </svg>
                            <span>{req.date}</span>
                            <span className="text-gray-300">|</span>
                            <span>{req.time}</span>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-xl font-bold text-gray-900">{req.price}</span>
                            <button
                              onClick={() => setDetailId(req.id)}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                            >
                              Details
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setRejectingId(req.id)}
                              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                            >
                              Reject
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
                <h2 className="mb-4 text-lg font-semibold text-gray-900">
                  My Bookings
                </h2>
                <div className="space-y-4">
                  {sortedBookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
                    >
                      <div className="p-5 sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-700">
                              {booking.client.charAt(0)}
                            </div>
                            <div>
                              <h3 className="text-base font-semibold text-gray-900">
                                {booking.client}
                              </h3>
                              <p className="text-sm text-gray-500">Job</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusDot status={booking.status} />
                            <StatusBadge status={booking.status} />
                          </div>
                        </div>

                        <div className="mt-4 border-t border-gray-100 pt-4">
                          <h4 className="text-sm font-semibold text-gray-800">
                            {booking.task}
                          </h4>
                          <p className="mt-1 text-sm leading-relaxed text-gray-500">
                            {booking.description}
                          </p>
                          {booking.photoUrls?.length > 0 && (
                            <div className="mt-3 flex gap-2">
                              {booking.photoUrls.map((url) => <img key={url} src={url} alt="Repair item" className="h-16 w-16 rounded-lg object-cover" />)}
                            </div>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-gray-400">
                              <path fillRule="evenodd" d="M19.5 6.75a3 3 0 00-6 0v7.5a3 3 0 006 0V6.75zM3.75 9.75a3 3 0 016 0v7.5a3 3 0 01-6 0V9.75zM15.75 2.25a3 3 0 016 0v7.5a3 3 0 01-6 0V2.25z" clipRule="evenodd" />
                            </svg>
                            <span>{booking.address}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-gray-400">
                              <path fillRule="evenodd" d="M19.5 6.75a3 3 0 00-6 0v7.5a3 3 0 006 0V6.75zM3.75 9.75a3 3 0 016 0v7.5a3 3 0 01-6 0V9.75zM15.75 2.25a3 3 0 016 0v7.5a3 3 0 01-6 0V2.25z" clipRule="evenodd" />
                            </svg>
                            <span>{booking.date}</span>
                            <span className="text-gray-300">|</span>
                            <span>{booking.time}</span>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-xl font-bold text-gray-900">{booking.price}</span>
                            <button
                              onClick={() => setDetailId(booking.id)}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                            >
                              Details
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => navigate("/provider-messages")}
                              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700"
                            >
                              Contact
                            </button>
                            {(booking.status === "Pending Request" || booking.status === "Confirmed") && (
                              <button
                                onClick={() => setCancelingId(booking.id)}
                                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                              >
                                Cancel
                              </button>
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
                            {booking.status === "Completed" && (
                              <button
                                onClick={() => navigate("/explore")}
                                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
                              >
                                Book Again
                              </button>
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
                ? "Canceled or declined bookings will appear here."
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

      {/* Reject Confirmation Modal */}
      {rejectingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setRejectingId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900">Reject Request?</h3>
              <p className="mt-2 text-sm text-gray-500">
                Are you sure you want to reject this request? The client will not be notified.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setRejectingId(null)}
                  className="flex-1 rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Keep Request
                </button>
                <button
                  onClick={() => rejectRequest(rejectingId)}
                  className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Booking Modal */}
      {cancelingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCancelingId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900">Cancel Booking?</h3>
              <p className="mt-2 text-sm text-gray-500">
                Are you sure you want to cancel this booking? This action cannot be undone.
              </p>
              {cancelingId && (() => {
                const booking = managedBookings.find((item) => item.id === cancelingId);
                return booking && Date.now() - new Date(booking.createdAt).getTime() > 10 * 60 * 1000 ? (
                  <div className="mt-4">
                    <label htmlFor="provider-cancellation-reason" className="mb-1.5 block text-sm font-medium text-gray-700">
                      Reason for cancellation
                    </label>
                    <textarea
                      id="provider-cancellation-reason"
                      value={cancellationReason}
                      onChange={(event) => setCancellationReason(event.target.value)}
                      rows={3}
                      placeholder="Tell the client why you need to cancel"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
                    />
                    <p className="mt-1 text-xs text-gray-500">A cancellation request will be sent to the client for approval.</p>
                  </div>
                ) : null;
              })()}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setCancelingId(null)}
                  className="flex-1 rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Keep Booking
                </button>
                <button
                  onClick={handleCancelBooking}
                  className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
                >
                  Cancel Booking
                </button>
              </div>
            </div>
          </div>
        </div>
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

              <div className="mt-6 flex gap-2">
                <button
                  onClick={() => {
                    setDetailId(null);
                    navigate("/provider-messages");
                  }}
                  className="flex-1 rounded-lg bg-purple-600 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700"
                >
                  Contact Client
                </button>
                {detailItem.status === "Pending Request" && (
                  <button
                    onClick={() => {
                      setDetailId(null);
                      setCancelingId(detailItem.id);
                    }}
                    className="flex-1 rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                  >
                    Cancel
                  </button>
                )}
                {detailItem.status === "Confirmed" && (
                  <button
                    onClick={() => {
                      setDetailId(null);
                      setCancelingId(detailItem.id);
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
