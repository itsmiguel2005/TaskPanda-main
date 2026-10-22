export default function BookingMaintenanceNotice({ availability, className = "" }) {
  if (!availability?.isPaused && !availability?.isUnavailable) return null;

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
        availability.isPaused
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : "border-slate-200 bg-slate-50 text-slate-800"
      } ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4m0 4h.01" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {availability.isPaused ? "New booking requests are temporarily paused" : "Booking availability couldn’t be checked"}
        </p>
        <p className="mt-1 text-xs leading-5">
          {availability.isPaused
            ? "We’re performing maintenance. You can still browse providers and manage existing bookings. Please check back soon."
            : "Please check your connection and try again."}
        </p>
        {availability.isUnavailable && (
          <button type="button" onClick={availability.retry} className="mt-2 rounded font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
