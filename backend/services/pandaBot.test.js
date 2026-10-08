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
  addTravelFeeEstimates,
  findFavoriteNameMatches,
  findProviderChoiceMatches,
  isFavoriteProviderListRequest,
  buildFavoriteRecommendations,
  findProviderNameMatches,
  getRecentContextProviderIds,
  getRecentContextRequestedDate,
  getProviderNameSearchTerms,
  isFavoriteReference,
  isProviderAvailabilityRequest,
  isAvailabilityDateFollowUp,
  isProviderChoiceFollowUp,
  getAvailableTimeSlots,
  getPhilippineDateOffset,
  findRequestedProfession,
  isProviderRecommendationRequest,
  isTopRatedRequest,
  normalizeCoordinates,
  normalizeUserLocation,
  parsePandaBotResponse,
  parseRequestedServiceDate,
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
  assert.equal(reviewedPipeline[3].$project.distanceKm.$round[1], 2);
});

test("calculates provider travel estimates using the configured booking fare rules", () => {
  const enriched = addTravelFeeEstimates([
    { _id: "provider", distanceKm: 3.5 },
  ], { travelBaseFee: 20, travelFeePerKm: 10 });
  assert.equal(enriched[0].estimatedTravelFee, 35);
});

test("parses booking dates using Philippine local time", () => {
  const now = new Date("2026-10-08T16:00:00.000Z");
  assert.equal(getPhilippineDateOffset(0, now), "2026-10-09");
  assert.equal(getPhilippineDateOffset(1, now), "2026-10-10");
  assert.equal(parseRequestedServiceDate("Can Mariel come tomorrow?", now), "2026-10-10");
  assert.equal(parseRequestedServiceDate("Check his availability tommrow", now), "2026-10-10");
  assert.equal(parseRequestedServiceDate("Check availability tommorow", now), "2026-10-10");
  assert.equal(parseRequestedServiceDate("how about for october 10?", now), "2026-10-10");
  assert.equal(parseRequestedServiceDate("check for Oct. 10th", now), "2026-10-10");
  assert.equal(parseRequestedServiceDate("October 10, 2026", now), "2026-10-10");
  assert.equal(parseRequestedServiceDate("October 40", now), "");
  assert.equal(parseRequestedServiceDate("October 7", now), "2027-10-07");
  assert.equal(parseRequestedServiceDate("Can Mariel come on 2026-10-12?", now), "2026-10-12");
  assert.equal(parseRequestedServiceDate("When can she come?", now), "");
});

test("resolves provider names from the caller's favorites by the saved provider record", () => {
  const savedFavorites = [
    { _id: "favorite-account", fullName: "Mariel Estrada Estrada Calilim" },
  ];
  const sameNameNotFavorited = { _id: "other-account", fullName: "Mariel Estrada Calilim" };
  assert.deepEqual(
    findFavoriteNameMatches(savedFavorites, "Can you check Mariel in my favourites tomorrow?").map(({ _id }) => _id),
    ["favorite-account"],
  );
  assert.deepEqual(
    findFavoriteNameMatches([...savedFavorites, sameNameNotFavorited], "Can you check Mariel Estrada Calilim in my favorites?").map(({ _id }) => _id),
    ["other-account"],
  );
});

test("matches an abbreviated provider name in an availability request without requiring a full name", () => {
  const providers = [
    { _id: "mariel", fullName: "Mariel Estrada Estrada Calilim" },
    { _id: "mariel-short", fullName: "Mariel Estrada Calilim" },
    { _id: "maria", fullName: "Maria Estrada Santos" },
  ];
  const message = "check tomorrow October 9 availability provider named Mariel Estrada";

  assert.deepEqual(getProviderNameSearchTerms(message), ["mariel", "estrada"]);
  assert.deepEqual(findProviderNameMatches(providers, message).map(({ _id }) => _id), ["mariel", "mariel-short"]);
  assert.deepEqual(
    findProviderNameMatches(providers, "check mariel estrada estrada calilim availability tomorrow").map(({ _id }) => _id),
    ["mariel"],
  );
  assert.deepEqual(findProviderNameMatches(providers, "What time can I book Mariel tomorrow?").map(({ _id }) => _id), ["mariel", "mariel-short"]);
  assert.deepEqual(getProviderNameSearchTerms("can you check its availability tommrow"), []);
  assert.deepEqual(getProviderNameSearchTerms("how about for october 10?"), []);
});

