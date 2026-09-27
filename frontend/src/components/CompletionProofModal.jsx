import { useState } from "react";

export default function CompletionProofModal({ bookingName, onSubmit, onClose }) {
  const [completionNote, setCompletionNote] = useState("");
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!completionNote.trim()) return setError("Add a short summary of the completed work.");
    setIsSubmitting(true);
    setError("");
    try {
      await onSubmit(completionNote.trim(), photos);
      onClose();
    } catch (submitError) {
      setError(submitError.message || "Could not submit completion proof.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => !isSubmitting && onClose()}>
      <form role="dialog" aria-modal="true" aria-labelledby="completion-proof-title" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="p-5 sm:p-6">
          <h2 id="completion-proof-title" className="text-lg font-bold text-gray-900">Submit completion proof</h2>
          <p className="mt-1 text-sm text-gray-500">Add a required work summary and optional photos for {bookingName || "this booking"}. The summary and any photos will be timestamped and attached to the receipt.</p>
          <label htmlFor="completion-proof-note" className="mt-5 block text-sm font-medium text-gray-700">Completion summary</label>
          <textarea id="completion-proof-note" required maxLength={2000} rows={4} value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} placeholder="Describe the work completed and its final condition" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30" />
          <label htmlFor="completion-proof-photos" className="mt-4 block text-sm font-medium text-gray-700">Finished-work photos (optional)</label>
          <input id="completion-proof-photos" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => { setPhotos(Array.from(event.target.files || []).slice(0, 5)); setError(""); }} className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-xs file:font-semibold" />
          <p className="mt-1 text-xs text-gray-500">Up to five photos. Each image may be up to 5 MB.</p>
          {photos.length > 0 && <p className="mt-1 text-xs text-gray-600">{photos.length} photo{photos.length === 1 ? "" : "s"} selected.</p>}
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" disabled={isSubmitting} onClick={onClose} className="rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isSubmitting || !completionNote.trim()} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? "Submitting…" : "Submit and complete"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}