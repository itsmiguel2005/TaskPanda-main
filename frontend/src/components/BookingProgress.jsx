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
    <div className="mt-4" role="progressbar" aria-label="Booking progress" aria-valuemin={0} aria-valuemax={3} aria-valuenow={activeIndex} aria-valuetext={status}>
      <ol className="grid grid-cols-4 gap-1">
        {STEPS.map((step, index) => (
          <li key={step} className="min-w-0">
            <span className={`mb-1 block h-1.5 rounded-full ${index <= activeIndex ? "bg-primary-600" : "bg-gray-200"}`} />
            <span className={`block truncate text-[10px] ${index === activeIndex ? "font-semibold text-gray-900" : index < activeIndex ? "text-gray-600" : "text-gray-400"}`}>
              {step}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}