import { useState } from "react";

export default function ProviderNoShowConfirmationModal({ booking, onConfirm, onClose }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      await onConfirm();
    } catch (requestError) {
      setError(requestError.message || "Could not report the provider no-show.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSubmitting) onClose();
    }}>
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="provider-no-show-title"
        aria-describedby="provider-no-show-description"
        className="w-full max-w-md rounded-2xl border border-blue-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.2)] content-arrive"
      >
        <div className="p-6">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-700" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5m0 4h.01" />
            </svg>
          </span>
          <h2 id="provider-no-show-title" className="mt-4 text-lg font-bold text-slate-950">Report a provider no-show?</h2>
          <p id="provider-no-show-description" className="mt-2 text-sm leading-6 text-slate-600">
            This will cancel your booking with {booking?.worker || "your provider"} and record a no-show report for provider reliability review. The report is tied to this booking; it does not automatically change the provider’s public star rating.
          </p>
          <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3 text-xs leading-5 text-blue-800">
            Only continue if the provider has not arrived and has not updated the booking. You can then rebook with another professional.
          </p>
          {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-700">{error}</p>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" disabled={isSubmitting} onClick={onClose} className="dashboard-focus min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
              Keep booking
            </button>
            <button type="button" disabled={isSubmitting} onClick={() => void handleConfirm()} className="dashboard-focus min-h-11 flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
              {isSubmitting ? "Cancelling booking…" : "Report & cancel"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
