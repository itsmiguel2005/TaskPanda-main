const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildBookingContext,
  buildProviderContext,
  buildProviderFilter,
  buildRewardContext,
  buildTopRatedRecommendations,
  buildTopRatedEmptyResponse,
  buildNearbyProviderPipeline,
  findRequestedProfession,
  isProviderRecommendationRequest,
  isTopRatedRequest,
  normalizeCoordinates,
  normalizeUserLocation,
  parsePandaBotResponse,
  selectProvidersForRequest,
} = require("./pandaBot");

test("normalizes city and region locations without retaining a profile barangay", () => {
  assert.deepEqual(normalizeUserLocation({ city: "Dagupan City", province: "Pangasinan", barangay: "Patalan" }), {
    city: "Dagupan",
    province: "Pangasinan",
    label: "Dagupan, Pangasinan",
  });
  assert.equal(normalizeUserLocation({ region: "Central Visayas" }).province, "Central Visayas");
  assert.equal(normalizeUserLocation({}), null);
});

test("provider search filter limits candidates to active local profiles", () => {
  const filter = buildProviderFilter({ city: "Dagupan", province: "Pangasinan" });
  assert.equal(filter.role, "provider");
  assert.equal(filter.registrationComplete, true);
  assert.equal(filter.isSuspended.$ne, true);
  assert.equal(filter.archivedAt, null);
  assert.equal(filter["geoLocation.type"], "Point");
  assert.equal(filter.city.test("Dagupan City"), true);
  assert.equal(filter.province.test("Pangasinan"), true);
  assert.equal(Object.hasOwn(filter, "barangay"), false);
});

test("validates GeoJSON coordinate order and bounds for nearby searches", () => {
  assert.deepEqual(normalizeCoordinates([120.596, 16.043]), [120.596, 16.043]);
  assert.equal(normalizeCoordinates([181, 16]), null);
  assert.equal(normalizeCoordinates([120, -91]), null);
  assert.equal(normalizeCoordinates([120]), null);
  assert.equal(normalizeCoordinates([null, 16]), null);
  assert.equal(normalizeCoordinates(["120.596", 16.043]), null);
});

test("nearby provider pipelines use a five-kilometer radius without city filters", () => {
  const reviewedPipeline = buildNearbyProviderPipeline([120.596, 16.043], "Plumber", true, 3);
  const newPipeline = buildNearbyProviderPipeline([120.596, 16.043], "Plumber", false, 2);
  const reviewedGeoNear = reviewedPipeline[0].$geoNear;
  const newGeoNear = newPipeline[0].$geoNear;

  assert.deepEqual(reviewedGeoNear.near.coordinates, [120.596, 16.043]);
  assert.equal(reviewedGeoNear.maxDistance, 5000);
  assert.equal(reviewedGeoNear.key, "geoLocation");
  assert.equal(reviewedGeoNear.query.city, undefined);
  assert.equal(reviewedGeoNear.query.province, undefined);
  assert.equal(reviewedGeoNear.query.averageRating.$gt, 0);
  assert.equal(reviewedGeoNear.query.totalReviews.$gt, 0);
  assert.equal(reviewedPipeline[2].$limit, 3);
  assert.equal(newGeoNear.query.averageRating.$in.includes(0), true);
  assert.equal(newGeoNear.query.totalReviews.$in.includes(0), true);
  assert.equal(newPipeline[2].$limit, 2);
});

test("maps Gemini-selected IDs to trusted provider data and drops invented IDs", () => {
  const providers = [{
    _id: "provider-1",
    fullName: "Alex Santos",
    professions: ["Plumber"],
    averageRating: 4.7,
    totalReviews: 23,
    city: "Dagupan",
    province: "Pangasinan",
  }];
  const parsed = parsePandaBotResponse(JSON.stringify({
    message: "Alex can help with the leaking sink.",
    providerIds: ["provider-1", "invented-provider", "provider-1"],
  }), providers);

  assert.deepEqual(buildProviderContext(providers), [{
    id: "provider-1",
    name: "Alex Santos",
    categories: ["Plumber"],
    rating: 4.7,
    reviewCount: 23,
    location: "Dagupan, Pangasinan",
  }]);
  assert.deepEqual(parsed.recommendations, [{
    id: "provider-1",
    name: "Alex Santos",
    category: "Plumber",
    rating: 4.7,
    reviewCount: 23,
    location: "Dagupan, Pangasinan",
  }]);
});

