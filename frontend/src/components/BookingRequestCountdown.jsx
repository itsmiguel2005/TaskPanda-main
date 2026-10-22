import { useEffect, useState } from "react";
import { formatBookingRequestCountdown, getBookingRequestExpiryDetails } from "../utils/bookingExpiry.mjs";

export default function BookingRequestCountdown({ booking, currentTime, compact = false }) {
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    if (currentTime != null) return undefined;
    const timerId = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timerId);
  }, [currentTime]);

  if (booking?.status !== "Pending Request") return null;
  const expiry = getBookingRequestExpiryDetails(booking);
  if (!expiry.deadline) return null;

  const now = currentTime == null ? clock : new Date(currentTime);
  const secondsRemaining = Math.max(0, Math.ceil((expiry.deadline.getTime() - now.getTime()) / 1000));
  const expired = secondsRemaining === 0;
  const description = expiry.type === "urgent_same_day"
    ? "Urgent same-day request"
    : expiry.sameDay ? "Advance same-day request" : "Advance booking";
  const countdown = expired ? "Request expired" : compact
    ? `Expires in ${formatBookingRequestCountdown(secondsRemaining)}`
    : `${description} · expires in ${formatBookingRequestCountdown(secondsRemaining)}`;
  const tone = expired ? "text-rose-700" : "text-amber-800";

  return compact
    ? <span className={`inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums ${tone}`} role="timer" aria-live="off">{countdown}</span>
    : <p className={`mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold tabular-nums ${tone}`} role="timer" aria-live="off">{countdown}</p>;
}
