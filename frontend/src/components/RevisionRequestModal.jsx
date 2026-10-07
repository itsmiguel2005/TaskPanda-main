import { useState } from "react";

export default function RevisionRequestModal({ booking, revisionCount, onSubmit, onClose }) {
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!note.trim()) return setError("Describe what still needs to be fixed.");
    setIsSubmitting(true);
    setError("");
    try {
      await onSubmit(note.trim(), photos);
      onClose();
    } catch (submitError) {
      setError(submitError.message || "Could not submit the revision request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/50 p-4" onClick={() => !isSubmitting && onClose()}>
      <form role="dialog" aria-modal="true" aria-labelledby="revision-request-title" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="revision-request-title" className="text-lg font-bold text-gray-900">Request a revision</h2>
              <p className="mt-1 text-xs text-amber-800">Revision {revisionCount + 1} of 2</p>
            </div>
            <button type="button" disabled={isSubmitting} onClick={onClose} aria-label="Close revision request" className="rounded-md p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50">×</button>
          </div>
          <p className="mt-3 text-sm text-gray-500">{booking.task}. Explain what needs attention; you can attach optional photos.</p>
          <label htmlFor="client-revision-note" className="mt-4 block text-sm font-medium text-gray-700">What needs to be fixed?</label>
          <textarea id="client-revision-note" required maxLength={1000} rows={4} value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30" />
          <label htmlFor="client-revision-photos" className="mt-4 block text-sm font-medium text-gray-700">Issue photos (optional)</label>
          <input id="client-revision-photos" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => setPhotos(Array.from(event.target.files || []).slice(0, 5))} className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-xs file:font-semibold" />
          <p className="mt-1 text-xs text-gray-500">Up to five photos, 5 MB each.</p>
          {photos.length > 0 && <p className="mt-1 text-xs text-gray-600">{photos.length} photo{photos.length === 1 ? "" : "s"} selected.</p>}
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" disabled={isSubmitting} onClick={onClose} className="rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isSubmitting || !note.trim()} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? "Sending…" : "Send revision request"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}