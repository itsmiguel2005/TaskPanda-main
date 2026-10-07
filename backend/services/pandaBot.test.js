const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildBookingContext,
  buildProviderContext,
  buildProviderFilter,
  buildRewardContext,
  buildTopRatedEmptyResponse,
  isTopRatedRequest,
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

test("explains top-pro search results across the city without naming a barangay", () => {
  const response = buildTopRatedEmptyResponse(
    { city: "Dagupan", province: "Pangasinan" },
    [{ professions: ["Painter"], averageRating: 0, totalReviews: 0 }],
  );
  assert.match(response, /across Dagupan, Pangasinan/);
  assert.match(response, /Painter/);
  assert.match(response, /do not have customer reviews yet/);
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