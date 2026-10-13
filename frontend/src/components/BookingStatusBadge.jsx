const STATUS_STYLES = {
  "Pending Request": "border-amber-200 bg-amber-50 text-amber-800",
  Pending: "border-amber-200 bg-amber-50 text-amber-800",
  Confirmed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  "On the Way": "border-cyan-200 bg-cyan-50 text-cyan-800",
  "In Progress": "border-blue-200 bg-blue-50 text-blue-800",
  Completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Settled: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Cancelled: "border-rose-200 bg-rose-50 text-rose-800",
  "Cancelled - Provider No-Show": "border-blue-200 bg-blue-50 text-blue-800",
  Declined: "border-rose-200 bg-rose-50 text-rose-800",
  "Declined by Provider": "border-rose-200 bg-rose-50 text-rose-800",
  Expired: "border-slate-200 bg-slate-100 text-slate-700",
  "Cancellation Requested": "border-amber-200 bg-amber-50 text-amber-800",
  "In Revision": "border-amber-200 bg-amber-50 text-amber-800",
  Disputed: "border-rose-200 bg-rose-50 text-rose-800",
  "Refund Under Review": "border-amber-200 bg-amber-50 text-amber-800",
  Refunded: "border-emerald-200 bg-emerald-50 text-emerald-800",
  "Partially Refunded": "border-teal-200 bg-teal-50 text-teal-800",
};

const STATUS_DOTS = {
  "Pending Request": "bg-amber-500",
  Pending: "bg-amber-500",
  Confirmed: "bg-emerald-500",
  "On the Way": "bg-cyan-500",
  "In Progress": "bg-blue-500",
  Completed: "bg-emerald-500",
  Settled: "bg-emerald-500",
  Cancelled: "bg-rose-500",
  "Cancelled - Provider No-Show": "bg-blue-600",
  Declined: "bg-rose-500",
  "Declined by Provider": "bg-rose-500",
  Expired: "bg-slate-500",
  "Cancellation Requested": "bg-amber-500",
  "In Revision": "bg-amber-500",
  Disputed: "bg-rose-500",
  "Refund Under Review": "bg-amber-500",
  Refunded: "bg-emerald-500",
  "Partially Refunded": "bg-teal-500",
};

export default function BookingStatusBadge({ status, density = "comfortable" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-bold tracking-[0.01em] ${density === "compact" ? "px-2 py-0.5 text-[10px]" : "gap-1.5 px-2.5 py-1 text-[11px]"} ${STATUS_STYLES[status] || "border-slate-200 bg-slate-100 text-slate-700"}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STATUS_DOTS[status] || "bg-slate-500"}`} />
      {status}
    </span>
  );
}
