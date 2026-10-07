import ServiceLocationPicker from "./ServiceLocationPicker.jsx";

const AREA_FIELDS = [
  { name: "barangay", label: "Barangay / neighborhood" },
  { name: "city", label: "City / municipality" },
  { name: "province", label: "Province / region" },
];

export default function AccountLocationPicker({
  formData,
  setFormData,
  token,
  accent = "primary",
  provider = false,
}) {
  const tone = accent === "green"
    ? "border-green-200 bg-green-50/50 focus:border-green-600 focus:ring-green-600/20"
    : "border-primary-200 bg-primary-50/50 focus:border-primary-600 focus:ring-primary-600/20";

  const updateLocation = (location) => {
    setFormData((current) => ({
      ...current,
      address: location.address ?? current.address,
      geoLocation: location.geoLocation ?? current.geoLocation,
      province: location.province ?? current.province,
      city: location.city ?? current.city,
      barangay: location.barangay ?? current.barangay,
    }));
  };

  const updateArea = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  return (
    <div className="space-y-3">
      <ServiceLocationPicker
        value={formData}
        onChange={updateLocation}
        token={token}
        endpointBase="/api/auth/location"
        heading={provider ? "Pin your service base" : "Pin your location"}
        description={provider
          ? "Search your street or landmark, then place the pin where you are based. Clients use this precise point to find nearby providers."
          : "Search your street or landmark, or click and drag the map pin to your exact location."}
        searchPlaceholder="Street, barangay, city, or landmark"
        addressLabel="Street address or landmark"
        addressPlaceholder="House number, street, or nearby landmark"
        mapLabel={provider ? "Choose your provider service-base location" : "Choose your account location"}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {AREA_FIELDS.map(({ name, label }) => (
          <label key={name} htmlFor={`account-location-${name}`} className="block text-xs font-semibold text-slate-700">
            {label} <span className="text-red-700" aria-hidden="true">*</span>
            <input
              id={`account-location-${name}`}
              name={name}
              type="text"
              value={formData[name] || ""}
              onChange={updateArea}
              maxLength={100}
              required
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:ring-2 ${tone}`}
              placeholder="Filled from map; edit if needed"
            />
          </label>
        ))}
      </div>
      <p className="text-xs leading-5 text-slate-600">
        We use the pin for accurate nearby matching and the area names for location details. The exact pin is not displayed publicly.
      </p>
    </div>
  );
}
