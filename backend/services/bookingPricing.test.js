const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateDistanceKm, calculateTravelFare, calculateTotalPrice } = require("./bookingPricing");

test("distance calculation uses longitude-latitude coordinates", () => {
  assert.equal(calculateDistanceKm([121.5, 14.6], [121.5, 14.6]), 0);
  assert.ok(Math.abs(calculateDistanceKm([0, 0], [1, 0]) - 111.195) < 0.01);
});

test("travel fare covers the first two kilometers for the base fare", () => {
  assert.equal(calculateTravelFare(0), 20);
  assert.equal(calculateTravelFare(2), 20);
});

test("travel fare prorates each kilometer beyond the base distance", () => {
  assert.equal(calculateTravelFare(2.1), 21);
  assert.equal(calculateTravelFare(3.5), 35);
});

test("booking total combines task offer, travel fare, and optional tip", () => {
  assert.equal(calculateTotalPrice(100, 35), 135);
  assert.equal(calculateTotalPrice(100, 21, 50), 171);
  assert.equal(calculateTotalPrice(100, 20, 1.5), 121.5);
});