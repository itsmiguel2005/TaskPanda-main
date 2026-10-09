const STEPS = ["Scheduled", "On the Way", "In Progress", "Completed"];
const STATUS_INDEX = {
  Confirmed: 0,
  "On the Way": 1,
  "In Progress": 2,
  Completed: 3,
};

export default function BookingProgress({ status }) {
  const activeIndex = STATUS_INDEX[status];
  if (activeIndex === undefined) return null;
  const isCompleted = status === "Completed";

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Booking progress</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold ${
          isCompleted ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-blue-200 bg-blue-50 text-blue-800"
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${isCompleted ? "bg-emerald-600" : "booking-status-pulse bg-blue-600"}`} aria-hidden="true" />
          {status === "Confirmed" ? "Scheduled" : status}
        </span>
      </div>
      <ol aria-label="Booking timeline" className="grid grid-cols-4 gap-1">
      {STEPS.map((step, index) => (
        <li key={step} aria-current={index === activeIndex ? "step" : undefined} className="min-w-0">
          <span className={`mb-1 block h-1.5 rounded-full transition-colors duration-200 ${
            index <= activeIndex ? isCompleted ? "bg-emerald-600" : "bg-blue-600" : "bg-slate-200"
          }`} />
          <span className={`block truncate text-[10px] ${index === activeIndex ? "font-bold text-slate-900" : index < activeIndex ? "font-medium text-slate-600" : "text-slate-400"}`}>
            {step}
          </span>
        </li>
      ))}
      </ol>
    </div>
  );
}