export default function RoleCard({ value, selected, onChange, label, description, color = "primary" }) {
  const colorClasses = {
    primary: {
      border: "border-primary-200",
      hover: "hover:border-primary-500 hover:bg-primary-50 focus-within:border-primary-500 focus-within:ring-primary-500/30",
      checked: "has-[:checked]:border-primary-600 has-[:checked]:bg-primary-50 has-[:checked]:ring-2 has-[:checked]:ring-primary-500/40",
    },
    green: {
      border: "border-green-200",
      hover: "hover:border-green-500 hover:bg-green-50 focus-within:border-green-500 focus-within:ring-green-500/30",
      checked: "has-[:checked]:border-green-600 has-[:checked]:bg-green-50 has-[:checked]:ring-2 has-[:checked]:ring-green-500/40",
    },
  };
  const c = colorClasses[color];
  return (
    <label
      className={`flex cursor-pointer items-start gap-4 rounded-lg border-2 bg-white p-4 shadow-sm transition-all duration-200 ${c.border} ${c.hover} ${c.checked}`}
    >
      <input
        type="radio"
        name="role"
        value={value}
        checked={selected === value}
        onChange={onChange}
        className="sr-only"
      />
      <span className="block">
        <span className="block font-medium text-gray-800">{label}</span>
        <span className="block text-sm text-gray-500">{description}</span>
      </span>
    </label>
  );
}
