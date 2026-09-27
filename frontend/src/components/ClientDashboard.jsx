import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useBookings } from "../context/BookingContext.jsx";
import Header from "./Header.jsx";
import BookingProgress from "./BookingProgress.jsx";
import BookingHistory from "./BookingHistory.jsx";
import AddressActions from "./AddressActions.jsx";

export const categories = [
  { name: "All Services", icon: "🏠" },
  { name: "Carpentry", icon: "🪵" },
  { name: "Electrical", icon: "⚡" },
  { name: "Plumbing", icon: "🔧" },
  { name: "Painting", icon: "🎨" },
  { name: "Cleaning", icon: "🧹" },
  { name: "Landscaping", icon: "🌱" },
];

const favourites = [
  {
    name: "Johhny Cruz",
    cred: "TESDA NC II Carpenter",
    rating: 4.8,
    reviews: 24,
    lastHired: "Last hired 6 months ago",
    price: "P500",
  },
  {
    name: "Maria Santos",
    cred: "TESDA NC II Electrician",
    rating: 4.6,
    reviews: 18,
    lastHired: "Last hired 3 months ago",
    price: "P450",
  },
];

function StatusBadge({ status }) {
  const colors = {
    "Pending Request": "bg-amber-100 text-amber-700 border-amber-200",
    Confirmed: "bg-green-100 text-green-700 border-green-200",
    "On the Way": "bg-cyan-100 text-cyan-800 border-cyan-200",
    "In Progress": "bg-purple-100 text-purple-700 border-purple-200",
    Completed: "bg-blue-100 text-blue-700 border-blue-200",
    "Cancellation Requested": "bg-amber-100 text-amber-700 border-amber-200",
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

function StarIcon({ filled }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-3.5 w-3.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const { bookings: bookingList, isLoading, error, requestCancellation, respondToProviderUpdate } = useBookings();
  const [bannerVisible, setBannerVisible] = useState(true);
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");
  const [bookingSearchQuery, setBookingSearchQuery] = useState("");
  const [cancelingId, setCancelingId] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const scrollRef = useRef(null);
  const catScrollRef = useRef(null);

  const tabs = ["All", "Pending", "Active", "Completed", "Cancelled"];

  const tabCounts = {
    All: bookingList.length,
    Pending: bookingList.filter(
      (b) => b.status === "Pending Request"
    ).length,
    Active: bookingList.filter((b) => ["Confirmed", "On the Way", "In Progress", "Cancellation Requested"].includes(b.status)).length,
    Completed: bookingList.filter(
      (b) => b.status === "Completed"
    ).length,
    Cancelled: bookingList.filter((b) => ["Cancelled", "Declined"].includes(b.status)).length,
  };

  const scroll = (direction) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: direction === "left" ? -200 : 200,
        behavior: "smooth",
      });
    }
  };

  const scrollCategories = (direction) => {
    if (catScrollRef.current) {
      catScrollRef.current.scrollBy({
        left: direction === "left" ? -200 : 200,
        behavior: "smooth",
      });
    }
  };

  const normalizedBookingQuery = bookingSearchQuery.trim().toLowerCase();
  const matchingBookingList = bookingList.filter((booking) => !normalizedBookingQuery ||
    [booking.worker, booking.cred, booking.task, booking.description]
      .some((value) => String(value || "").toLowerCase().includes(normalizedBookingQuery))
  );
  const filteredBookings = matchingBookingList.filter((booking) => {
    if (activeTab === "All") return true;
    if (activeTab === "Pending") return booking.status === "Pending Request";
    if (activeTab === "Active") return ["Confirmed", "On the Way", "In Progress", "Cancellation Requested"].includes(booking.status);
    if (activeTab === "Completed") return booking.status === "Completed";
    return ["Cancelled", "Declined"].includes(booking.status);
  });

  const filteredCategories = categories.filter((cat) =>
    search.trim()
      ? cat.name.toLowerCase().includes(search.toLowerCase())
      : true
  );

  const cancelBooking = bookingList.find((booking) => booking.id === cancelingId);
  const enRouteBooking = bookingList.find((booking) => booking.status === "On the Way");

  const handleCancelBooking = async () => {
    if (!cancelingId) return;
    try {
      await requestCancellation(cancelingId, "request", cancellationReason);
      setCancelingId(null);
      setCancellationReason("");
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
      <Header showNav activeTab="Home" />

      {enRouteBooking && (
        <div role="status" className="border-b border-cyan-200 bg-cyan-50 px-4 py-3 text-cyan-950 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
            <p className="text-sm font-semibold">{enRouteBooking.worker} is on the way for {enRouteBooking.task}.</p>
            <button onClick={() => navigate("/bookings")} className="shrink-0 text-sm font-semibold underline underline-offset-2">View booking</button>
          </div>
        </div>
      )}

      {bannerVisible && (
        <div className="relative w-full overflow-hidden bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-300 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex w-full min-w-0 items-center gap-3">
            <span className="shrink-0 text-2xl">⚠️</span>
            <div className="flex-1 min-w-0 overflow-hidden">
              {isLoggedIn && (
                <p className="text-xs font-medium text-gray-600">Welcome back, Client</p>
              )}
              <p className="text-sm font-medium text-gray-800">
                Recurring Maintenance Reminder: It&apos;s been 6 months since your
                last AC Cleaning - Tap to schedule with Perez Cruz
              </p>
            </div>
            <button
              onClick={() => navigate("/explore")}
              className="shrink-0 rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Book Now
            </button>
            <button
              onClick={() => setBannerVisible(false)}
              className="shrink-0 rounded p-1 text-gray-700 transition hover:bg-gray-900/10"
              aria-label="Close reminder"
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
        </div>
      )}

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_340px] lg:px-8">
        <div className="space-y-8">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-700 via-slate-700 to-slate-800 px-6 py-10 sm:px-10 sm:py-12">
            <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute bottom-0 left-1/2 h-32 w-32 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute right-1/4 top-1/4 h-16 w-16 rounded-full bg-white/5" />

            <div className="pointer-events-none absolute -bottom-4 -right-2 hidden h-48 w-40 overflow-hidden sm:block md:right-8">
              <img
                src="/assets/Panda Cropped.png"
                alt="TaskPanda mascot"
                className="h-full w-full object-contain"
              />
            </div>

            <div className="relative z-10 max-w-lg">
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
                Find trusted local pros for your home
              </h1>
              <p className="mt-4 text-base leading-relaxed text-teal-100/80 sm:text-lg">
                TaskPanda connects with certified tradespeople and trusted
                independent local specialists.
              </p>

              <div className="mt-8 flex items-center overflow-hidden rounded-xl bg-white shadow-lg">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search for carpentry, plumbing, cleaning, or electrical services..."
                  className="flex-1 px-5 py-3.5 text-sm text-gray-800 placeholder-gray-400/70 outline-none"
                />
                <button className="shrink-0 bg-gray-800 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-gray-900">
                  Search
                </button>
              </div>
            </div>
          </div>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Explore Categories</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => scrollCategories("left")}
                  className="rounded-full border border-gray-200 bg-white p-1.5 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                  aria-label="Scroll left"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path d="M10 4L4 12l6 8V4z" />
                    <rect x="10" y="11" width="12" height="2" />
                  </svg>
                </button>
                <button
                  onClick={() => scrollCategories("right")}
                  className="rounded-full border border-gray-200 bg-white p-1.5 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                  aria-label="Scroll right"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path d="M14 4l6 8-6 8V4z" />
                    <rect x="2" y="11" width="12" height="2" />
                  </svg>
                </button>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("/explore");
                  }}
                  className="text-sm font-medium text-primary-600 hover:text-primary-800"
                >
                  View All
                </a>
              </div>
            </div>
            <div
              ref={catScrollRef}
              className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
              style={{ scrollbarWidth: "none" }}
            >
              {filteredCategories.map((cat) => (
                <div
                  key={cat.name}
                  onClick={() => navigate(`/explore?service=${encodeURIComponent(cat.name)}`)}
                  className="flex shrink-0 cursor-pointer flex-col items-center gap-2 rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm transition hover:shadow-md w-[120px]"
                >
                  <span className="text-2xl">{cat.icon}</span>
                  <span className="whitespace-nowrap text-xs font-medium text-gray-700">
                    {cat.name}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Your Favourites</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => scroll("left")}
                  className="rounded-full border border-gray-200 bg-white p-1.5 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                  aria-label="Scroll left"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path d="M10 4L4 12l6 8V4z" />
                    <rect x="10" y="11" width="12" height="2" />
                  </svg>
                </button>
                <button
                  onClick={() => scroll("right")}
                  className="rounded-full border border-gray-200 bg-white p-1.5 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                  aria-label="Scroll right"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path d="M14 4l6 8-6 8V4z" />
                    <rect x="2" y="11" width="12" height="2" />
                  </svg>
                </button>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("/explore");
                  }}
                  className="text-sm font-medium text-primary-600 hover:text-primary-800"
                >
                  View All
                </a>
              </div>
            </div>
            <div
              ref={scrollRef}
              className="flex gap-3 overflow-x-auto pb-2"
              style={{ scrollbarWidth: "none" }}
            >
              {favourites.map((fav) => (
                <div
                  key={fav.name}
                  className="flex min-w-[260px] flex-col rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
                        {fav.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {fav.name}
                        </p>
                        <p className="text-xs text-gray-500">{fav.cred}</p>
                      </div>
                    </div>
                    <StatusBadge status="Confirmed" />
                  </div>
                  <div className="mt-3 flex items-center gap-1">
                    <StarIcon filled />
                    <span className="text-sm font-medium text-gray-800">
                      {fav.rating}
                    </span>
                    <span className="text-xs text-gray-400">
                      ({fav.reviews} reviews)
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">{fav.lastHired}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-gray-900">
                      {fav.price}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate("/explore")}
                        className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-primary-700"
                      >
                        Rebook
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate("/profile")}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        View Profile
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
      </div>

      <aside className="w-full shrink-0 lg:w-[340px]">
          <div className="sticky top-20 min-w-0 rounded-xl border border-gray-200 bg-white shadow-sm">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-px bg-gray-100">
              {[
                { label: "Active", value: tabCounts.Active, color: "bg-white" },
                { label: "Completed", value: tabCounts.Completed, color: "bg-white" },
              ].map((s) => (
                <div key={s.label} className={`${s.color} px-4 py-3 text-center`}>
                  <p className="text-lg font-bold text-gray-900">{s.value}</p>
                  <p className="text-[11px] font-medium text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-base font-bold text-gray-900">
                Active Bookings
              </h2>
              <button
                onClick={() => navigate("/bookings")}
                className="text-sm font-medium text-primary-600 hover:text-primary-800"
              >
                See All &gt;
              </button>
            </div>
            {error && <p role="alert" className="border-b border-red-100 px-5 py-3 text-xs text-red-700">{error}</p>}
            {isLoading && <p className="border-b border-gray-100 px-5 py-3 text-xs text-gray-500">Loading bookings...</p>}
            <div className="flex w-full min-w-0 gap-1 overflow-x-auto border-b border-gray-100 px-5 py-3">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    activeTab === tab
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {tab}
                    <span
                      className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                        activeTab === tab
                          ? "bg-white/20 text-white"
                          : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {tabCounts[tab] ?? 0}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <label className="relative block px-4 pt-3">
              <span className="sr-only">Search bookings</span>
              <input type="search" value={bookingSearchQuery} onChange={(event) => setBookingSearchQuery(event.target.value)} placeholder="Search provider or repair" className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-7 top-[1.125rem] h-4 w-4 text-gray-400"><circle cx="10.8" cy="10.8" r="6.3" /><path strokeLinecap="round" d="m16 16 4.2 4.2" /></svg>
            </label>
            <div className="max-h-[480px] overflow-y-auto p-4">
              {filteredBookings.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  No {activeTab.toLowerCase()} bookings
                </p>
              ) : (
                filteredBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="mb-3 rounded-xl border border-gray-100 bg-gray-50 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <StatusBadge status={booking.status} />
                      <span className="text-sm font-semibold text-gray-900">
                        {booking.price}
                      </span>
                    </div>
                    <BookingProgress status={booking.status} />
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                        {booking.worker.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {booking.worker}
                        </p>
                        <p className="text-xs text-gray-500">{booking.cred}</p>
                      </div>
                    </div>
                    <div className="mt-3 border-t border-gray-200 pt-2">
                      <p className="text-sm font-medium text-gray-800">
                        {booking.task}
                      </p>
                      <p className="text-xs text-gray-500">{booking.date}</p>
                      {booking.status === "Cancellation Requested" && booking.cancellationExpiresAt && (
                        <p className="mt-1 text-xs text-amber-700">
                          Response due {new Date(booking.cancellationExpiresAt).toLocaleString()}
                        </p>
                      )}
                      {booking.cancellationOutcome === "rejected" && (
                        <p className="mt-1 text-xs text-red-700">The cancellation was declined. This booking remains active.</p>
                      )}
                      {booking.clientRating != null && (
                        <p className="mt-2 text-xs font-medium text-amber-700">Your review: {"★".repeat(booking.clientRating)}{"☆".repeat(5 - booking.clientRating)}{booking.clientReview ? ` · ${booking.clientReview}` : ""}</p>
                      )}
                      {booking.clientReviewPhotos?.length > 0 && (
                        <div className="mt-2 flex gap-2">
                          {booking.clientReviewPhotos.map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="Review attachment" className="h-12 w-12 rounded object-cover" /></a>)}
                        </div>
                      )}
                      {booking.providerUpdates?.map((update) => (
                        <div key={update.id} className="mt-2 rounded-md border border-cyan-100 bg-cyan-50 p-2 text-xs text-cyan-950">
                          <p className="font-semibold">Provider update{update.type === "reschedule" ? " · Time change requested" : ""}</p>
                          <p className="mt-1">{update.note}</p>
                          {update.type === "reschedule" && (
                            <>
                              <p className="mt-1">Proposed: {new Date(update.proposedServiceDate).toLocaleDateString()} at {update.proposedTimeSlot}</p>
                              {update.status === "pending" && booking.status === "Confirmed" && (
                                <div className="mt-2 flex gap-2">
                                  <button onClick={() => handleProviderUpdateResponse(booking.id, update.id, "accept")} className="rounded border border-cyan-300 bg-white px-2 py-1 font-semibold">Accept</button>
                                  <button onClick={() => handleProviderUpdateResponse(booking.id, update.id, "reject")} className="rounded border border-cyan-300 bg-white px-2 py-1 font-semibold">Keep current time</button>
                                </div>
                              )}
                              {update.status !== "pending" && <p className="mt-1 font-medium">Request {update.status}.</p>}
                            </>
                          )}
                        </div>
                      ))}
                      <div className="mt-2 text-xs text-gray-600"><AddressActions address={booking.address} /></div>
                    </div>
                    <BookingHistory events={booking.statusHistory} />
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => navigate("/messages")}
                        className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        Contact
                      </button>
                      {["Pending Request", "Confirmed", "On the Way", "In Progress"].includes(booking.status) && (
                        <button
                          onClick={() => setCancelingId(booking.id)}
                          className="flex-1 rounded-lg bg-red-50 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate(booking.status === "Completed" && !booking.clientRating ? "/bookings" : "/profile")}
                        className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        {booking.status === "Completed" && !booking.clientRating ? "Rate Provider" : "View Profile"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
      {cancelingId && cancelBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCancelingId(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900">Cancel booking?</h2>
              <p className="mt-2 text-sm text-gray-600">{cancelBooking.task} with {cancelBooking.worker}</p>
              {Date.now() - new Date(cancelBooking.createdAt).getTime() >= 10 * 60 * 1000 && (
                <div className="mt-4">
                  <label htmlFor="dashboard-cancellation-reason" className="mb-1.5 block text-sm font-medium text-gray-700">Brief cancellation reason</label>
                  <textarea
                    id="dashboard-cancellation-reason"
                    value={cancellationReason}
                    onChange={(event) => setCancellationReason(event.target.value)}
                    maxLength={500}
                    rows={3}
                    required
                    placeholder="Why do you need to cancel?"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
                  />
                  <p className="mt-1 text-xs text-gray-500">The other participant can respond before this request expires.</p>
                </div>
              )}
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => setCancelingId(null)} className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-700">Keep booking</button>
                <button type="button" disabled={Date.now() - new Date(cancelBooking.createdAt).getTime() > 10 * 60 * 1000 && !cancellationReason.trim()} onClick={handleCancelBooking} className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Cancel booking</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
