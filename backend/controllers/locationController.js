const { searchServiceLocations, reverseGeocodeServiceLocation } = require("../services/geocoder");

async function handleLocationSearch(req, res) {
  try {
    const results = await searchServiceLocations(req.query.q);
    return res.json({ results });
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ message: error.message });
    console.error("Account location search error:", error);
    return res.status(502).json({ message: "Address search is temporarily unavailable. Try again or place the pin on the map." });
  }
}

async function handleLocationReverseLookup(req, res) {
  try {
    const result = await reverseGeocodeServiceLocation(req.query.latitude, req.query.longitude);
    return res.json({ result });
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ message: error.message });
    console.error("Account location reverse lookup error:", error);
    return res.status(502).json({ message: "Address lookup is temporarily unavailable. The map pin can still be used." });
  }
}

module.exports = { handleLocationSearch, handleLocationReverseLookup };
