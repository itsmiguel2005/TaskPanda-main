import { useState } from "react";
import { useBookings } from "../context/BookingContext.jsx";
import CompletionProofModal from "./CompletionProofModal.jsx";
import StatusChangeConfirmation from "./StatusChangeConfirmation.jsx";

export default function RevisionReviewPanel({ booking }) {
  const { respondToRevision, submitCompletionProof } = useBookings();
  const [responseNote, setResponseNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmDispute, setConfirmDispute] = useState(false);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const latestRevision = booking?.revisionRequests?.[booking.revisionRequests.length - 1];
  if (!booking || !["in_revision", "disputed"].includes(booking.statusCode || "")) return null;

  const respond = async (action) => {
    if (!latestRevision || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      await respondToRevision(booking.id, latestRevision.id, action, responseNote.trim());
      setResponseNote("");
      if (action === "dispute") setConfirmDispute(false);
    } catch (requestError) {
      setError(requestError.message || "Could not update the revision request.");
      if (action === "dispute") throw requestError;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mt-4 border-t border-gray-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Revision review</h3>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${booking.statusCode === "disputed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
          {booking.statusCode === "disputed" ? "Disputed" : `In Revision · ${booking.revisionRequests.length} of 2`}
        </span>
      </div>
      {latestRevision && (
        <>
          <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{latestRevision.note}</p>
          {latestRevision.responseNote && <p className="mt-2 text-xs text-gray-600">Your response: {latestRevision.responseNote}</p>}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Your original completion</p>
              {booking.completionPhotos?.length ? (
                <div className="flex flex-wrap gap-2">{booking.completionPhotos.map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="Provider completion proof" className="h-16 w-16 rounded border border-gray-200 object-cover" /></a>)}</div>
              ) : <p className="text-xs text-gray-500">No original completion photo.</p>}
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Client issue photos</p>
              {latestRevision.photos?.length ? (
                <div className="flex flex-wrap gap-2">{latestRevision.photos.map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="Client revision evidence" className="h-16 w-16 rounded border border-amber-200 object-cover" /></a>)}</div>
              ) : <p className="text-xs text-gray-500">No issue photos attached.</p>}
            </div>
          </div>
          {booking.statusCode === "in_revision" && latestRevision.status === "open" && (
            <>
              <label className="mt-3 block text-xs font-medium text-gray-700">Response (optional)
                <textarea value={responseNote} onChange={(event) => setResponseNote(event.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </label>
              {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={isSubmitting} onClick={() => respond("accept")} className="rounded-md bg-primary-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Accept &amp; fix</button>
                <button type="button" disabled={isSubmitting} onClick={() => setConfirmDispute(true)} className="rounded-md border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-800 disabled:opacity-50">Dispute revision</button>
              </div>
            </>
          )}
          {booking.statusCode === "in_revision" && latestRevision.status === "accepted" && (
            <button type="button" onClick={() => setResubmitOpen(true)} className="mt-3 rounded-md bg-primary-700 px-3 py-2 text-xs font-semibold text-white">Resubmit work</button>
          )}
          {booking.statusCode === "disputed" && <p className="mt-3 text-xs font-medium text-red-800">This revision is paused for manual review.</p>}
        </>
      )}
      {confirmDispute && (
        <StatusChangeConfirmation
          nextStatus="Disputed"
          onConfirm={() => respond("dispute")}
          onClose={() => setConfirmDispute(false)}
        />
      )}
      {resubmitOpen && (
        <CompletionProofModal
          bookingName={booking.task}
          onSubmit={(note, photos) => submitCompletionProof(booking.id, note, photos)}
          onClose={() => setResubmitOpen(false)}
        />
      )}
    </section>
  );
}