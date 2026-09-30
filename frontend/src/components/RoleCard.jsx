export default function RoleCard({ value, selected, onChange, label, description, color = "primary" }) {
  const colorClasses = {
    primary: {
      icon: "bg-sky-100 text-sky-700",
      checked: "has-[:checked]:border-sky-500 has-[:checked]:bg-sky-50/70 has-[:checked]:ring-sky-500/30",
    },
    green: {
      icon: "bg-emerald-100 text-emerald-700",
      checked: "has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50/70 has-[:checked]:ring-emerald-500/30",
    },
  };
  const c = colorClasses[color];
  return (
    <label
      className={`flex cursor-pointer items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:scale-[1.01] hover:border-slate-300 hover:shadow-md focus-within:ring-2 ${c.checked}`}
    >
      <input
        type="radio"
        name="role"
        value={value}
        checked={selected === value}
        onChange={onChange}
        className="sr-only"
      />
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${c.icon}`} aria-hidden="true">
        {value === "provider" ? (
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 19h18" />
            <path d="M5 19v-3a7 7 0 0 1 14 0v3" />
            <path d="M12 9v7" />
            <path d="M5.5 14h13" />
          </svg>
        ) : (
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 10 9-7 9 7" />
            <path d="M5 9v11h14V9" />
            <path d="M9 20v-6h6v6" />
            <path d="M8 10h.01M16 10h.01" />
          </svg>
        )}
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block font-semibold text-slate-900">{label}</span>
        <span className="mt-1 block text-sm leading-6 text-slate-600">{description}</span>
      </span>
    </label>
  );
}
