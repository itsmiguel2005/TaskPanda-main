import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useBookings } from "../context/BookingContext.jsx";
import Header from "../components/Header.jsx";
import StatusChangeConfirmation from "./StatusChangeConfirmation.jsx";
import CompletionProofModal from "./CompletionProofModal.jsx";
import { canRequestCancellation, requiresCancellationApproval } from "../utils/bookingCancellation.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function parsePrice(str) {
  const n = parseInt(String(str ?? "").replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

function fmtDate(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d)) return String(raw);
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function initials(name) {
  return String(name ?? "")
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}

// ─── sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    "Pending Request": "bg-amber-50 text-amber-700 border-amber-200",
    Confirmed: "bg-green-50 text-green-700 border-green-200",
    "On the Way": "bg-cyan-50 text-cyan-800 border-cyan-200",
    "In Progress": "bg-purple-50 text-purple-700 border-purple-200",
    Completed: "bg-blue-50 text-blue-700 border-blue-200",
    Settled: "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Cancellation Requested": "bg-amber-50 text-amber-700 border-amber-200",
    Cancelled: "bg-red-50 text-red-700 border-red-200",
    "Declined by Provider": "bg-rose-50 text-rose-800 border-rose-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${map[status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
      {status}
    </span>
  );
}

function Avatar({ name, image, size = "md" }) {
  const sz = size === "sm" ? "h-8 w-8 text-xs" : "h-11 w-11 text-base";
  return (
    <div className={`${sz} shrink-0 flex items-center justify-center rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-semibold overflow-hidden shadow-xs`}>
      {image ? <img src={image} alt={name} className="h-full w-full object-cover" /> : initials(name)}
    </div>
  );
}

// Icon helpers
function LocationIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-gray-400">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-gray-400">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-gray-400">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-gray-400">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-gray-400">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-gray-400">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

// ─── filter pills ─────────────────────────────────────────────────────────────

const FILTERS = [
  { key: "All", label: "All" },
  { key: "Pending Request", label: "Incoming Requests" },
  { key: "Active", label: "Active Bookings" },
  { key: "Completed", label: "Completed" },
  { key: "Settled", label: "Settled" },
  { key: "Cancelled", label: "Cancelled" },
  { key: "Declined by Provider", label: "Declined" },
];

// ─── Incoming Request card ───────────────────────────────────────────────────

