import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const initialBookings = [
  {
    id: 1,
    status: "Pending Request",
    worker: "Johhny Cruz",
    cred: "TESDA NC II Carpenter",
    task: "Desktop Table Repair",
    description:
      "The desktop table has a broken leg and needs reinforcement. Wood glue and screw repair requested.",
    date: "Sep 9, 2026",
    time: "09:00 AM",
    price: "P500",
    address: "12 Rizal St, Dagupan City",
  },
  {
    id: 2,
    status: "Confirmed",
    worker: "Maria Santos",
    cred: "TESDA NC II Electrician",
    task: "Circuit Breaker Replacement",
    description:
      "Main circuit breaker needs replacement due to frequent tripping. Will inspect entire panel.",
    date: "Sep 10, 2026",
    time: "02:00 PM",
    price: "P800",
    address: "5 Burgos Ave, Dagupan City",
  },
  {
    id: 3,
    status: "Completed",
    worker: "Ricky Padilla",
    cred: "Licensed Landscaper",
    task: "Front Yard Landscaping",
    description:
      "Lawn mowing, hedge trimming, and flower bed redesign for front yard.",
    date: "Sep 5, 2026",
    time: "08:00 AM",
    price: "P1,200",
    address: "8 Aquino Drive, Dagupan City",
  },
];

const tabs = ["All", "Pending Request", "Confirmed", "Completed", "Cancelled"];

function StatusBadge({ status }) {
  const colors = {
    "Pending Request": "bg-amber-100 text-amber-700 border-amber-200",
    Confirmed: "bg-green-100 text-green-700 border-green-200",
    Completed: "bg-blue-100 text-blue-700 border-blue-200",
    Cancelled: "bg-red-100 text-red-700 border-red-200",
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
  const { isLoggedIn } = useAuth();
  const [activeTab, setActiveTab] = useState("All");
  const [bookings, setBookings] = useState(initialBookings);
  const [sortBy, setSortBy] = useState("date");
  const [cancelingId, setCancelingId] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const stats = useMemo(() => {
    const total = bookings.length;
    const pending = bookings.filter((b) => b.status === "Pending Request").length;
    const confirmed = bookings.filter((b) => b.status === "Confirmed").length;
    const completed = bookings.filter((b) => b.status === "Completed").length;
    const cancelled = bookings.filter((b) => b.status === "Cancelled").length;
    return { total, pending, confirmed, completed, cancelled };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    let result = bookings;
    if (activeTab !== "All") {
      result = result.filter((b) => b.status === activeTab);
    }
    const sorted = [...result];
    if (sortBy === "date") {
      sorted.sort(
        (a, b) => new Date(a.date + " " + a.time) - new Date(b.date + " " + b.time)
      );
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
      };
      sorted.sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));
    }
    return sorted;
  }, [bookings, activeTab, sortBy]);

  const detailBooking = bookings.find((b) => b.id === detailId) || null;
  const cancelBooking = bookings.find((b) => b.id === cancelingId);

  const handleCancel = () => {
    if (!cancelingId) return;
    setBookings((prev) =>
      prev.map((b) =>
        b.id === cancelingId ? { ...b, status: "Cancelled" } : b
      )
    );
    setCancelingId(null);
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

        {/* Summary Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Total", value: stats.total, color: "bg-gray-100 text-gray-700" },
            { label: "Pending", value: stats.pending, color: "bg-amber-50 text-amber-700" },
            { label: "Confirmed", value: stats.confirmed, color: "bg-green-50 text-green-700" },
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

        {/* Tabs */}
        <div className="mb-4 flex flex-wrap gap-1">
          {tabs.map((tab) => {
            const count =
              tab === "All"
                ? bookings.length
                : bookings.filter((b) => b.status === tab).length;
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
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600">
                    <div className="flex items-center gap-1.5">
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
                    <div className="flex items-center gap-1.5">
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
                      <span>{booking.address}</span>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-xl font-bold text-gray-900">
                      {booking.price}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => navigate("/messages")}
                        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        Contact
                      </button>
                      {(booking.status === "Pending Request" ||
                        booking.status === "Confirmed") && (
                        <button
                          onClick={() => setCancelingId(booking.id)}
                          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                        >
                          Cancel
                        </button>
                      )}
                      {booking.status === "Completed" && (
                        <button
                          onClick={() => navigate("/explore")}
                          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700"
                        >
                          Book Again
                        </button>
                      )}
                      {(booking.status === "Pending Request" ||
                        booking.status === "Confirmed") && (
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
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setCancelingId(null)}
                  className="flex-1 rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Keep Booking
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
                >
                  Cancel Booking
                </button>
              </div>
            </div>
          </div>
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