test("top-pro searches rank reviewed providers without an arbitrary minimum rating", () => {
  const providers = [
    { _id: "rated", averageRating: 4.6, totalReviews: 8 },
    { _id: "unrated", averageRating: 0, totalReviews: 0 },
    { _id: "low-rated", averageRating: 3.8, totalReviews: 12 },
  ];

  assert.equal(isTopRatedRequest("Find top pros near me"), true);
  assert.deepEqual(selectProvidersForRequest(providers, "Find top pros near me").map((provider) => provider._id), ["rated", "low-rated"]);
  assert.deepEqual(selectProvidersForRequest(providers, "Find a painter near me"), providers);
});

test("recognizes top-rated requests for a named service and ordinary provider searches", () => {
  const providers = [
    { professions: ["Plumber"] },
    { professions: ["Aircon Tech"] },
  ];

  assert.equal(findRequestedProfession(providers, "Who are the top plumbers?"), "Plumber");
  assert.equal(isTopRatedRequest("Who are the top plumbers?", providers), true);
  assert.equal(isProviderRecommendationRequest("Who are the top plumbers?", providers), true);
  assert.equal(isProviderRecommendationRequest("Find an aircon tech near me", providers), true);
  assert.equal(isProviderRecommendationRequest("Find electricians near me"), true);
  assert.equal(isProviderRecommendationRequest("How do bamboo stamps work?", providers), false);
});

test("builds structured top-three cards from the highest-rated nearby providers", () => {
  const providers = [
    { _id: "rated-2", fullName: "Second Plumber", professions: ["Plumber"], averageRating: 4.8, totalReviews: 12 },
    { _id: "unrated", fullName: "Unrated Plumber", professions: ["Plumber"], averageRating: 0, totalReviews: 0 },
    { _id: "other-service", fullName: "Painter", professions: ["Painter"], averageRating: 5, totalReviews: 40 },
    { _id: "rated-1", fullName: "First Plumber", professions: ["Plumber"], averageRating: 4.9, totalReviews: 8 },
    { _id: "rated-3", fullName: "Third Plumber", professions: ["Plumber"], averageRating: 4.7, totalReviews: 16 },
    { _id: "rated-4", fullName: "Fourth Plumber", professions: ["Plumber"], averageRating: 4.6, totalReviews: 99 },
  ];
  const result = buildTopRatedRecommendations(
    { city: "Dagupan", province: "Pangasinan" },
    providers,
    "Who are the top plumbers?",
  );

  assert.deepEqual(result, {
    type: "recommendation_cards",
    intro: "🐼 Here are the top 3 Plumbers within 5 km of you in Dagupan, Pangasinan.",
    providers: [
      { providerId: "rated-1", name: "First Plumber", category: "Plumber", rating: 4.9, reviewCount: 8, isNew: false, distanceKm: null },
      { providerId: "rated-2", name: "Second Plumber", category: "Plumber", rating: 4.8, reviewCount: 12, isNew: false, distanceKm: null },
      { providerId: "rated-3", name: "Third Plumber", category: "Plumber", rating: 4.7, reviewCount: 16, isNew: false, distanceKm: null },
    ],
  });
});