function RequestCard({ booking, onAccept, onDecline }) {
  const clientName = booking.client || booking.clientName || booking.worker || "Client";
  // Use pre-formatted date string from API + raw timeSlot string — avoids UTC offset conversion bug
  const requestedDate = booking.date || (booking.serviceDate ? new Date(booking.serviceDate).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "");
  const requestedTime = [requestedDate, booking.time || booking.timeSlot].filter(Boolean).join(", ");
  const address = booking.address || booking.location || "";
  const urgency = booking.urgency || "Flexible";
  const price = booking.price != null
    ? (String(booking.price).startsWith("₱") || String(booking.price).startsWith("P") ? booking.price : `P${booking.price}`)
    : "";

  return (
    <div className="border-b border-gray-100 px-5 py-4 last:border-b-0">
      {/* Row 1: avatar + client + badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar name={clientName} image={booking.clientProfileImage} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{clientName}</p>
            <p className="text-[11px] text-gray-400">New booking request</p>
          </div>
        </div>
        <StatusBadge status="Pending Request" />
      </div>

      {/* Task title */}
      <p className="mt-3 text-base font-bold text-gray-900">{booking.task || booking.cred || "Booking"}</p>
      <p className="mt-0.5 text-sm text-gray-500">{booking.description || ""}</p>

      {/* Location + Requested time */}
      <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-1.5">
        {address && (
          <div className="flex items-center gap-1.5">
            <LocationIcon />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Location</p>
              <p className="text-xs text-gray-600">{address}</p>
            </div>
          </div>
        )}
        {requestedTime && (
          <div className="flex items-center gap-1.5">
            <ClockIcon />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Requested time</p>
              <p className="text-xs text-gray-600">{requestedTime}</p>
            </div>
          </div>
        )}
      </div>

      {/* Urgency pill + Price beside it + action buttons */}
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-normal ${
              urgency.toLowerCase() === "emergency"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-gray-200 bg-white text-gray-700 shadow-2xs"
            }`}
          >
            {urgency}
          </span>
          {price && (
            <span className="text-base font-bold text-gray-900">{price}</span>
          )}
        </div>
        <div className="flex flex-col gap-2 items-stretch min-w-[120px]">
          <button
            type="button"
            onClick={() => onAccept(booking.id)}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-700"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => onDecline(booking.id)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Progress Tracker & My Jobs Card ──────────────────────────────────────────

const TRACKER_STEPS = [
  { key: "Scheduled", label: "Scheduled", statusCode: "approved", statusName: "Confirmed" },
  { key: "On the Way", label: "On the Way", statusCode: "en_route", statusName: "On the Way" },
  { key: "In Progress", label: "In Progress", statusCode: "in_progress", statusName: "In Progress" },
  { key: "Completed", label: "Completed", statusCode: "complete", statusName: "Completed" },
];

const STATUS_PROGRESS_INDEX = {
  Confirmed: 0,
  "On the Way": 1,
  "In Progress": 2,
  Completed: 3,
  Settled: 3,
};

function JobProgressTracker({ status, onAdvanceStatus }) {
  const activeIndex = STATUS_PROGRESS_INDEX[status] ?? -1;
  const isTerminal = ["Cancelled", "Declined by Provider"].includes(status);

  return (
    <div className="mt-4" role="progressbar" aria-label="Job progress">
      <div className="grid grid-cols-4 gap-2">
        {TRACKER_STEPS.map((step, idx) => {
          const isActive = !isTerminal && activeIndex >= idx;
          const isNext = !isTerminal && activeIndex + 1 === idx;

          return (
            <div
              key={step.key}
              onClick={() => {
                if (isNext && onAdvanceStatus) {
                  onAdvanceStatus(step.statusCode, step.label);
                }
              }}
              title={isNext ? `Click to advance to ${step.label}` : undefined}
              className={`group flex flex-col ${isNext ? "cursor-pointer" : ""}`}
            >
              <div
                className={`h-1.5 w-full rounded-full transition-colors ${
                  isActive
                    ? "bg-[#547f9e]"
                    : isNext
                    ? "bg-gray-200 group-hover:bg-[#547f9e]/50"
                    : "bg-gray-200"
                }`}
              />
              <span
                className={`mt-1.5 text-xs truncate transition-colors ${
                  isActive
                    ? "font-semibold text-gray-900"
                    : isNext
                    ? "font-medium text-gray-500 group-hover:text-gray-900"
                    : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JobCard({
  booking,
  providerProfession,
  onDismiss,
  onNavigate,
  onAdvanceStatus,
  onCancelBooking,
  onViewDetails,
  onMarkComplete,
}) {
  const clientName = booking.client || booking.clientName || booking.worker || "Client";
  const submittedAt = booking.createdAt ? fmtDate(booking.createdAt) : "";
  // Pre-formatted date string + raw timeSlot with dot separator
  const scheduleDate = booking.date || (booking.serviceDate ? new Date(booking.serviceDate).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "");
  const schedule = [scheduleDate, booking.time || booking.timeSlot].filter(Boolean).join(" · ");
  const address = booking.address || booking.location || "";
  const price = booking.price != null
    ? (String(booking.price).startsWith("₱") || String(booking.price).startsWith("P") ? booking.price : `P${booking.price}`)
    : "";
  const category =
    (Array.isArray(booking.professions) && booking.professions.length > 0 ? booking.professions.join(", ") : null) ||
    (booking.cred && booking.cred !== "Service provider" ? booking.cred : null) ||
    (booking.category && booking.category !== "General Service" ? booking.category : null) ||
    (booking.serviceCategory && booking.serviceCategory !== "General Service" ? booking.serviceCategory : null) ||
    providerProfession ||
    "Professional Service";
  const urgency = booking.urgency || "";
  // X (dismiss) button only for terminal statuses
  const isDismissable = ["Settled", "Cancelled", "Declined by Provider"].includes(booking.status);

  // Determine primary action state button
  // "In Progress" → Mark Complete opens the proof modal (not a simple status advance)
  const isCompletion = booking.status === "In Progress";
  let actionButton = null;
  if (booking.status === "Confirmed") {
    actionButton = {
      label: "I'm On My Way",
      statusCode: "en_route",
      nextStatus: "On the Way",
    };
  } else if (booking.status === "On the Way") {
    actionButton = {
      label: "Start Job",
      statusCode: "in_progress",
      nextStatus: "In Progress",
    };
  } else if (isCompletion) {
    actionButton = {
      label: "Mark Complete",
    };
  }

  const canCancel = canRequestCancellation(booking);

  return (
    <div className="border-b border-gray-100 p-6 last:border-b-0">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_190px]">
        {/* Left Column: Details & Progress Tracker */}
        <div className="min-w-0">
          {/* Header row: avatar + client info + status badge */}
          <div className="flex items-center gap-3">
            <Avatar name={clientName} image={booking.clientProfileImage} />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-gray-900">{clientName}</p>
              {submittedAt && <p className="text-xs text-gray-400 mt-0.5">Submitted {submittedAt}</p>}
            </div>
            <div className="ml-auto sm:ml-6 flex items-center gap-1.5">
              <StatusBadge status={booking.status} />
              {isDismissable && (
                <button
                  type="button"
                  onClick={() => onDismiss(booking.id)}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
                  aria-label="Dismiss booking"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Task Title & Description */}
          <div className="mt-3.5">
            <h3 className="text-base font-bold text-gray-900">{booking.task || booking.cred || "Booking"}</h3>
            {booking.description && <p className="mt-0.5 text-sm text-gray-500">{booking.description}</p>}
          </div>

          {/* Progress Tracker Bar */}
          <JobProgressTracker
            status={booking.status}
            onAdvanceStatus={(statusCode, nextStatus) => {
              if (statusCode === "complete") {
                onMarkComplete(booking);
              } else {
                onAdvanceStatus(booking.id, statusCode, nextStatus);
              }
            }}
          />

          {/* Details grid below progress tracker */}
          <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3">
            <div>
              <p className="text-xs text-gray-400 font-normal">Location</p>
              <p className="mt-0.5 text-sm text-gray-700">{address || "Not specified"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-normal">Schedule</p>
              <p className="mt-0.5 text-sm text-gray-700">{schedule || "Flexible schedule"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-normal">Agreed price</p>
              <p className="mt-0.5 text-sm font-bold text-gray-900">{price || "Free"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-normal">Service category</p>
              <p className="mt-0.5 text-sm text-gray-700">{category || "General Service"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-normal">Urgency</p>
              <p className="mt-0.5 text-sm text-gray-700">{urgency || "Flexible"}</p>
            </div>
          </div>
        </div>

        {/* Right Column: Stacked Action Buttons */}
        <div className="flex flex-col gap-2.5 w-full sm:w-48 shrink-0 justify-start">
          <button
            type="button"
            onClick={() => onNavigate(`/provider/messages?bookingId=${booking.id}`)}
            className="w-full rounded-full border border-gray-200 bg-white py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition shadow-xs"
          >
            Open conversation
          </button>
          <button
            type="button"
            onClick={() => onViewDetails(booking)}
            className="w-full rounded-full border border-gray-200 bg-white py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition shadow-xs"
          >
            View details
          </button>
          {actionButton && (
            <button
              type="button"
              onClick={() => {
                if (isCompletion) {
                  onMarkComplete(booking);
                } else {
                  onAdvanceStatus(booking.id, actionButton.statusCode, actionButton.nextStatus);
                }
              }}
              className="w-full rounded-full bg-[#547f9e] hover:bg-[#436782] text-white py-2 text-center text-sm font-medium shadow-xs transition"
            >
              {actionButton.label}
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => onCancelBooking(booking)}
              className="w-full rounded-full border border-rose-200 bg-white py-2 text-center text-sm font-medium text-rose-500 hover:bg-rose-50 hover:border-rose-300 transition shadow-xs"
            >
              Cancel booking
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProviderDashboard() {
  const navigate = useNavigate();
  const { user, token, refreshProfile } = useAuth();
  const { bookings, isLoading, error, updateBookingStatus, requestCancellation, submitCompletionProof } = useBookings();

  const [activeFilter, setActiveFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [acceptingId, setAcceptingId] = useState(null);
  const [statusChange, setStatusChange] = useState(null);
  const [cancelingBooking, setCancelingBooking] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [detailBooking, setDetailBooking] = useState(null);
  const [completionBooking, setCompletionBooking] = useState(null);
  // Fresh provider stats fetched directly (user object from localStorage may be stale)
  const [providerStats, setProviderStats] = useState({ rating: 0, reviews: 0 });

  const providerProfession = useMemo(() => {
    if (Array.isArray(user?.professions) && user.professions.length > 0) {
      return user.professions.join(", ");
    }
    return user?.profession || "";
  }, [user]);

  const handleAdvanceStatus = useCallback((bookingId, statusCode, nextStatus) => {
    setStatusChange({
      bookingId,
      status: statusCode,
      nextStatus,
    });
  }, []);

  const handleMarkComplete = useCallback((booking) => {
    setCompletionBooking(booking);
  }, []);

  // Dismissed jobs from "My Jobs" local view
  const [dismissedBookingIds, setDismissedBookingIds] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = JSON.parse(window.localStorage.getItem("taskpanda-hidden-provider-dashboard-bookings") || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("taskpanda-hidden-provider-dashboard-bookings", JSON.stringify(dismissedBookingIds));
    }
  }, [dismissedBookingIds]);

  const handleDismissBooking = useCallback((bookingId) => {
    setDismissedBookingIds((prev) => (prev.includes(bookingId) ? prev : [...prev, bookingId]));
  }, []);

  // On mount: refresh profile so we get the latest averageRating/totalReviews
  useEffect(() => {
    if (!token) return;
    void refreshProfile();
  }, [token, refreshProfile]);

  // Whenever the user object updates, sync the local rating state
  useEffect(() => {
    const rating = Number(user?.averageRating ?? user?.rating ?? 0);
    const reviews = Number(user?.totalReviews ?? user?.reviewCount ?? 0);
    setProviderStats({ rating, reviews });
  }, [user]);


  // ── derived data ────────────────────────────────────────────────────────────
  // Calculate rating from provider's bookings with reviews and fall back to user profile
  const ratingData = useMemo(() => {
    const reviewedBookings = bookings.filter(
      (b) => b.clientRating != null && Number.isFinite(Number(b.clientRating))
    );
    if (reviewedBookings.length > 0) {
      const sum = reviewedBookings.reduce((acc, b) => acc + Number(b.clientRating), 0);
      return {
        rating: Number((sum / reviewedBookings.length).toFixed(1)),
        reviews: reviewedBookings.length,
      };
    }

    const backendRating = Number(user?.averageRating ?? user?.rating ?? 0);
    const backendReviews = Number(user?.totalReviews ?? user?.reviewCount ?? 0);
    return {
      rating: backendRating,
      reviews: backendReviews,
    };
  }, [bookings, user]);

  const requests = useMemo(
    () => [...bookings.filter((b) => b.status === "Pending Request")].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [bookings]
  );

  const jobs = useMemo(
    () => [...bookings.filter((b) => b.status !== "Pending Request")].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [bookings]
  );

  const upcomingJobs = useMemo(
    () => jobs.filter((b) => ["Confirmed", "On the Way", "In Progress"].includes(b.status)),
    [jobs]
  );

  const stats = useMemo(() => {
    const activeJobs = jobs.filter((j) => !["Completed", "Settled", "Cancelled", "Declined by Provider"].includes(j.status)).length;
    const completedJobs = jobs.filter((j) => ["Completed", "Settled"].includes(j.status)).length;
    const earnings = jobs
      .filter((j) => ["Completed", "Settled"].includes(j.status))
      .reduce((sum, j) => sum + parsePrice(j.price), 0);
    return { rating: ratingData.rating, reviews: ratingData.reviews, activeJobs, completedJobs, earnings };
  }, [jobs, ratingData]);

  // ── filter counts ────────────────────────────────────────────────────────────
  const filterCounts = useMemo(() => {
    const visibleBookings = bookings.filter((b) => !dismissedBookingIds.includes(b.id));
    const total = visibleBookings.length;
    const pending = visibleBookings.filter((b) => b.status === "Pending Request").length;
    const active = visibleBookings.filter((b) => ["Confirmed", "On the Way", "In Progress", "Cancellation Requested"].includes(b.status)).length;
    const completed = visibleBookings.filter((b) => b.status === "Completed").length;
    const settled = visibleBookings.filter((b) => b.status === "Settled").length;
    const cancelled = visibleBookings.filter((b) => b.status === "Cancelled").length;
    const declined = visibleBookings.filter((b) => b.status === "Declined by Provider").length;
    return { All: total, "Pending Request": pending, Active: active, Completed: completed, Settled: settled, Cancelled: cancelled, "Declined by Provider": declined };
  }, [bookings, dismissedBookingIds]);

  // ── filtered job list ─────────────────────────────────────────────────────
  const filteredJobs = useMemo(() => {
    let list = jobs.filter((b) => !dismissedBookingIds.includes(b.id));
    if (activeFilter === "Active") {
      list = list.filter((b) => ["Confirmed", "On the Way", "In Progress", "Cancellation Requested"].includes(b.status));
    } else if (activeFilter !== "All" && activeFilter !== "Pending Request") {
      list = list.filter((b) => b.status === activeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((b) =>
        [b.task, b.client, b.clientName, b.description, b.address].some((v) => String(v ?? "").toLowerCase().includes(q))
      );
    }
    return list;
  }, [jobs, dismissedBookingIds, activeFilter, search]);

  // ── actions ──────────────────────────────────────────────────────────────────
  const handleAccept = useCallback((id) => setAcceptingId(id), []);
  const handleDecline = useCallback(async (id) => {
    try { await updateBookingStatus(id, "Declined by Provider"); }
    catch (e) { window.alert(e.message); }
  }, [updateBookingStatus]);

  const confirmAccept = useCallback(async () => {
    if (!acceptingId) return;
    try { await updateBookingStatus(acceptingId, "Confirmed"); }
    catch (e) { window.alert(e.message); }
    finally { setAcceptingId(null); }
  }, [acceptingId, updateBookingStatus]);

  const pendingRequest = requests.find((r) => r.id === acceptingId);

  return (
    <div className="min-h-screen bg-gray-50 pt-16 pb-12">
      <Header showNav activeTab="Home" role="provider" notifCount={requests.length} />

      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">

        {/* ── Page title ─────────────────────────────────────────────────── */}
        <div className="py-6">
          <h1 className="text-2xl font-bold text-gray-900">Provider Dashboard</h1>
          <p className="mt-0.5 text-sm text-gray-500">Manage your jobs, requests, and earnings</p>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        {/* ── Stat cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* Rating */}
          <div className="rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Rating</p>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <svg key={s} viewBox="0 0 24 24" className={`h-4 w-4 ${s <= Math.round(stats.rating) ? "text-amber-400" : "text-gray-200"}`} fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
              {stats.rating > 0 && (
                <span className="text-sm font-bold text-gray-800">{stats.rating.toFixed(1)}</span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-400">{stats.reviews} {stats.reviews === 1 ? "review" : "reviews"}</p>
          </div>

          {/* Active Jobs */}
          <div className="rounded-xl border border-gray-100 bg-teal-50 px-5 py-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Active Jobs</p>
            <p className="mt-2 text-3xl font-extrabold text-gray-900">{stats.activeJobs}</p>
            <p className="mt-1 text-xs text-gray-400">Currently in progress</p>
          </div>

          {/* Completed Jobs */}
          <div className="rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Completed Jobs</p>
            <p className="mt-2 text-3xl font-extrabold text-gray-900">{stats.completedJobs}</p>
            <p className="mt-1 text-xs text-gray-400">All-time completed</p>
          </div>

          {/* Total Earnings */}
          <div className="rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Total Earnings</p>
            <p className="mt-2 text-3xl font-extrabold text-gray-900">₱{stats.earnings.toLocaleString()}</p>
            <p className="mt-1 text-xs text-gray-400">From completed jobs</p>
          </div>
        </div>

        {/* ── Filter pills + search ─────────────────────────────────────── */}
        <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveFilter(key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition whitespace-nowrap ${
                activeFilter === key
                  ? "bg-gray-900 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
              <span className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                activeFilter === key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
              }`}>
                {filterCounts[key] ?? 0}
              </span>
            </button>
          ))}

          {/* Search */}
          <div className="ml-auto flex shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-gray-400">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client or repair"
              className="w-36 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
            />
          </div>
        </div>

        {/* ── Two-column layout ─────────────────────────────────────────── */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">

          {/* LEFT: Incoming Requests + My Jobs */}
          <div className="space-y-5">

            {/* Incoming Requests */}
            {(activeFilter === "All" || activeFilter === "Pending Request") && (
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
                  <h2 className="text-base font-bold text-gray-900">Incoming Requests</h2>
                  {requests.length > 0 && (
                    <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-700">
                      {requests.length}
                    </span>
                  )}
                </div>

                {isLoading && requests.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
                ) : requests.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-3xl">📭</p>
                    <p className="mt-2 text-sm text-gray-400">No incoming requests</p>
                  </div>
                ) : (
                  <div>
                    {requests.map((req) => (
                      <RequestCard key={req.id} booking={req} onAccept={handleAccept} onDecline={handleDecline} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* My Jobs */}
            {activeFilter !== "Pending Request" && (
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-base font-bold text-gray-900">My Jobs</h2>
                </div>

                {isLoading && filteredJobs.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
                ) : filteredJobs.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-3xl">📋</p>
                    <p className="mt-2 text-sm text-gray-400">No jobs yet</p>
                  </div>
                ) : (
                  <div className="max-h-[600px] overflow-y-auto divide-y divide-gray-100">
                    {filteredJobs.map((job) => (
                      <JobCard
                        key={job.id}
                        booking={job}
                        providerProfession={providerProfession}
                        onDismiss={handleDismissBooking}
                        onNavigate={navigate}
                        onAdvanceStatus={handleAdvanceStatus}
                        onCancelBooking={(b) => setCancelingBooking(b)}
                        onViewDetails={(b) => setDetailBooking(b)}
                        onMarkComplete={handleMarkComplete}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: Upcoming Schedule + Quick Actions */}
          <div className="space-y-4">

            {/* Upcoming Schedule */}
            {(() => {
              const nextJob = upcomingJobs[0];
              const nextJobDate = nextJob?.date || (nextJob?.serviceDate ? new Date(nextJob.serviceDate).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "");
              const nextJobTime = nextJob?.time || nextJob?.timeSlot || "";
              const nextJobSchedule = [nextJobDate, nextJobTime].filter(Boolean).join(" · ");
              const statusLabel = nextJob?.status === "Confirmed" ? "Scheduled" : nextJob?.status || "Scheduled";

              return (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">NEXT UP</p>
                      <h3 className="mt-0.5 text-base font-bold text-gray-900">Upcoming Schedule</h3>
                    </div>
                    {nextJob && (
                      <span className="rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs font-medium border border-slate-200">
                        {statusLabel}
                      </span>
                    )}
                  </div>

                  {!nextJob ? (
                    <div className="py-8 text-center">
                      <p className="text-sm font-medium text-gray-700">No upcoming jobs</p>
                      <p className="mt-1 text-xs text-gray-400">Accepted bookings will appear here.</p>
                    </div>
                  ) : (
                    <div className="mt-4">
                      {/* Schedule date and time */}
                      <p className="text-sm font-semibold text-[#547f9e]">
                        {nextJobSchedule}
                      </p>

                      {/* Task title */}
                      <h4 className="mt-2 text-base font-bold text-gray-900">
                        {nextJob.task || nextJob.cred || "Booking"}
                      </h4>

                      {/* Client name */}
                      <p className="mt-0.5 text-sm text-gray-500">
                        {nextJob.client || nextJob.clientName || nextJob.worker || "Client"}
                      </p>

                      {/* Location divider */}
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        <p className="text-xs text-gray-500">
                          {nextJob.address || nextJob.location || "Location not specified"}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="mt-4 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/provider/messages?bookingId=${nextJob.id}`)}
                          className="w-full rounded-full bg-[#527d9e] hover:bg-[#436782] text-white py-2.5 text-center text-sm font-medium shadow-xs transition"
                        >
                          Open conversation
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveFilter("Active");
                            window.scrollTo({ top: 350, behavior: "smooth" });
                          }}
                          className="w-full rounded-full border border-gray-200 bg-white py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition shadow-xs"
                        >
                          View active jobs
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Quick Actions */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h3 className="text-sm font-bold text-gray-900">Quick Actions</h3>
              </div>
              <div className="divide-y divide-gray-100">
                <button
                  type="button"
                  onClick={() => navigate("/provider/messages")}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  <ChatIcon />
                  <span>Messages</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/provider-bookings")}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  <BookIcon />
                  <span>All Bookings</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/provider-profile")}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  <UserIcon />
                  <span>My Profile</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Accept confirmation modal ──────────────────────────────────── */}
      {acceptingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAcceptingId(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900">Accept Request?</h3>
              <p className="mt-2 text-sm text-gray-500">
                {pendingRequest
                  ? `Accept ${pendingRequest.client || pendingRequest.clientName || "this client"}'s request for "${pendingRequest.task || "this service"}"?`
                  : "Accept this booking request?"}
              </p>
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => setAcceptingId(null)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                  Cancel
                </button>
                <button type="button" onClick={confirmAccept} className="flex-1 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-700">
                  Accept
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Status change confirmation modal ──────────────────────────── */}
      {statusChange && (
        <StatusChangeConfirmation
          nextStatus={statusChange.nextStatus}
          onConfirm={() => updateBookingStatus(statusChange.bookingId, statusChange.status)}
          onClose={() => setStatusChange(null)}
        />
      )}

      {/* ── Mark Complete — Completion Proof Modal ─────────────────────── */}
      {completionBooking && (
        <CompletionProofModal
          bookingName={completionBooking.task || completionBooking.client || "this booking"}
          onSubmit={(note, photos) => submitCompletionProof(completionBooking.id, note, photos)}
          onClose={() => setCompletionBooking(null)}
        />
      )}

      {/* ── Cancel booking confirmation modal ─────────────────────────── */}
      {cancelingBooking && (
        <StatusChangeConfirmation
          nextStatus="Cancelled"
          cancellationRequiresApproval={requiresCancellationApproval(cancelingBooking)}
          canConfirm={!requiresCancellationApproval(cancelingBooking) || Boolean(cancellationReason.trim())}
          onConfirm={async () => {
            await requestCancellation(cancelingBooking.id, "request", cancellationReason);
            setCancelingBooking(null);
            setCancellationReason("");
          }}
          onClose={() => {
            setCancelingBooking(null);
            setCancellationReason("");
          }}
        >
          <p className="mt-2 text-sm text-gray-600">
            {cancelingBooking.task} for {cancelingBooking.client}
          </p>
          {requiresCancellationApproval(cancelingBooking) && (
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Reason for cancellation
              <textarea
                value={cancellationReason}
                onChange={(event) => setCancellationReason(event.target.value)}
                maxLength={500}
                rows={3}
                required
                placeholder="Explain why you need to cancel"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
              />
            </label>
          )}
        </StatusChangeConfirmation>
      )}

      {/* ── Job Detail Modal ───────────────────────────────────────────── */}
      {detailBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetailBooking(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-base font-bold text-gray-900">Job Details</h3>
              <button
                type="button"
                onClick={() => setDetailBooking(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Avatar name={detailBooking.client || "Client"} image={detailBooking.clientProfileImage} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 truncate">{detailBooking.client || "Client"}</p>
                  <p className="text-xs text-gray-400">
                    {detailBooking.createdAt ? `Submitted ${fmtDate(detailBooking.createdAt)}` : ""}
                  </p>
                </div>
                <StatusBadge status={detailBooking.status} />
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5">
                <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Task</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{detailBooking.task || "Booking"}</p>
                {detailBooking.description && (
                  <p className="text-sm text-gray-600 mt-1">{detailBooking.description}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Location</p>
                  <p className="font-medium text-gray-800 mt-0.5">{detailBooking.address || "Not specified"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Schedule</p>
                  <p className="font-medium text-gray-800 mt-0.5">{detailBooking.date} {detailBooking.time ? `· ${detailBooking.time}` : ""}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Price</p>
                  <p className="font-bold text-gray-900 mt-0.5">{detailBooking.price != null ? (String(detailBooking.price).startsWith("P") || String(detailBooking.price).startsWith("₱") ? detailBooking.price : `P${detailBooking.price}`) : "Free"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Category</p>
                  <p className="font-medium text-gray-800 mt-0.5">
                    {(Array.isArray(detailBooking.professions) && detailBooking.professions.length > 0 ? detailBooking.professions.join(", ") : null) ||
                      (detailBooking.cred && detailBooking.cred !== "Service provider" ? detailBooking.cred : null) ||
                      (detailBooking.category && detailBooking.category !== "General Service" ? detailBooking.category : null) ||
                      detailBooking.serviceCategory ||
                      providerProfession ||
                      "Professional Service"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Urgency</p>
                  <p className="font-medium text-gray-800 mt-0.5">{detailBooking.urgency || "Flexible"}</p>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDetailBooking(null);
                    navigate(`/provider/messages?bookingId=${detailBooking.id}`);
                  }}
                  className="flex-1 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 transition"
                >
                  Chat with Client
                </button>
                <button
                  type="button"
                  onClick={() => setDetailBooking(null)}
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
