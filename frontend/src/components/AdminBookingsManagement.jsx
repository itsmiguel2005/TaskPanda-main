import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { SkeletonBlock } from "./Skeletons.jsx";
import { adminRequest } from "../services/adminApi.js";
import { DEFAULT_ESTIMATED_DURATION_MINUTES, formatEstimatedDuration } from "../utils/bookingDuration.js";

const currency = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateTime = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateOnly = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });
const statusFilters = [
  { id: "", label: "All bookings" },
  { id: "pending", label: "Pending Request" },
  { id: "approved", label: "Confirmed" },
  { id: "in_progress", label: "In Progress" },
  { id: "complete", label: "Completed" },
  { id: "settled", label: "Settled" },
  { id: "canceled", label: "Cancelled" },
];
const overrideStatuses = [
  ["pending", "Pending Request"],
  ["approved", "Confirmed"],
  ["in_progress", "In Progress"],
  ["complete", "Completed"],
  ["settled", "Settled"],
  ["canceled", "Cancelled"],
  ["declined", "Declined"],
  ["expired", "Expired"],
];
const bookingSteps = ["Pending Request", "Confirmed", "In Progress", "Completed"];

function amount(value) {
  return currency.format(Number(value || 0));
}

function formatDate(value, formatter = dateTime) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : formatter.format(date);
}

function normalizedStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["pending", "pending request"].includes(value)) return "pending";
  if (["approved", "confirmed"].includes(value)) return "approved";
  if (["en_route", "in_progress", "on the way", "in progress"].includes(value)) return "in_progress";
  if (["complete", "closed", "completed"].includes(value)) return "complete";
  if (["settled"].includes(value)) return "settled";
  if (["canceled", "cancelled"].includes(value)) return "canceled";
  if (["declined", "declined by provider"].includes(value)) return "declined";
  return value;
}

function statusRank(status) {
  const normalized = normalizedStatus(status);
  if (normalized === "pending") return 0;
  if (normalized === "approved") return 1;
  if (normalized === "in_progress") return 2;
  if (["complete", "settled"].includes(normalized)) return 3;
  return -1;
}

function StatusBadge({ status }) {
  const styles = {
    pending: "border-amber-200 bg-amber-50 text-amber-800",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
    in_progress: "border-sky-200 bg-sky-50 text-sky-800",
    complete: "border-blue-200 bg-blue-50 text-blue-800",
    settled: "border-violet-200 bg-violet-50 text-violet-800",
    canceled: "border-rose-200 bg-rose-50 text-rose-800",
    declined: "border-rose-200 bg-rose-50 text-rose-800",
    expired: "border-slate-300 bg-slate-100 text-slate-700",
  };
  const normalized = normalizedStatus(status);
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[normalized] || "border-slate-200 bg-slate-100 text-slate-700"}`}>
      {status}
    </span>
  );
}

function Participant({ label, person }) {
  if (!person) {
    return <div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-sm text-slate-500">Profile unavailable</p></div>;
  }
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-sm font-bold text-sky-900">
        {person.profileImage ? <img src={person.profileImage} alt="" className="h-full w-full object-cover" /> : person.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <Link
          to={`/admin?section=users&userId=${encodeURIComponent(person.id)}`}
          className="mt-0.5 block truncate text-sm font-semibold text-blue-900 underline decoration-blue-200 underline-offset-2 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          {person.name}
        </Link>
        <p className="truncate text-xs text-slate-500">{person.email || person.username || "No contact details"}</p>
      </div>
    </div>
  );
}

function BookingTimeline({ booking }) {
  const entries = booking.statusHistory || [];
  const rank = Math.max(statusRank(booking.status), ...entries.map((entry) => statusRank(entry.status)));
  const stepDates = bookingSteps.map((step, index) => {
    const relevantStatuses = [
      ["pending", "Pending Request"],
      ["approved", "Confirmed"],
      ["en_route", "in_progress", "On the Way", "In Progress"],
      ["complete", "closed", "Completed", "settled", "Settled"],
    ][index];
    const entry = entries.find((item) => relevantStatuses.includes(item.status));
    return entry?.at || (index === 0 ? booking.createdAt : null);
  });

  return (
    <ol className="mt-5 grid grid-cols-4 gap-2" aria-label="Booking status timeline">
      {bookingSteps.map((step, index) => {
        const done = rank >= index;
        const current = rank === index;
        return (
          <li key={step} className="min-w-0">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${done ? "border-blue-800 bg-blue-800 text-white" : "border-slate-300 bg-white text-slate-500"}`}>
              {done && !current ? (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>
              ) : index + 1}
            </div>
            <p className={`mt-2 text-[11px] font-semibold leading-4 ${current ? "text-blue-950" : done ? "text-slate-700" : "text-slate-500"}`}>{step}</p>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">{stepDates[index] ? formatDate(stepDates[index]) : "Not reached"}</p>
          </li>
        );
      })}
    </ol>
  );
}

