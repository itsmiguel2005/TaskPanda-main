import { useState } from "react";
import { useBookings } from "../context/BookingContext.jsx";

const REVIEW_LABELS = {
  pending: "Response requested",
  responded: "Awaiting admin review",
  confirmed: "No-show confirmed",
  dismissed: "Report dismissed",
};

export default function ProviderNoShowReportNotice({ booking, onRespond }) {
  const { respondToProviderNoShow } = useBookings();
  const [isExpanded, setIsExpanded] = useState(false);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (booking.status !== "Cancelled - Provider No-Show") return null;

  const reviewStatus = booking.providerNoShowReviewStatus || "pending";
  const canRespond = reviewStatus === "pending" && !booking.providerNoShowResponse?.respondedAt;

  async function submitResponse(event) {
    event.preventDefault();
    if (!note.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await (onRespond || respondToProviderNoShow)(booking.id, note);
      setNote("");
      setIsExpanded(false);
      setSuccess("Your response was sent to the admin review team.");
    } catch (requestError) {
      setError(requestError.message || "Could not submit your response.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section aria-label="Provider no-show report" className={`mt-4 rounded-xl border p-4 ${reviewStatus === "dismissed" ? "border-emerald-200 bg-emerald-50" : reviewStatus === "confirmed" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-950">Client reported a missed arrival</h4>
          <p className="mt-1 text-xs leading-5 text-slate-700">
            {reviewStatus === "pending"
              ? "The booking is cancelled so the client can make other plans. This report is not confirmed while it awaits review."
              : reviewStatus === "responded"
                ? "Your response is with the admin review team. The booking remains cancelled while they review both sides."
                : reviewStatus === "confirmed"
                  ? "An admin reviewed the report and confirmed the no-show."
                  : "An admin reviewed the report and dismissed it. It will not count as a confirmed provider reliability issue."}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-current/15 bg-white/75 px-2.5 py-1 text-xs font-semibold text-slate-800">
          {REVIEW_LABELS[reviewStatus] || "Awaiting review"}
        </span>
      </div>

      {booking.providerNoShowResponse?.note && (
        <div className="mt-3 rounded-lg border border-white/80 bg-white/80 px-3 py-2.5">
          <p className="text-xs font-semibold text-slate-700">Your response</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-800">{booking.providerNoShowResponse.note}</p>
        </div>
      )}
      {booking.providerNoShowAdminNotes && (
        <div className="mt-3 rounded-lg border border-white/80 bg-white/80 px-3 py-2.5">
          <p className="text-xs font-semibold text-slate-700">Admin review note</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-800">{booking.providerNoShowAdminNotes}</p>
        </div>
      )}
      {success && <p role="status" className="mt-3 text-sm font-medium text-emerald-800">{success}</p>}

      {canRespond && !isExpanded && (
        <button type="button" onClick={() => setIsExpanded(true)} className="dashboard-focus mt-3 min-h-10 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
          Respond to report
        </button>
      )}
      {canRespond && isExpanded && (
        <form onSubmit={submitResponse} className="mt-3 space-y-2">
          <label htmlFor={`no-show-response-${booking.id}`} className="block text-sm font-semibold text-slate-900">Share your side with the admin team</label>
          <p className="text-xs leading-5 text-slate-700">Your response is for review, not a public rating. The cancellation will remain in place while the report is reviewed.</p>
          <textarea
            id={`no-show-response-${booking.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            rows={3}
            required
            placeholder="Explain what happened, such as whether you arrived or sent an update."
            className="dashboard-focus w-full resize-y rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm leading-5 text-slate-900 placeholder:text-slate-500"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-600">{note.length}/1000 characters</span>
            <div className="flex gap-2">
              <button type="button" disabled={isSubmitting} onClick={() => { setIsExpanded(false); setError(""); }} className="dashboard-focus min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isSubmitting || !note.trim()} className="dashboard-focus min-h-10 rounded-lg bg-blue-700 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-50">{isSubmitting ? "Sending…" : "Send response"}</button>
            </div>
          </div>
          {error && <p role="alert" className="text-sm font-medium text-rose-800">{error}</p>}
        </form>
      )}
    </section>
  );
}
