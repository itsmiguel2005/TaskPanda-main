import { getPhilippineMobileInputValue } from "../utils/registrationValidation.js";

export default function PhilippineMobileInput({ id, value, onChange, theme = "primary" }) {
  const styles = theme === "green"
    ? {
        border: "border-green-200",
        background: "bg-green-50/50",
        focus: "focus-within:border-green-500 focus-within:ring-green-500/30",
        prefix: "text-green-800",
      }
    : {
        border: "border-primary-200",
        background: "bg-primary-50/50",
        focus: "focus-within:border-primary-500 focus-within:ring-primary-500/30",
        prefix: "text-primary-800",
      };

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">Mobile Number</label>
      <div className={`flex overflow-hidden rounded-lg border ${styles.border} ${styles.background} transition focus-within:ring-2 ${styles.focus}`}>
        <span aria-hidden="true" className={`flex items-center border-r border-inherit px-3 text-sm font-semibold ${styles.prefix}`}>+63</span>
        <input
          id={id}
          name="mobileNumber"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={10}
          placeholder="9XXXXXXXXX"
          value={value}
          onChange={(event) => onChange(getPhilippineMobileInputValue(event.target.value))}
          aria-label="Mobile number, Philippines country code +63"
          className="block min-w-0 w-full bg-transparent px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400/70 focus:outline-none"
        />
      </div>
    </div>
  );
}