test("uses the most recent provider card as context for pronoun availability follow-ups", () => {
  const history = [
    { role: "user", providerIds: [] },
    { role: "assistant", providerIds: ["provider-from-favorite-card"] },
    { role: "user", providerIds: [] },
    { role: "assistant", providerIds: [] },
  ];
  assert.deepEqual(getRecentContextProviderIds(history), ["provider-from-favorite-card"]);
  assert.deepEqual(
    getRecentContextProviderIds([{ role: "assistant", contextProviderIds: ["choice-1", "choice-2"] }]),
    ["choice-1", "choice-2"],
  );
  assert.equal(getRecentContextRequestedDate([
    { role: "assistant", contextRequestedDate: "2026-10-10" },
    { role: "assistant", contextRequestedDate: "" },
  ]), "2026-10-10");
  assert.equal(getRecentContextRequestedDate([{ role: "assistant", contextRequestedDate: "tomorrow" }]), "");
  assert.equal(getRecentContextRequestedDate([{ role: "assistant", contextRequestedDate: "2026-99-99" }]), "");
  assert.deepEqual(getRecentContextProviderIds([{ role: "assistant", providerIds: [] }]), []);
  assert.equal(isAvailabilityDateFollowUp("how about for October 10?", true, new Date("2026-10-08T16:00:00.000Z")), true);
  assert.equal(isAvailabilityDateFollowUp("how about for October 10?", false, new Date("2026-10-08T16:00:00.000Z")), false);
  assert.equal(isAvailabilityDateFollowUp("tell me about October 10", true, new Date("2026-10-08T16:00:00.000Z")), false);
  assert.equal(isProviderChoiceFollowUp("the aerospace engineer", true), true);
  assert.equal(isProviderChoiceFollowUp("how do bamboo stamps work", true), false);
  assert.equal(isProviderChoiceFollowUp("the aerospace engineer", false), false);
});

test("disambiguates provider choices by profession or location", () => {
  const providers = [
    { _id: "painter", fullName: "Mariel Estrada Calilim", professions: ["Painter"], city: "Dagupan" },
    { _id: "engineer", fullName: "Mariel Estrada Estrada Calilim", professions: ["Aerospace Engineer"], city: "Calasiao" },
  ];
  assert.deepEqual(findProviderChoiceMatches(providers, "the aerospace engineer").map(({ _id }) => _id), ["engineer"]);
  assert.deepEqual(findProviderChoiceMatches(providers, "the Dagupan provider").map(({ _id }) => _id), ["painter"]);
});

test("recognizes favorite-list questions and builds cards from the caller's saved providers", () => {
  const savedProviders = [{
    _id: "saved-mariel",
    fullName: "Mariel Estrada Estrada Calilim",
    professions: ["Aerospace Engineer"],
    averageRating: 4.9,
    totalReviews: 8,
    city: "Calasiao",
    province: "Pangasinan",
    isFavorite: true,
  }];

  assert.equal(isFavoriteProviderListRequest("who is the providers in my favourites"), true);
  assert.equal(isFavoriteProviderListRequest("show my favorite providers"), true);
  assert.equal(isFavoriteProviderListRequest("who is my saved providers?"), true);
  assert.equal(isFavoriteProviderListRequest("what providers did I save?"), true);
  assert.equal(isFavoriteProviderListRequest("show my bookmarked pros"), true);
  assert.equal(isFavoriteProviderListRequest("list the providers I liked"), true);
  assert.equal(isFavoriteReference("my saved provider"), true);
  assert.equal(isFavoriteProviderListRequest("how do bamboo stamps work"), false);
  assert.deepEqual(buildFavoriteRecommendations(savedProviders), {
    type: "recommendation_cards",
    intro: "🐼 Here is the provider in your favourites:",
    providers: [{
      providerId: "saved-mariel",
      name: "Mariel Estrada Estrada Calilim",
      category: "Aerospace Engineer",
      rating: 4.9,
      reviewCount: 8,
      isNew: false,
      isFavorite: true,
      location: "Calasiao, Pangasinan",
    }],
  });
  assert.match(buildFavoriteRecommendations([]).response, /don’t have any active providers saved/i);
});

test("recognizes common availability synonyms and follow-up phrasing", () => {
  for (const message of [
    "Is Mariel free tomorrow?",
    "When is Mariel open?",
    "What is her schedule tomorrow?",
    "Can I book Mariel tomorrow?",
    "Is she working tomorrow?",
    "Check his availability tomorrow",
    "Can you check its availability tomorrow?",
  ]) {
    assert.equal(isProviderAvailabilityRequest(message), true, message);
    assert.equal(isProviderRecommendationRequest(message), true, message);
  }
});

