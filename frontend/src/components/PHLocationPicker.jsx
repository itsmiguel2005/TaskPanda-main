import { useState, useEffect, useCallback } from "react";

export default function PHLocationPicker({ formData, setFormData, accent = "primary" }) {
  const [ph, setPh] = useState(null);
  const [provinces, setProvinces] = useState([]);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [loading, setLoading] = useState({ province: false, city: false, barangay: false });

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
    }));
    setCities([]);
    setBarangays([]);
    if (provinceCode && ph) {
      setLoading((prev) => ({ ...prev, city: true }));
      const data = ph.getCities(provinceCode).sort((a, b) => a.name.localeCompare(b.name));
      setCities(data);
      setLoading((prev) => ({ ...prev, city: false }));
    }
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
    }));
    setBarangays([]);
    if (cityCode && ph) {
      setLoading((prev) => ({ ...prev, barangay: true }));
      const data = ph.getBarangays(cityCode).sort((a, b) => a.name.localeCompare(b.name));
      setBarangays(data);
      setLoading((prev) => ({ ...prev, barangay: false }));
    }
  }, [ph, setFormData]);

  const handleBarangayChange = useCallback((e) => {
    const barangayCode = e.target.value;
    const barangayName = e.target.options[e.target.selectedIndex]?.text || "";
    setFormData((prev) => ({ ...prev, barangayCode, barangay: barangayName }));
  }, [setFormData]);

  useEffect(() => {
    if (!ph) return;
    setLoading((prev) => ({ ...prev, province: true }));
    const data = ph.getProvinces().sort((a, b) => a.name.localeCompare(b.name));
    setProvinces(data);
    setLoading((prev) => ({ ...prev, province: false }));
  }, [ph]);

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
          value={formData.provinceCode || ""}
          onChange={handleProvinceChange}
          disabled={loading.province || !ph}
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
          value={formData.cityCode || ""}
          onChange={handleCityChange}
          disabled={!formData.provinceCode || loading.city || !ph}
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
          value={formData.barangayCode || ""}
          onChange={handleBarangayChange}
          disabled={!formData.cityCode || loading.barangay || !ph}
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
    </div>
  );
}
