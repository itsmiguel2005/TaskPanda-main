import { getPasswordStrength } from "../utils/registrationValidation.js";

const strengthColors = {
  Weak: "bg-red-500",
  Fair: "bg-amber-500",
  Good: "bg-emerald-500",
  Strong: "bg-emerald-600",
};

export default function PasswordStrengthMeter({ password }) {
  if (!password) return null;

  const { requirements, score, strength, isGood } = getPasswordStrength(password);

  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">Password strength</span>
        <span className={`font-semibold ${strength === "Weak" ? "text-red-700" : strength === "Fair" ? "text-amber-700" : "text-emerald-700"}`}>
          {strength}
        </span>
      </div>
      <div
        className="flex h-1.5 gap-1"
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={requirements.length}
        aria-valuenow={score}
        aria-valuetext={strength}
      >
        {requirements.map((requirement, index) => (
          <span
            key={requirement.label}
            className={`flex-1 rounded-full ${index < score ? strengthColors[strength] : "bg-slate-200"}`}
          />
        ))}
      </div>
      <ul className="grid gap-x-3 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
        {requirements.map(({ label, met }) => (
          <li key={label} className={met ? "text-emerald-700" : ""}>
            <svg className="mr-1 inline h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              {met
                ? <path d="m3 8.5 3.1 3L13 4.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                : <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />}
            </svg>
            <span>{label}</span>
          </li>
        ))}
      </ul>
      {!isGood && (
        <p className="text-xs text-slate-600">Use at least 8 characters, no spaces, and meet two other strength checks.</p>
      )}
    </div>
  );
}
