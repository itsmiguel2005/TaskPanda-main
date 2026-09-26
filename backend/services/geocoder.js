const config = require("../config/env");

function cleanCityName(city) {
  return String(city || "")
    .replace(/\bCity\s+of\s+/gi, "")
    .replace(/\s+City\b/gi, "")
    .trim();
}

function makeGeoLocation(result) {
  const latitude = Number(result?.lat);
  const longitude = Number(result?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    type: "Point",
    coordinates: [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))],
  };
}

async function geocodeAddress(address, { barangay, city, province } = {}) {
  const locality = [barangay, cleanCityName(city), province, "Philippines"]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
  const fullAddress = [String(address || "").trim(), "Philippines"]
    .filter(Boolean)
    .join(", ");
  const queries = [...new Set([fullAddress, locality].filter(Boolean))];

  for (const query of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph&addressdetails=1&q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": `TaskPanda/1.0 (${config.appUrl || "http://localhost:5173"})`,
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) continue;

      const data = await response.json();
      const location = makeGeoLocation(Array.isArray(data) ? data[0] : null);
      if (location) return location;
    } catch {
      // Try the less specific barangay/city/province query if the full address fails.
    }
  }

  return null;
}

module.exports = { geocodeAddress };