import { useEffect, useRef, useState } from "react";

const COUNTDOWN_SECONDS = 3;

export default function StatusChangeConfirmation({ nextStatus, onConfirm, onClose }) {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const onConfirmRef = useRef(onConfirm);
  const onCloseRef = useRef(onClose);
  const requestStartedRef = useRef(false);

  onConfirmRef.current = onConfirm;
  onCloseRef.current = onClose;

  async function submitStatusUpdate() {
    if (requestStartedRef.current) return;
    requestStartedRef.current = true;
    setIsSubmitting(true);
    setError("");
    try {
      await onConfirmRef.current();
      onCloseRef.current();
    } catch (requestError) {
      requestStartedRef.current = false;
      setIsSubmitting(false);
      setError(requestError.message || "Could not update the booking status.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    const deadline = Date.now() + COUNTDOWN_SECONDS * 1000;
    const timerId = window.setInterval(() => {
      if (cancelled) return;
      const nextSecondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(nextSecondsLeft);
      if (nextSecondsLeft === 0) {
        window.clearInterval(timerId);
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, []);

  function closeDialog() {
    if (!isSubmitting) onClose();
  }

  const progressPercent = ((COUNTDOWN_SECONDS - secondsLeft) / COUNTDOWN_SECONDS) * 100;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={closeDialog}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="status-change-title"
        className="w-full max-w-sm rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-6">
          <h2 id="status-change-title" className="text-lg font-bold text-gray-900">Confirm status update</h2>
          <p className="mt-2 text-sm text-gray-600">Are you sure you want to update this booking to <span className="font-semibold text-gray-900">{nextStatus}</span>?</p>

          <div className="mt-6 text-center" role="timer" aria-live="polite" aria-atomic="true">
            {isSubmitting ? (
              <p className="text-sm font-semibold text-primary-700">Updating booking…</p>
            ) : error ? (
              <p role="alert" className="text-sm font-medium text-red-700">{error}</p>
            ) : (
              <>
                <p className="text-sm text-gray-500">Proceed is available in</p>
                <p className="mt-1 text-4xl font-bold tabular-nums text-gray-900">{secondsLeft}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full bg-primary-600 transition-[width] duration-100" style={{ width: `${progressPercent}%` }} />
                </div>
              </>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={closeDialog}
              disabled={isSubmitting}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitStatusUpdate}
              disabled={secondsLeft > 0 || isSubmitting}
              className="flex-1 rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {error ? "Retry update" : isSubmitting ? "Updating…" : "Proceed"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}