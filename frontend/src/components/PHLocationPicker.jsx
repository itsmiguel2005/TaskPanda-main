import { useState, useEffect, useCallback } from "react";

export default function PHLocationPicker({ formData, setFormData, accent = "primary" }) {
  const [ph, setPh] = useState(null);
  const [geoError, setGeoError] = useState("");

  const normalizeName = (name) => String(name || "")
    .replace(/^city of\s+/i, "")
    .replace(/\s+city$/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  const provinces = ph ? ph.getProvinces().sort((a, b) => a.name.localeCompare(b.name)) : [];
  const province = provinces.find((item) => item.code === formData.provinceCode)
    || provinces.find((item) => normalizeName(item.name) === normalizeName(formData.province));
  const cities = ph && province
    ? ph.getCities(province.code).sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const city = cities.find((item) => item.code === formData.cityCode)
    || cities.find((item) => normalizeName(item.name) === normalizeName(formData.city));
  const barangays = ph && city
    ? ph.getBarangays(city.code).sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const barangay = barangays.find((item) => item.code === formData.barangayCode)
    || barangays.find((item) => normalizeName(item.name) === normalizeName(formData.barangay));

  const borderClass = accent === "green" ? "border-green-200" : "border-primary-200";
  const bgClass = accent === "green" ? "bg-green-50/50" : "bg-primary-50/50";
  const focusClass =
    accent === "green"
      ? "focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
      : "focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30";

  useEffect(() => {
    import("ph-addresses-locations").then(setPh);
  }, []);

  const handleProvinceChange = useCallback((e) => {
    const provinceCode = e.target.value;
    const provinceName = e.target.options[e.target.selectedIndex]?.text || "";
    setFormData((prev) => ({
      ...prev,
      provinceCode,
      province: provinceName,
      cityCode: "",
      city: "",
      barangayCode: "",
      barangay: "",
      geoLocation: null,
    }));
  }, [ph, setFormData]);

  const handleCityChange = useCallback((e) => {
    const cityCode = e.target.value;
    const cityName = e.target.options[e.target.selectedIndex]?.text || "";
    setFormData((prev) => ({
      ...prev,
      cityCode,
      city: cityName,
      barangayCode: "",
      barangay: "",
      geoLocation: null,
    }));
  }, [ph, setFormData]);

  const handleBarangayChange = useCallback((e) => {
    const barangayCode = e.target.value;
    const barangayName = e.target.options[e.target.selectedIndex]?.text || "";
    setFormData((prev) => ({ ...prev, barangayCode, barangay: barangayName, geoLocation: null }));
  }, [setFormData]);

  const captureLocation = () => {
    setGeoError("");
    if (!navigator.geolocation) {
      setGeoError("Location is not available in this browser.");
      return;
    }

    let bestPosition = null;
    let attempts = 0;

    const tryCapture = () => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const candidate = {
            longitude: Number(coords.longitude.toFixed(6)),
            latitude: Number(coords.latitude.toFixed(6)),
            accuracy: Number(coords.accuracy || 0),
          };

          if (!bestPosition || candidate.accuracy < bestPosition.accuracy) {
            bestPosition = candidate;
          }

          if (candidate.accuracy <= 50 || attempts >= 2) {
            setFormData((prev) => ({
              ...prev,
              geoLocation: {
                type: "Point",
                coordinates: [bestPosition.longitude, bestPosition.latitude],
              },
            }));
            return;
          }

          attempts += 1;
          tryCapture();
        },
        () => {
          if (attempts >= 2) {
            setGeoError("Unable to get a precise location. Try again or enter a nearby-search pin manually.");
            return;
          }
          attempts += 1;
          tryCapture();
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    };

    tryCapture();
  };

  const selectClass = `block w-full rounded-lg ${borderClass} ${bgClass} px-4 py-2.5 text-sm text-gray-800 ${focusClass} transition-colors`;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="province" className="block text-sm font-medium text-gray-700">
          Province
        </label>
        <select
          id="province"
          name="province"
          value={province?.code || ""}
          onChange={handleProvinceChange}
          disabled={!ph}
          required
          className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <option value="">Select Province</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="city" className="block text-sm font-medium text-gray-700">
          City / Municipality
        </label>
        <select
          id="city"
          name="city"
          value={city?.code || ""}
          onChange={handleCityChange}
          disabled={!province || !ph}
          required
          className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <option value="">Select City / Municipality</option>
          {cities.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="barangay" className="block text-sm font-medium text-gray-700">
          Barangay
        </label>
        <select
          id="barangay"
          name="barangay"
          value={barangay?.code || ""}
          onChange={handleBarangayChange}
          disabled={!city || !ph}
          required
          className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <option value="">Select Barangay</option>
          {barangays.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {geoError && <p role="alert" className="text-xs text-red-600">{geoError}</p>}
    </div>
  );
}
