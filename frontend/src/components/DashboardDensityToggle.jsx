import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

const options = [
  {
    value: "comfortable",
    label: "Comfortable",
    icon: <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4"><rect x="2.5" y="2.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" /><rect x="11.5" y="2.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" /><rect x="2.5" y="11.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" /><rect x="11.5" y="11.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" /></svg>,
  },
  {
    value: "compact",
    label: "Compact",
    icon: <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  },
];

export default function DashboardDensityToggle({ persona = "client", iconOnly = false }) {
  const { user, updateDashboardDensityPreference } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const preference = user?.dashboardDensityPreference === "compact" ? "compact" : "comfortable";
  const activeColor = iconOnly
    ? "bg-blue-50 text-blue-600 shadow-sm"
    : persona === "provider" ? "bg-emerald-600 text-white shadow-sm" : "bg-blue-600 text-white shadow-sm";

  const handleChange = async (value) => {
    if (value === preference || isSaving) return;
    setError("");
    setIsSaving(true);
    try {
      await updateDashboardDensityPreference(value);
    } catch (saveError) {
      setError(saveError.message || "Could not save this display preference.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div role="group" aria-label="Display density" className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {options.map((option) => {
          const selected = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              aria-label={`${option.label} view`}
              title={`${option.label} view`}
              disabled={isSaving}
              onClick={() => handleChange(option.value)}
              className={`dashboard-focus inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ease-in-out disabled:cursor-wait disabled:opacity-70 ${iconOnly ? "w-9 px-2" : "px-2.5 sm:px-3"} ${selected ? activeColor : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
            >
              {option.icon}
              {!iconOnly && <span>{option.label}</span>}
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="max-w-56 text-right text-xs font-medium text-rose-700">{error}</p>}
    </div>
  );
}