function BookingDrawer({ booking, onClose, onOverride }) {
  const status = normalizedStatus(booking.status);
  const isException = ["canceled", "declined", "expired"].includes(status);
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close booking details" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-slate-950/40" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-drawer-title"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const focusable = Array.from(event.currentTarget.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
          if (!focusable.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={booking.statusLabel} />
              <span className="text-xs text-slate-500">Booking {booking.id.slice(-8).toUpperCase()}</span>
            </div>
            <h2 id="booking-drawer-title" className="mt-3 text-xl font-bold leading-7 text-slate-950">{booking.task}</h2>
            <p className="mt-1 text-sm text-slate-600">{formatDate(booking.serviceDate, dateOnly)}{booking.timeSlot ? ` · ${booking.timeSlot}` : ""}</p>
          </div>
          <button type="button" autoFocus onClick={onClose} aria-label="Close booking details" className="dashboard-focus rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {isException && (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-950">
              This booking is in an exception state. Review its history and participant details before applying an override.
            </div>
          )}
          <section className="mt-1" aria-labelledby="booking-participants-heading">
            <h3 id="booking-participants-heading" className="text-sm font-bold text-slate-950">Participants</h3>
            <div className="mt-3 grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
              <Participant label="Client" person={booking.client} />
              <Participant label="Provider" person={booking.provider} />
            </div>
          </section>

          <section className="mt-6" aria-labelledby="booking-timeline-heading">
            <h3 id="booking-timeline-heading" className="text-sm font-bold text-slate-950">Status timeline</h3>
            <BookingTimeline booking={booking} />
            {isException && <p className="mt-3 text-xs text-amber-800">Current state: {booking.statusLabel}. This exception is not a completed milestone.</p>}
          </section>

          <section className="mt-7" aria-labelledby="booking-breakdown-heading">
            <div className="flex items-center justify-between gap-3">
              <h3 id="booking-breakdown-heading" className="text-sm font-bold text-slate-950">Transaction breakdown</h3>
              <span className="text-xs text-slate-500">{booking.paymentMethod === "cash" ? "Cash" : booking.paymentMethod}</span>
            </div>
            <dl className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 px-4">
              <div className="flex justify-between gap-4 py-3 text-sm">
                <dt className="text-slate-600">Task offer</dt>
                <dd className="font-semibold tabular-nums text-slate-950">{amount(booking.offeredPrice)}</dd>
              </div>
              <div className="py-3">
                <div className="flex justify-between gap-4 text-sm">
                  <dt className="text-slate-600">Travel fee</dt>
                  <dd className="font-semibold tabular-nums text-slate-950">{amount(booking.travelFee)}</dd>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {booking.travelDistanceKm == null
                    ? "Distance quote not recorded"
                    : `${booking.travelDistanceKm.toFixed(2)} km`}
                  {booking.travelDistanceKm == null
                    ? ""
                    : " · amount is the fare saved with this booking"}
                </p>
                {booking.travelFeeDiscount > 0 && (
                  <p className="mt-1 text-xs text-emerald-800">Voucher discount: −{amount(booking.travelFeeDiscount)} · original quote {amount(booking.travelFeeBeforeDiscount)}</p>
                )}
              </div>
              {booking.tipAmount > 0 && (
                <div className="flex justify-between gap-4 py-3 text-sm">
                  <dt className="text-slate-600">Tip</dt>
                  <dd className="font-semibold tabular-nums text-slate-950">{amount(booking.tipAmount)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 py-3.5 text-sm">
                <dt className="font-bold text-slate-950">Client total</dt>
                <dd className="font-bold tabular-nums text-slate-950">{amount(booking.total)}</dd>
              </div>
            </dl>
          </section>

          <section className="mt-6" aria-labelledby="booking-details-heading">
            <h3 id="booking-details-heading" className="text-sm font-bold text-slate-950">Booking details</h3>
            <dl className="mt-3 grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
              <dt className="text-slate-500">Requested</dt><dd className="break-words text-slate-800">{formatDate(booking.createdAt)}</dd>
              <dt className="text-slate-500">Address</dt><dd className="break-words text-slate-800">{booking.address || "Not provided"}</dd>
              <dt className="text-slate-500">Estimated duration</dt><dd className="text-slate-800">{formatEstimatedDuration(booking.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES)}</dd>
              <dt className="text-slate-500">Urgency</dt><dd className="text-slate-800">{booking.urgency}</dd>
              {booking.requestExpiresAt && <><dt className="text-slate-500">Request TTL</dt><dd className="text-slate-800">{formatDate(booking.requestExpiresAt)}</dd></>}
              {booking.workCompletedAt && <><dt className="text-slate-500">Work completed</dt><dd className="text-slate-800">{formatDate(booking.workCompletedAt)}</dd></>}
              {booking.settledAt && <><dt className="text-slate-500">Settled</dt><dd className="text-slate-800">{formatDate(booking.settledAt)}</dd></>}
              {booking.cancellationRequestedAt && <><dt className="text-slate-500">Cancel requested</dt><dd className="text-slate-800">{formatDate(booking.cancellationRequestedAt)}</dd></>}
              {booking.clientConfirmedCash && <><dt className="text-slate-500">Client cash check</dt><dd className="text-slate-800">{formatDate(booking.cashPaidConfirmedAt)}</dd></>}
              {booking.providerConfirmedCash && <><dt className="text-slate-500">Provider cash check</dt><dd className="text-slate-800">{formatDate(booking.cashReceivedConfirmedAt)}</dd></>}
              {booking.cashReceipt?.receiptNumber && <><dt className="text-slate-500">Receipt</dt><dd className="break-words text-slate-800">{booking.cashReceipt.receiptNumber}{booking.cashReceipt.totalAmount == null ? "" : ` · ${amount(booking.cashReceipt.totalAmount)}`}</dd></>}
              {booking.completionNote && <><dt className="text-slate-500">Completion note</dt><dd className="whitespace-pre-wrap break-words text-slate-800">{booking.completionNote}</dd></>}
            </dl>
            {booking.cancellationReason && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-950">Cancellation note</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-amber-900">{booking.cancellationReason}</p>
              </div>
            )}
          </section>

          {(booking.photoUrl || booking.completionPhotos?.length > 0) && (
            <section className="mt-6" aria-labelledby="booking-evidence-heading">
              <h3 id="booking-evidence-heading" className="text-sm font-bold text-slate-950">Service evidence</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {[booking.photoUrl, ...(booking.completionPhotos || [])].filter(Boolean).map((photo, index) => (
                  <a key={`${photo}-${index}`} href={photo} target="_blank" rel="noreferrer" className="dashboard-focus block h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                    <img src={photo} alt={booking.photoUrl && index === 0 ? "Request photo" : `Completion photo ${index + 1 - (booking.photoUrl ? 1 : 0)}`} className="h-full w-full object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {(booking.providerUpdates?.length > 0 || booking.revisionRequests?.length > 0) && (
            <section className="mt-7" aria-labelledby="booking-coordination-heading">
              <h3 id="booking-coordination-heading" className="text-sm font-bold text-slate-950">Coordination &amp; dispute history</h3>
              {booking.providerUpdates?.length > 0 && (
                <ol className="mt-3 space-y-2">
                  {booking.providerUpdates.map((update, index) => (
                    <li key={`update-${index}`} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold capitalize text-slate-900">{update.type === "reschedule" ? "Schedule change" : "Provider note"}</p>
                        <span className="text-[11px] text-slate-500">{update.status} · {formatDate(update.requestedAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-700">{update.note}</p>
                      {update.proposedServiceDate && <p className="mt-1 text-xs text-slate-600">Proposed time: {formatDate(update.proposedServiceDate, dateOnly)}{update.proposedTimeSlot ? ` · ${update.proposedTimeSlot}` : ""}</p>}
                    </li>
                  ))}
                </ol>
              )}
              {booking.revisionRequests?.length > 0 && (
                <ol className="mt-3 space-y-2">
                  {booking.revisionRequests.map((request, index) => (
                    <li key={`revision-${index}`} className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-900">{request.requestedBy?.name || "Participant"} · {request.status}</p>
                        <span className="text-[11px] text-slate-500">{formatDate(request.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-800">{request.note}</p>
                      {request.responseNote && <p className="mt-2 whitespace-pre-wrap break-words border-t border-amber-200 pt-2 text-sm leading-5 text-slate-700">Response: {request.responseNote}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          {booking.adminOverrideHistory?.length > 0 && (
            <section className="mt-7 border-t border-slate-200 pt-5" aria-labelledby="booking-audit-heading">
              <h3 id="booking-audit-heading" className="text-sm font-bold text-slate-950">Admin override audit</h3>
              <ol className="mt-3 space-y-3">
                {[...booking.adminOverrideHistory].reverse().map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-900">{entry.fromLabel} → {entry.toLabel}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{entry.reason}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{entry.adminEmail} · {formatDate(entry.at)}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
        <footer className="border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
          <button type="button" onClick={onOverride} className="dashboard-focus inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-950 active:scale-[0.99]">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden="true"><path d="M10 2.5v3m0 9v3m7.5-7.5h-3m-9 0h-3m2.197-5.303 2.122 2.122m6.364 6.364 2.122 2.122m0-10.608-2.122 2.122m-6.364 6.364-2.122 2.122" /><circle cx="10" cy="10" r="3" /></svg>
            Change booking status
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">Every manual change requires an audit reason.</p>
        </footer>
      </aside>
    </div>
  );
}

function OverrideDialog({ booking, onCancel, onSubmit, busy, error }) {
  const [targetStatus, setTargetStatus] = useState("");
  const [reason, setReason] = useState("");
  const current = normalizedStatus(booking.status);
  const currentLabel = booking.statusLabel;
  const exceptionActions = current === "pending"
    ? [["approved", "Confirm request"], ["expired", "Expire request"], ["canceled", "Force-cancel request"]]
    : current === "complete"
      ? [["settled", "Mark as settled"], ["in_progress", "Reopen as in progress"], ["canceled", "Cancel booking"]]
      : current === "expired"
        ? [["approved", "Resolve timeout · confirm"], ["pending", "Restore to pending"]]
        : current === "canceled"
          ? [["pending", "Restore to pending"], ["approved", "Restore as confirmed"]]
          : [["canceled", "Force-cancel booking"], ["complete", "Mark as completed"], ["settled", "Mark as settled"]];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 px-4 py-6">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="override-title"
        aria-describedby="override-description"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const focusable = Array.from(event.currentTarget.querySelectorAll('button:not([disabled]), select:not([disabled]), textarea:not([disabled])'));
          if (!focusable.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="override-title" className="text-lg font-bold text-slate-950">Confirm manual override</h2>
            <p id="override-description" className="mt-1 text-sm leading-5 text-slate-600">You are changing <span className="font-semibold text-slate-900">{booking.task}</span> from <span className="font-semibold text-slate-900">{currentLabel}</span>.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close override confirmation" className="dashboard-focus rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(targetStatus, reason); }} className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-slate-800">
            New status
            <select autoFocus required value={targetStatus} onChange={(event) => setTargetStatus(event.target.value)} className="dashboard-focus mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
              <option value="">Choose an action</option>
              <optgroup label="Suggested for this booking">
                {exceptionActions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </optgroup>
              <optgroup label="All supported statuses">
                {overrideStatuses.filter(([value]) => !exceptionActions.some(([suggested]) => suggested === value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </optgroup>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Audit reason <span className="font-normal text-rose-700">Required</span>
            <textarea required minLength={5} maxLength={500} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this manual change is needed…" className="dashboard-focus mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal leading-5 text-slate-900 placeholder:text-slate-500" />
            <span className="mt-1 block text-xs font-normal text-slate-500">{reason.trim().length}/500 characters · at least 5 required</span>
          </label>
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCancel} disabled={busy} className="dashboard-focus min-h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={busy || reason.trim().length < 5 || !targetStatus} className="dashboard-focus min-h-10 rounded-xl bg-blue-900 px-4 text-sm font-semibold text-white transition hover:bg-blue-950 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? "Recording override…" : "Confirm and record"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function AdminBookingsManagement() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [resultsRevision, setResultsRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideError, setOverrideError] = useState("");
  const drawerReturnFocus = useRef(null);
  const closeDrawer = useCallback(() => {
    setSelectedBooking(null);
    window.requestAnimationFrame(() => drawerReturnFocus.current?.focus());
  }, []);

  const loadBookings = useCallback(async (signal) => {
    if (!token) {
      logout();
      navigate("/login", { replace: true });
      return;
    }
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilter) params.set("status", statusFilter);
    if (query) params.set("q", query);
    try {
      const result = await adminRequest(`/api/admin/bookings?${params}`, token, { signal });
      const nextBookings = result.bookings || [];
      setBookings(nextBookings);
      setResultsRevision((revision) => revision + 1);
      setSelectedBooking((current) => current ? nextBookings.find((booking) => booking.id === current.id) || current : current);
      setPagination(result.pagination || { page: 1, pages: 1, total: 0 });
    } catch (requestError) {
      if (signal?.aborted) return;
      if (requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(requestError.message || "Could not load admin bookings.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [logout, navigate, page, query, statusFilter, token]);

  useEffect(() => {
    const controller = new AbortController();
    void loadBookings(controller.signal);
    return () => controller.abort();
  }, [loadBookings, refreshKey]);

  useEffect(() => {
    if (!selectedBooking && !showOverride) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || overrideBusy) return;
      if (showOverride) {
        setShowOverride(false);
        setOverrideError("");
      } else {
        closeDrawer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDrawer, overrideBusy, selectedBooking, showOverride]);

  useEffect(() => {
    if (!selectedBooking) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [selectedBooking]);

  const applySearch = (event) => {
    event.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
  };

  const selectFilter = (value) => {
    setPage(1);
    setStatusFilter(value);
  };

  const runOverride = async (targetStatus, reason) => {
    if (!selectedBooking || !targetStatus || reason.trim().length < 5) return;
    setOverrideBusy(true);
    setOverrideError("");
    try {
      const result = await adminRequest(`/api/admin/bookings/${selectedBooking.id}/override`, token, {
        method: "PATCH",
        body: JSON.stringify({ status: targetStatus, reason: reason.trim() }),
      });
      setSelectedBooking(result.booking);
      setBookings((current) => current.map((booking) => booking.id === result.booking.id ? result.booking : booking));
      setShowOverride(false);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      if (requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setOverrideError(requestError.message || "Could not update this booking.");
    } finally {
      setOverrideBusy(false);
    }
  };

  return (
    <section aria-labelledby="admin-bookings-title" className="space-y-4 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="admin-bookings-title" className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Bookings</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">Inspect every booking, review its quoted amounts and status history, and resolve exceptions with an auditable override.</p>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} className="dashboard-focus inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-blue-950 shadow-sm transition hover:bg-sky-50 disabled:cursor-wait disabled:opacity-50">
          {loading ? "Refreshing…" : "Refresh bookings"}
        </button>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="group" aria-label="Filter bookings by status">
        {statusFilters.map((filter) => (
          <button key={filter.id} type="button" aria-pressed={statusFilter === filter.id} onClick={() => selectFilter(filter.id)} className={`dashboard-focus shrink-0 border-b-2 px-3 py-2.5 text-xs font-semibold transition ${statusFilter === filter.id ? "border-blue-800 text-blue-950" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"}`}>
            {filter.label}
          </button>
        ))}
      </div>

      <form onSubmit={applySearch} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row">
        <label htmlFor="admin-booking-search" className="sr-only">Search tasks, participant names, or booking ID</label>
        <input id="admin-booking-search" value={searchInput} maxLength={100} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search task, client, provider, or booking ID" className="dashboard-focus min-h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500" />
        <button type="submit" className="dashboard-focus min-h-10 rounded-xl bg-blue-900 px-4 text-sm font-semibold text-white transition hover:bg-blue-950">Search</button>
      </form>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="dashboard-focus rounded-lg px-2 py-1 font-semibold underline underline-offset-2">Retry</button>
        </div>
      )}

      <section aria-label="Booking records" aria-busy={loading} className="flex h-[calc(100dvh-25rem)] min-h-56 max-h-[34rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-bold text-slate-950">Booking records</h2>
            <p className="mt-0.5 text-xs text-slate-500">{loading ? "Updating booking records…" : `${pagination.total.toLocaleString()} matching bookings`}</p>
          </div>
          {pagination.pages > 1 && <p className="text-xs text-slate-500">Page {pagination.page} of {pagination.pages}</p>}
        </div>
        <div tabIndex={0} role="region" aria-label="Scrollable booking list" className="min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-700">
          <div key={resultsRevision} className="content-arrive">
          {loading && bookings.length === 0 ? (
            <div role="status" aria-label="Loading bookings" aria-busy="true" className="divide-y divide-slate-100">
              {[0, 1, 2, 3].map((row) => <div key={row} aria-hidden="true" className="px-5 py-5"><SkeletonBlock className="h-4 w-48 max-w-full" /><SkeletonBlock className="mt-3 h-3 w-64 max-w-full" /></div>)}
            </div>
          ) : bookings.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {bookings.map((booking) => (
                <button key={booking.id} type="button" onClick={(event) => { drawerReturnFocus.current = event.currentTarget; setSelectedBooking(booking); }} className="content-arrive dashboard-focus flex w-full flex-col items-start gap-3 px-4 py-4 text-left transition hover:bg-sky-50/60 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-950">{booking.task}</span>
                      <StatusBadge status={booking.statusLabel} />
                    </span>
                    <span className="mt-1.5 block truncate text-xs text-slate-600">
                      {booking.client?.name || "Client unavailable"} <span aria-hidden="true">→</span> {booking.provider?.name || "Provider unavailable"}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {formatDate(booking.serviceDate, dateOnly)}{booking.timeSlot ? ` · ${booking.timeSlot}` : ""} · Requested {formatDate(booking.createdAt)}
                    </span>
                  </span>
                  <span className="flex w-full items-center justify-between gap-4 sm:w-auto sm:justify-end">
                    <span className="text-sm font-bold tabular-nums text-slate-950">{amount(booking.total)}</span>
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-full flex-col items-center justify-center px-5 py-8 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-50 text-blue-900">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden="true"><path d="M5 7.5h14v12H5zM8 4.5v6m8-6v6M5 11.5h14" /></svg>
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-900">No bookings match this view</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-5 text-slate-600">Try another status filter or clear the search to review more booking records.</p>
              {(query || statusFilter) && <button type="button" onClick={() => { setSearchInput(""); setQuery(""); selectFilter(""); }} className="dashboard-focus mt-3 rounded-lg px-3 py-2 text-sm font-semibold text-blue-900 underline underline-offset-2">Clear filters</button>}
            </div>
          )}
          </div>
        </div>
        {pagination.pages > 1 && (
          <div className="flex shrink-0 items-center justify-between border-t border-slate-200 px-4 py-3 sm:px-5">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="dashboard-focus min-h-9 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
            <span className="text-xs tabular-nums text-slate-600">{page} / {pagination.pages}</span>
            <button type="button" disabled={page >= pagination.pages || loading} onClick={() => setPage((value) => value + 1)} className="dashboard-focus min-h-9 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
          </div>
        )}
      </section>

      {selectedBooking && <BookingDrawer booking={selectedBooking} onClose={closeDrawer} onOverride={() => { setOverrideError(""); setShowOverride(true); }} />}
      {showOverride && selectedBooking && <OverrideDialog booking={selectedBooking} onCancel={() => { if (!overrideBusy) { setShowOverride(false); setOverrideError(""); } }} onSubmit={runOverride} busy={overrideBusy} error={overrideError} />}
    </section>
  );
}