test("fills missing top-rated recommendations with nearby unrated new providers", () => {
  const providers = [
    { _id: "rated", fullName: "Reviewed Plumber", professions: ["Plumber"], averageRating: 4.8, totalReviews: 3, distanceKm: 2.1, city: "Dagupan", province: "Pangasinan" },
    { _id: "new-near", fullName: "New Nearby", professions: ["Plumber"], averageRating: 0, totalReviews: 0, distanceKm: 1.1 },
    { _id: "new-far", fullName: "New Farther", professions: ["Plumber"], averageRating: 0, totalReviews: 0, distanceKm: 4.8 },
  ];
  const result = buildTopRatedRecommendations(
    { city: "Dagupan", province: "Pangasinan" },
    providers,
    "Find top pros near me",
  );

  assert.equal(result.type, "recommendation_cards");
  assert.match(result.intro, /within 5 km/);
  assert.match(result.intro, /new providers with no ratings yet/);
  assert.deepEqual(result.providers.map((provider) => provider.providerId), ["rated", "new-near", "new-far"]);
  assert.equal(result.providers[0].isNew, false);
  assert.equal(result.providers[1].isNew, true);
  assert.equal(result.providers[1].distanceKm, 1.1);
  assert.equal(result.providers[0].location, "Dagupan, Pangasinan");
});

test("returns new provider cards when no reviewed providers are within five kilometers", () => {
  const result = buildTopRatedRecommendations(
    { city: "Dagupan", province: "Pangasinan" },
    [
      { _id: "new-1", professions: ["Plumber"], averageRating: 0, totalReviews: 0, distanceKm: 2 },
      { _id: "new-2", professions: ["Plumber"], averageRating: 0, totalReviews: 0, distanceKm: 3 },
    ],
    "Who are the top plumbers?",
  );

  assert.equal(result.type, "recommendation_cards");
  assert.match(result.intro, /couldn't find rated Plumbers within 5 km/);
  assert.deepEqual(result.providers.map((provider) => provider.isNew), [true, true]);
});

test("returns a truthful text response when no providers are within five kilometers", () => {
  const result = buildTopRatedRecommendations(
    { city: "Dagupan", province: "Pangasinan" },
    [],
    "Who are the top plumbers?",
  );

  assert.equal(result.type, "text");
  assert.match(result.response, /Plumber providers within 5 km/);
  assert.match(result.response, /Dagupan, Pangasinan/);
});

test("explains top-pro search results across the city without naming a barangay", () => {
  const response = buildTopRatedEmptyResponse(
    { city: "Dagupan", province: "Pangasinan" },
    [{ professions: ["Painter"], averageRating: 0, totalReviews: 0 }],
  );
  assert.match(response, /within 5 km of you in Dagupan, Pangasinan/);
  assert.match(response, /couldn't find Painter providers/);
  assert.doesNotMatch(response, /Patalan/);
});

test("rejects malformed structured model responses", () => {
  assert.throws(() => parsePandaBotResponse("not json", []), SyntaxError);
  assert.throws(() => parsePandaBotResponse(JSON.stringify({ message: "No IDs" }), []), TypeError);
});

test("provides privacy-limited booking status and receipt context", () => {
  const context = buildBookingContext([{
    _id: "507f1f77bcf86cd799439011",
    repairDescription: "Repair leaking kitchen sink",
    status: "in_progress",
    serviceDate: "2026-10-12T00:00:00.000Z",
    timeSlot: "9:00 AM",
    paymentMethod: "cash",
    clientConfirmedCash: true,
    providerConfirmedCash: false,
    cashReceipt: { receiptNumber: "TP-2026-001" },
    address: "Do not include street address",
  }]);

  assert.deepEqual(context, [{
    bookingRef: "439011",
    task: "Repair leaking kitchen sink",
    status: "In Progress",
    serviceDate: "2026-10-12T00:00:00.000Z",
    timeSlot: "9:00 AM",
    paymentMethod: "cash",
    clientConfirmedCash: true,
    providerConfirmedCash: false,
    settledAt: null,
    receiptNumber: "TP-2026-001",
  }]);
});

test("uses current bamboo stamp progress and only active stamp vouchers", () => {
  assert.deepEqual(buildRewardContext({
    stampProgress: 3,
    vouchers: [
      { origin: "stamp-card", status: "active", amount: 50, expiresAt: null },
      { origin: "stamp-card", status: "redeemed", amount: 50 },
      { origin: "referral", status: "active", amount: 50 },
    ],
  }), {
    stampProgress: 3,
    stampsRequired: 5,
    activeStampVouchers: [{ amount: 50, expiresAt: null }],
  });
});