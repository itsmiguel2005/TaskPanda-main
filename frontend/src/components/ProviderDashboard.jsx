import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useBookings } from "../context/BookingContext.jsx";
import Header from "../components/Header.jsx";
import BookingPriceBreakdown from "../components/BookingPriceBreakdown.jsx";
import StatusChangeConfirmation from "./StatusChangeConfirmation.jsx";
import { BookingCardSkeletonList } from "./Skeletons.jsx";
import CompletionProofModal from "./CompletionProofModal.jsx";
import { canRequestCancellation, requiresCancellationApproval } from "../utils/bookingCancellation.js";
import { canArriveForSameDayBooking, hasScheduleConflict } from "../utils/bookingArrival.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function parsePrice(str) {
  const amount = Number(String(str ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function formatPhpAmount(value) {
  const amount = Number(value);
  return `₱${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
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
    "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
    Completed: "bg-blue-50 text-blue-700 border-blue-200",
    Settled: "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Cancellation Requested": "bg-amber-50 text-amber-700 border-amber-200",
    Cancelled: "bg-red-50 text-red-700 border-red-200",
    "Declined by Provider": "bg-rose-50 text-rose-800 border-rose-200",
    Expired: "bg-slate-100 text-slate-700 border-slate-200",
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
  { key: "Expired", label: "Expired" },
];

// ─── Incoming Request card ───────────────────────────────────────────────────

function RequestCard({ booking, allBookings, onAccept, onDecline, onOpenConversation, currentTime }) {
  const clientName = booking.client || booking.clientName || booking.worker || "Client";
  // Use pre-formatted date string from API + raw timeSlot string — avoids UTC offset conversion bug
  const requestedDate = booking.date || (booking.serviceDate ? new Date(booking.serviceDate).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "");
  const requestedTime = [requestedDate, booking.time || booking.timeSlot].filter(Boolean).join(", ");
  const address = booking.address || booking.location || "";
  const totalPrice = booking.totalPrice ?? booking.offeredPrice ?? booking.offer ?? 0;
  const requestExpiresAt = booking.requestExpiresAt ? new Date(booking.requestExpiresAt).getTime() : null;
  const secondsRemaining = requestExpiresAt == null ? null : Math.max(0, Math.ceil((requestExpiresAt - currentTime.getTime()) / 1000));
  const requestExpired = secondsRemaining === 0;
  const arrivalFeasible = canArriveForSameDayBooking(booking, currentTime);
  const scheduleConflict = hasScheduleConflict(booking, allBookings, booking.id);
  const acceptDisabled = requestExpired || !arrivalFeasible || scheduleConflict;

  return (
    <div className="content-arrive border-b border-sky-100/80 px-4 py-5 last:border-b-0 sm:px-5">
      {/* Row 1: avatar + client + badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar name={clientName} image={booking.clientProfileImage} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{clientName}</p>
            <p className="text-[11px] text-slate-500">New booking request</p>
          </div>
        </div>
        <StatusBadge status="Pending Request" />
      </div>

      {/* Task title */}
      <p className="mt-3 text-base font-bold text-slate-900">{booking.task || booking.cred || "Booking"}</p>
      <p className="mt-0.5 text-sm leading-6 text-slate-600">{booking.description || ""}</p>

      {/* Location + Requested time */}
      <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-1.5">
        {address && (
          <div className="flex items-center gap-1.5">
            <LocationIcon />
            <div>
              <p className="dashboard-kicker">Location</p>
                <p className="text-xs text-slate-700">{address}</p>
            </div>
          </div>
        )}
        {requestedTime && (
          <div className="flex items-center gap-1.5">
            <ClockIcon />
            <div>
              <p className="dashboard-kicker">Requested time</p>
              <p className="text-xs text-slate-700">{requestedTime}</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold tabular-nums text-white">Total {formatPhpAmount(totalPrice)}</span>
        </div>
      </div>

      {secondsRemaining != null && (
        <p className={`mt-3 text-sm font-semibold tabular-nums ${requestExpired ? "text-rose-700" : "text-amber-800"}`} role="timer" aria-live="off">
          {requestExpired
            ? "Request expired"
            : `Same-day request · expires in ${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, "0")}`}
        </p>
      )}
      {!arrivalFeasible && (
        <p id={`arrival-notice-${booking.id}`} className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900" role="status">
          Arrival time missed—please request a schedule adjustment
        </p>
      )}
      {scheduleConflict && (
        <p id={`schedule-notice-${booking.id}`} className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900" role="status">
          This task duration overlaps another booking. Ask the client to choose a shorter duration or another time.
        </p>
      )}

      <BookingPriceBreakdown booking={booking} className="mt-4" />

      <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-sm">
          <button
            type="button"
            onClick={() => onAccept(booking.id)}
            disabled={acceptDisabled}
            aria-describedby={scheduleConflict ? `schedule-notice-${booking.id}` : !arrivalFeasible ? `arrival-notice-${booking.id}` : undefined}
            className="dashboard-primary-button dashboard-focus px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => onDecline(booking.id)}
            disabled={requestExpired}
            className="dashboard-secondary-button dashboard-focus px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            Decline
          </button>
          <button type="button" onClick={() => onOpenConversation(booking.id)} className="dashboard-secondary-button dashboard-focus col-span-2 px-4 py-2.5 text-sm text-blue-700">Message client to negotiate</button>
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
  const isTerminal = ["Cancelled", "Declined by Provider", "Expired"].includes(status);

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
                    ? "bg-blue-600"
                    : isNext
                    ? "bg-sky-100 group-hover:bg-blue-200"
                    : "bg-sky-100"
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
  const category =
    (Array.isArray(booking.professions) && booking.professions.length > 0 ? booking.professions.join(", ") : null) ||
    (booking.cred && booking.cred !== "Service provider" ? booking.cred : null) ||
    (booking.category && booking.category !== "General Service" ? booking.category : null) ||
    (booking.serviceCategory && booking.serviceCategory !== "General Service" ? booking.serviceCategory : null) ||
    providerProfession ||
    "Professional Service";
  // X (dismiss) button only for terminal statuses
  const isDismissable = ["Settled", "Cancelled", "Declined by Provider", "Expired"].includes(booking.status);

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
    <div className="content-arrive border-b border-sky-100/80 p-4 last:border-b-0 sm:p-5">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_190px]">
        {/* Left Column: Details & Progress Tracker */}
        <div className="min-w-0">
          {/* Header row: avatar + client info + status badge */}
          <div className="flex items-center gap-3">
            <Avatar name={clientName} image={booking.clientProfileImage} />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-900">{clientName}</p>
              {submittedAt && <p className="mt-0.5 text-xs text-slate-500">Submitted {submittedAt}</p>}
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
            <h3 className="text-base font-bold text-slate-900">{booking.task || booking.cred || "Booking"}</h3>
            {booking.description && <p className="mt-0.5 text-sm leading-6 text-slate-600">{booking.description}</p>}
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
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <p className="dashboard-kicker">Location</p>
              <p className="mt-1 text-sm text-slate-700">{address || "Not specified"}</p>
            </div>
            <div>
              <p className="dashboard-kicker">Schedule</p>
              <p className="mt-1 text-sm text-slate-700">{schedule || "Flexible schedule"}</p>
            </div>
            <div>
              <p className="dashboard-kicker">Service category</p>
              <p className="mt-1 text-sm text-slate-700">{category || "General Service"}</p>
            </div>
          </div>
          <BookingPriceBreakdown booking={booking} className="mt-4" />
        </div>

        {/* Right Column: Stacked Action Buttons */}
        <div className="flex flex-col gap-2.5 w-full sm:w-48 shrink-0 justify-start">
          <button
            type="button"
            onClick={() => onNavigate(`/provider/messages?bookingId=${booking.id}`)}
            className="dashboard-secondary-button dashboard-focus w-full py-2.5 text-center text-sm"
          >
            Open conversation
          </button>
          <button
            type="button"
            onClick={() => onViewDetails(booking)}
            className="dashboard-secondary-button dashboard-focus w-full py-2.5 text-center text-sm"
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
              className="dashboard-primary-button dashboard-focus w-full py-2.5 text-center text-sm"
            >
              {actionButton.label}
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => onCancelBooking(booking)}
              className="w-full rounded-xl border border-rose-200 bg-white py-2.5 text-center text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
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
  const { bookings, dismissedBookingIds, bookingReviewStats, isLoading, error, dismissDashboardBooking, restoreDashboardBookings, updateBookingStatus, requestCancellation, submitCompletionProof } = useBookings();

  const [activeFilter, setActiveFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [acceptingId, setAcceptingId] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [statusChange, setStatusChange] = useState(null);
  const [cancelingBooking, setCancelingBooking] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [detailBooking, setDetailBooking] = useState(null);
  const [completionBooking, setCompletionBooking] = useState(null);
  // Fresh provider stats fetched directly (user object from localStorage may be stale)
  const [providerStats, setProviderStats] = useState({ rating: 0, reviews: 0 });

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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

  const handleDismissBooking = useCallback((bookingId) => {
    void dismissDashboardBooking(bookingId);
  }, [dismissDashboardBooking]);

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
    if (bookingReviewStats) {
      return {
        rating: Number(bookingReviewStats.averageRating || 0),
        reviews: Number(bookingReviewStats.totalReviews || 0),
      };
    }
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
  }, [bookings, bookingReviewStats, user]);

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
    const activeJobs = jobs.filter((j) => !["Completed", "Settled", "Cancelled", "Declined by Provider", "Expired"].includes(j.status)).length;
    const completedJobs = jobs.filter((j) => ["Completed", "Settled"].includes(j.status)).length;
    const earnings = jobs
      .filter((j) => ["Completed", "Settled"].includes(j.status))
      .reduce((sum, j) => {
        const total = Number(j.totalPrice);
        return sum + (Number.isFinite(total) ? total : parsePrice(j.price));
      }, 0);
    return { rating: ratingData.rating, reviews: ratingData.reviews, activeJobs, completedJobs, earnings };
  }, [jobs, ratingData]);

  // ── filter counts ────────────────────────────────────────────────────────────
  const filterCounts = useMemo(() => {
    const visibleBookings = bookings;
    const total = visibleBookings.length;
    const pending = visibleBookings.filter((b) => b.status === "Pending Request").length;
    const active = visibleBookings.filter((b) => ["Confirmed", "On the Way", "In Progress", "Cancellation Requested"].includes(b.status)).length;
    const completed = visibleBookings.filter((b) => b.status === "Completed").length;
    const settled = visibleBookings.filter((b) => b.status === "Settled").length;
    const cancelled = visibleBookings.filter((b) => b.status === "Cancelled").length;
    const declined = visibleBookings.filter((b) => b.status === "Declined by Provider").length;
    const expired = visibleBookings.filter((b) => b.status === "Expired").length;
    return { All: total, "Pending Request": pending, Active: active, Completed: completed, Settled: settled, Cancelled: cancelled, "Declined by Provider": declined, Expired: expired };
  }, [bookings, dismissedBookingIds]);

  // ── filtered job list ─────────────────────────────────────────────────────
  const filteredJobs = useMemo(() => {
    let list = jobs;
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
  const pendingRequestExpired = !pendingRequest || Boolean(pendingRequest.requestExpiresAt
    && new Date(pendingRequest.requestExpiresAt).getTime() <= currentTime.getTime());
  const pendingScheduleConflict = pendingRequest
    ? hasScheduleConflict(pendingRequest, bookings, pendingRequest.id)
    : false;
  const pendingArrivalFeasible = pendingRequest
    ? canArriveForSameDayBooking(pendingRequest, currentTime)
    : false;

  return (
    <div className="dashboard-page">
      <Header showNav activeTab="Home" role="provider" notifCount={requests.length} />

      <div className="dashboard-shell max-w-7xl">

        {/* ── Page title ─────────────────────────────────────────────────── */}
        <div className="dashboard-panel mb-5 flex flex-col gap-2 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7">
          <div>
            <p className="dashboard-kicker">Provider workspace</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Manage your work</h1>
            <p className="mt-1 text-sm text-slate-600">Requests, active jobs, and earnings in one place.</p>
          </div>
          {providerProfession && <p className="text-sm font-semibold text-blue-700">{providerProfession}</p>}
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>
        )}

        {/* ── Stat cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* Rating */}
          <div className="dashboard-stat">
            <p className="dashboard-kicker">Rating</p>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <svg key={s} viewBox="0 0 24 24" className={`h-4 w-4 ${s <= Math.round(stats.rating) ? "text-amber-400" : "text-gray-200"}`} fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
              {stats.rating > 0 && (
                <span className="text-sm font-bold text-slate-800">{stats.rating.toFixed(1)}</span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">{stats.reviews} {stats.reviews === 1 ? "review" : "reviews"}</p>
          </div>

          {/* Active Jobs */}
          <div className="dashboard-stat bg-sky-50/70">
            <p className="dashboard-kicker">Active jobs</p>
            <p className="mt-2 text-3xl font-extrabold tabular-nums text-slate-900">{stats.activeJobs}</p>
            <p className="mt-1 text-xs text-slate-500">Currently in progress</p>
          </div>

          {/* Completed Jobs */}
          <div className="dashboard-stat">
            <p className="dashboard-kicker">Completed jobs</p>
            <p className="mt-2 text-3xl font-extrabold tabular-nums text-slate-900">{stats.completedJobs}</p>
            <p className="mt-1 text-xs text-slate-500">All-time completed</p>
          </div>

          {/* Total Earnings */}
          <div className="dashboard-stat">
            <p className="dashboard-kicker">Total earnings</p>
            <p className="mt-2 text-3xl font-extrabold tabular-nums text-slate-900">{formatPhpAmount(stats.earnings)}</p>
            <p className="mt-1 text-xs text-slate-500">From completed jobs</p>
          </div>
        </div>

        {/* ── Filter pills + search ─────────────────────────────────────── */}
        <div className="mt-5 space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveFilter(key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition whitespace-nowrap ${
                  activeFilter === key
                    ? "bg-slate-900 text-white"
                    : "border border-sky-100 bg-white text-slate-600 hover:bg-sky-50"
                }`}
              >
                {label}
                <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  activeFilter === key ? "bg-white/20 text-white" : "bg-sky-50 text-blue-950"
                }`}>
                  {filterCounts[key] ?? 0}
                </span>
              </button>
            ))}
          </div>

          <label className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-sky-100 bg-white px-3.5 shadow-sm transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/30">
            <span className="sr-only">Search bookings</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client or repair"
              className="min-w-0 w-full bg-transparent py-2 text-sm text-slate-800 placeholder:text-slate-500 outline-none"
            />
          </label>
        </div>

        {/* ── Two-column layout ─────────────────────────────────────────── */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">

          {/* LEFT: Incoming Requests + My Jobs */}
          <div className="space-y-5">

            {/* Incoming Requests */}
            {(activeFilter === "All" || activeFilter === "Pending Request") && (
              <div className="dashboard-panel">
                <div className="flex items-center gap-2 border-b border-sky-100 px-5 py-4">
                  <h2 className="text-base font-bold tracking-tight text-slate-900">Incoming requests</h2>
                  {requests.length > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-100 px-1.5 text-xs font-bold text-blue-700">
                      {requests.length}
                    </span>
                  )}
                </div>

                {isLoading && requests.length === 0 ? (
                  <BookingCardSkeletonList count={2} label="Loading incoming requests" />
                ) : requests.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-3xl">📭</p>
                    <p className="mt-2 text-sm text-slate-500">No incoming requests</p>
                  </div>
                ) : (
                  <div>
                    {requests.map((req) => (
                      <RequestCard key={req.id} booking={req} allBookings={bookings} onAccept={handleAccept} onDecline={handleDecline} onOpenConversation={(bookingId) => navigate(`/provider/messages?bookingId=${bookingId}`)} currentTime={currentTime} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* My Jobs */}
            {activeFilter !== "Pending Request" && (
              <div className="dashboard-panel">
                <div className="flex items-center justify-between gap-3 border-b border-sky-100 px-5 py-4">
                  <h2 className="text-base font-bold tracking-tight text-slate-900">My jobs</h2>
                  {dismissedBookingIds.length > 0 && (
                    <button type="button" onClick={() => void restoreDashboardBookings()} className="text-xs font-semibold text-blue-700 underline-offset-4 hover:text-blue-800 hover:underline">
                      Restore hidden
                    </button>
                  )}
                </div>

                {isLoading && filteredJobs.length === 0 ? (
                  <BookingCardSkeletonList count={2} label="Loading jobs" />
                ) : filteredJobs.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-3xl">📋</p>
                    <p className="mt-2 text-sm text-slate-500">{dismissedBookingIds.length ? "No jobs match this view." : "No jobs yet"}</p>
                  </div>
                ) : (
                  <div className="max-h-180 overflow-y-auto divide-y divide-sky-100/80">
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
                <div className="dashboard-panel p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="dashboard-kicker">Next up</p>
                      <h3 className="mt-1 text-base font-bold text-slate-900">Upcoming schedule</h3>
                    </div>
                    {nextJob && (
                      <span className="rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs font-medium border border-slate-200">
                        {statusLabel}
                      </span>
                    )}
                  </div>

                  {!nextJob ? (
                    <div className="py-8 text-center">
                        <p className="text-sm font-medium text-slate-700">No upcoming jobs</p>
                        <p className="mt-1 text-xs text-slate-500">Accepted bookings will appear here.</p>
                    </div>
                  ) : (
                    <div className="mt-4">
                      {/* Schedule date and time */}
                      <p className="text-sm font-semibold text-blue-700">
                        {nextJobSchedule}
                      </p>

                      {/* Task title */}
                      <h4 className="mt-2 text-base font-bold text-slate-900">
                        {nextJob.task || nextJob.cred || "Booking"}
                      </h4>

                      {/* Client name */}
                      <p className="mt-0.5 text-sm text-slate-600">
                        {nextJob.client || nextJob.clientName || nextJob.worker || "Client"}
                      </p>

                      {/* Location divider */}
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        <p className="text-xs text-slate-600">
                          {nextJob.address || nextJob.location || "Location not specified"}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="mt-4 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/provider/messages?bookingId=${nextJob.id}`)}
                          className="dashboard-primary-button dashboard-focus w-full py-2.5 text-center text-sm"
                        >
                          Open conversation
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveFilter("Active");
                            window.scrollTo({ top: 350, behavior: "smooth" });
                          }}
                          className="dashboard-secondary-button dashboard-focus w-full py-2.5 text-center text-sm"
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
            <div className="dashboard-panel">
              <div className="border-b border-sky-100 px-5 py-4">
                <h3 className="text-sm font-bold text-slate-900">Quick actions</h3>
              </div>
              <div className="divide-y divide-sky-100/80">
                <button
                  type="button"
                  onClick={() => navigate("/provider/messages")}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-sm text-blue-950 transition hover:bg-sky-50"
                >
                  <ChatIcon />
                  <span>Messages</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/provider-bookings")}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-sm text-blue-950 transition hover:bg-sky-50"
                >
                  <BookIcon />
                  <span>All Bookings</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/provider-profile")}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-sm text-blue-950 transition hover:bg-sky-50"
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
          <div className="dashboard-panel w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-900">Accept request?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {pendingRequest
                  ? `Accept ${pendingRequest.client || pendingRequest.clientName || "this client"}'s request for "${pendingRequest.task || "this service"}"?`
                  : "Accept this booking request?"}
              </p>
              {pendingRequestExpired && (
                <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800" role="alert">
                  This booking request has expired.
                </p>
              )}
              {!pendingRequestExpired && !pendingArrivalFeasible && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900" role="alert">
                  Arrival time missed—please request a schedule adjustment
                </p>
              )}
              {!pendingRequestExpired && pendingScheduleConflict && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900" role="alert">
                  This task duration overlaps another booking. Ask the client to choose a shorter duration or another time.
                </p>
              )}
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => setAcceptingId(null)} className="dashboard-secondary-button dashboard-focus flex-1 py-2.5 text-sm">
                  Cancel
                </button>
                <button type="button" onClick={confirmAccept} disabled={pendingRequestExpired || !pendingArrivalFeasible || pendingScheduleConflict} className="dashboard-primary-button dashboard-focus flex-1 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50">
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
            className="dashboard-panel w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-sky-100 px-6 py-4">
              <h3 className="text-base font-bold text-slate-900">Job details</h3>
              <button
                type="button"
                onClick={() => setDetailBooking(null)}
                className="dashboard-focus flex h-8 w-8 items-center justify-center rounded-full text-blue-900 transition hover:bg-sky-50 hover:text-blue-950"
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
                  <p className="truncate font-semibold text-slate-900">{detailBooking.client || "Client"}</p>
                  <p className="text-xs text-slate-500">
                    {detailBooking.createdAt ? `Submitted ${fmtDate(detailBooking.createdAt)}` : ""}
                  </p>
                </div>
                <StatusBadge status={detailBooking.status} />
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3.5">
                <p className="dashboard-kicker text-blue-900">Task</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{detailBooking.task || "Booking"}</p>
                {detailBooking.description && (
                  <p className="mt-1 text-sm leading-6 text-blue-900">{detailBooking.description}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="dashboard-kicker">Location</p>
                  <p className="mt-1 font-medium text-slate-800">{detailBooking.address || "Not specified"}</p>
                </div>
                <div>
                  <p className="dashboard-kicker">Schedule</p>
                  <p className="mt-1 font-medium text-slate-800">{detailBooking.date} {detailBooking.time ? `· ${detailBooking.time}` : ""}</p>
                </div>
                <div>
                  <p className="dashboard-kicker">Category</p>
                  <p className="mt-1 font-medium text-slate-800">
                    {(Array.isArray(detailBooking.professions) && detailBooking.professions.length > 0 ? detailBooking.professions.join(", ") : null) ||
                      (detailBooking.cred && detailBooking.cred !== "Service provider" ? detailBooking.cred : null) ||
                      (detailBooking.category && detailBooking.category !== "General Service" ? detailBooking.category : null) ||
                      detailBooking.serviceCategory ||
                      providerProfession ||
                      "Professional Service"}
                  </p>
                </div>
              </div>
              <BookingPriceBreakdown booking={detailBooking} />
              <div className="flex gap-3 border-t border-sky-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setDetailBooking(null);
                    navigate(`/provider/messages?bookingId=${detailBooking.id}`);
                  }}
                  className="dashboard-primary-button dashboard-focus flex-1 py-2.5 text-sm"
                >
                  Chat with Client
                </button>
                <button
                  type="button"
                  onClick={() => setDetailBooking(null)}
                  className="dashboard-secondary-button dashboard-focus flex-1 py-2.5 text-sm"
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
