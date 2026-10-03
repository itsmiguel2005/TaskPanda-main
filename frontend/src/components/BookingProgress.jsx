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

  return (
    <ol aria-label="Booking progress" className="mt-4 grid grid-cols-4 gap-1">
      {STEPS.map((step, index) => (
        <li key={step} aria-current={index === activeIndex ? "step" : undefined} className="min-w-0">
          <span className={`mb-1 block h-1.5 rounded-full transition-colors duration-200 ${index <= activeIndex ? "bg-blue-600" : "bg-slate-200"}`} />
          <span className={`block truncate text-[10px] ${index === activeIndex ? "font-bold text-slate-900" : index < activeIndex ? "font-medium text-slate-600" : "text-slate-400"}`}>
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}