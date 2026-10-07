const config = require("../config/env");

let nominatimQueue = Promise.resolve();
let lastNominatimRequestAt = 0;

function requestNominatim(url) {
  const request = nominatimQueue.then(async () => {
    const waitMs = Math.max(0, 1100 - (Date.now() - lastNominatimRequestAt));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastNominatimRequestAt = Date.now();
    return fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": `TaskPanda/1.0 (${config.appUrl || "http://localhost:5173"})`,
      },
      signal: AbortSignal.timeout(8000),
    });
  });
  nominatimQueue = request.then(() => undefined, () => undefined);
  return request;
}

function cleanCityName(city) {
  return String(city || "")
    .replace(/\bCity\s+of\s+/gi, "")
    .replace(/\s+City\b/gi, "")
    .trim();
}

function makeGeoLocation(result) {
  const latitude = Number(result?.lat);
  const longitude = Number(result?.lon);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  return {
    type: "Point",
    coordinates: [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))],
  };
}

function makeServiceLocation(result) {
  const geoLocation = makeGeoLocation(result);
  const address = String(result?.display_name || "").trim().slice(0, 300);
  if (!geoLocation || !address) return null;
  const details = result?.address || {};
  return {
    address,
    geoLocation,
    province: String(details.state || details.province || details.region || "").trim(),
    city: String(details.city || details.town || details.municipality || details.county || "").trim(),
    barangay: String(details.suburb || details.neighbourhood || details.quarter || details.hamlet || details.city_district || "").trim(),
  };
}

async function searchServiceLocations(query) {
  const normalizedQuery = String(query || "").trim();
  if (normalizedQuery.length < 3 || normalizedQuery.length > 200) {
    throw new TypeError("Enter an address between 3 and 200 characters.");
  }

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ph&addressdetails=1&q=${encodeURIComponent(normalizedQuery)}`;
  const response = await requestNominatim(url);
  if (!response.ok) throw new Error(`OpenStreetMap address search returned ${response.status}.`);

  const results = await response.json();
  if (!Array.isArray(results)) throw new Error("OpenStreetMap returned an invalid address-search response.");
  return results.map(makeServiceLocation).filter(Boolean);
}

async function reverseGeocodeServiceLocation(latitudeValue, longitudeValue) {
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new TypeError("Choose a valid map location.");
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
  const response = await requestNominatim(url);
  if (!response.ok) throw new Error(`OpenStreetMap address lookup returned ${response.status}.`);

  const result = await response.json();
  const serviceLocation = makeServiceLocation(result);
  if (!serviceLocation) throw new Error("OpenStreetMap could not find an address for this pin.");
  return serviceLocation;
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
      const response = await requestNominatim(url);
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

module.exports = { geocodeAddress, searchServiceLocations, reverseGeocodeServiceLocation };