test("availability uses the same 60-minute schedule-conflict rules as booking", () => {
  const available = getAvailableTimeSlots({
    serviceDate: "2026-10-10",
    serviceGeoLocation: { type: "Point", coordinates: [120.596, 16.043] },
    travelDistanceKm: 2,
    bookings: [{
      _id: "busy",
      serviceDate: "2026-10-10T00:00:00.000Z",
      timeSlot: "9:00 AM",
      estimatedDurationMinutes: 60,
      serviceGeoLocation: { type: "Point", coordinates: [120.596, 16.043] },
    }],
    now: new Date("2026-10-09T02:00:00.000Z"),
  });
  assert.equal(available.includes("9:00 AM"), false);
  assert.equal(available.includes("7:30 AM"), true);
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
    distanceKm: null,
    estimatedTravelFee: null,
    isFavorite: false,
    availabilityDate: null,
    availableSlots: [],
    availabilityDurationMinutes: null,
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
  assert.equal(isProviderRecommendationRequest("Can you check Mariel in my favourites available time for tomorrow?"), true);
  assert.equal(isProviderRecommendationRequest("What times can I book Mariel tomorrow?"), true);
  assert.equal(isProviderRecommendationRequest("How do bamboo stamps work?", providers), false);
});

test("maps issue descriptions to trade categories for provider matching", () => {
  assert.equal(findRequestedProfession([], "My aircon is leaking badly and making a weird noise"), "Aircon Tech");
  assert.equal(isProviderRecommendationRequest("My aircon is leaking badly and making a weird noise"), true);
  assert.equal(isProviderRecommendationRequest("My pipe leaks"), true);
  assert.equal(isProviderRecommendationRequest("The aircon is not cooling"), true);
  assert.equal(findRequestedProfession([], "The kitchen drain is clogged"), "Plumber");
  assert.equal(findRequestedProfession([], "My car engine is making a strange sound"), "Mechanic");
  assert.equal(findRequestedProfession([], "Several outlets are sparking"), "Electrician");
});

test("PandaBot rules ground diagnostics, fare estimates, payment, and safety in supplied facts", () => {
  const { systemInstruction } = require("./pandaBot");
  assert.match(systemInstruction, /non-definitive service triage/);
  assert.match(systemInstruction, /final amount is confirmed in booking/);
  assert.match(systemInstruction, /After both confirmations/);
  assert.match(systemInstruction, /submits an open report for administrator review/);
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
      { providerId: "rated-1", name: "First Plumber", category: "Plumber", rating: 4.9, reviewCount: 8, isNew: false, distanceKm: null, estimatedTravelFee: null, isFavorite: false },
      { providerId: "rated-2", name: "Second Plumber", category: "Plumber", rating: 4.8, reviewCount: 12, isNew: false, distanceKm: null, estimatedTravelFee: null, isFavorite: false },
      { providerId: "rated-3", name: "Third Plumber", category: "Plumber", rating: 4.7, reviewCount: 16, isNew: false, distanceKm: null, estimatedTravelFee: null, isFavorite: false },
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

test("returns an exact favorite provider with date-specific available booking slots", () => {
  const result = buildTopRatedRecommendations(
    { city: "Dagupan", province: "Pangasinan" },
    [{
      _id: "favorite-mariel",
      fullName: "Mariel Estrada Calilim",
      professions: ["Painter"],
      averageRating: 0,
      totalReviews: 0,
      city: "Dagupan",
      province: "Pangasinan",
      isFavorite: true,
      searchRadiusKm: 50,
      availabilityDate: "2026-10-10",
      availableSlots: ["7:30 AM", "1:30 PM"],
      availabilityDurationMinutes: 60,
      distanceKm: 3.2,
      estimatedTravelFee: 32,
    }],
    "Can you check Mariel in my favourites available time for tomorrow?",
  );

  assert.match(result.intro, /within 50 km/);
  assert.equal(result.providers[0].providerId, "favorite-mariel");
  assert.equal(result.providers[0].isFavorite, true);
  assert.equal(result.providers[0].availabilityDate, "2026-10-10");
  assert.equal(result.providers[0].availabilityDateLabel, "Saturday, October 10");
  assert.deepEqual(result.providers[0].availableSlots, ["7:30 AM", "1:30 PM"]);
  assert.equal(result.providers[0].estimatedTravelFee, 32);
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