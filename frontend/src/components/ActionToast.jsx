import { useEffect, useRef } from "react";

export default function ActionToast({ message, kind = "success", onDismiss }) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => onDismissRef.current?.(), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  if (!message) return null;

  const isError = kind === "error";

  return (
    <div
      className={`action-toast fixed bottom-24 right-4 z-[80] flex max-w-[min(22rem,calc(100vw-2rem))] items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.18)] sm:right-6 ${
        isError ? "border-rose-200 text-rose-900" : "border-emerald-200 text-emerald-950"
      }`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isError ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-800"}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" className={`h-4 w-4 ${isError ? "" : "toast-checkmark"}`}>
          {isError
            ? <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            : <path d="m5 12 4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      </span>
      <span className="text-sm font-semibold leading-5">{message}</span>
    </div>
  );
}
