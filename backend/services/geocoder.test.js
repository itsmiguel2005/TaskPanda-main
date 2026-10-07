const assert = require("node:assert/strict");
const { test } = require("node:test");
const { searchServiceLocations, reverseGeocodeServiceLocation } = require("./geocoder");

test("service address search returns Philippine results with GeoJSON coordinates", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => [
        { display_name: "Makati City, Metro Manila, Philippines", lat: "14.5547", lon: "121.0244", address: { state: "Metro Manila", city: "Makati City", suburb: "Poblacion" } },
        { display_name: "Invalid result", lat: "91", lon: "181" },
      ],
    };
  };
  try {
    const results = await searchServiceLocations("Makati City");
    assert.deepEqual(results, [{
      address: "Makati City, Metro Manila, Philippines",
      geoLocation: { type: "Point", coordinates: [121.0244, 14.5547] },
      province: "Metro Manila",
      city: "Makati City",
      barangay: "Poblacion",
    }]);
    assert.match(calls[0].url, /countrycodes=ph/);
    assert.match(calls[0].url, /q=Makati%20City/);
    assert.match(calls[0].options.headers["User-Agent"], /^TaskPanda\//);
  } finally {
    global.fetch = originalFetch;
  }
});

test("reverse lookup returns a normalized service address and validates coordinates", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        display_name: "Barangay Poblacion, Makati City, Philippines",
        lat: "14.5547",
        lon: "121.0244",
        address: { state: "Metro Manila", city: "Makati City", suburb: "Poblacion" },
      }),
    };
  };
  try {
    await assert.rejects(reverseGeocodeServiceLocation(91, 121), TypeError);
    assert.equal(calls.length, 0);
    const result = await reverseGeocodeServiceLocation("14.5547", "121.0244");
    assert.deepEqual(result, {
      address: "Barangay Poblacion, Makati City, Philippines",
      geoLocation: { type: "Point", coordinates: [121.0244, 14.5547] },
      province: "Metro Manila",
      city: "Makati City",
      barangay: "Poblacion",
    });
    assert.match(calls[0], /reverse\?format=jsonv2/);
  } finally {
    global.fetch = originalFetch;
  }
});
