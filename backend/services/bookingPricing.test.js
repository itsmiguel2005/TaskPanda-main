const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BASELINE_TASK_OFFER_DURATION_MINUTES,
  DEFAULT_TRAVEL_BASE_FEE,
  BASE_FARE_DISTANCE_KM,
  calculateDistanceKm,
  calculateDurationAdjustedTaskOffer,
  calculateTravelFare,
  calculateTravelFeeDiscount,
  calculateTotalPrice,
} = require("./bookingPricing");

test("distance calculation uses longitude-latitude coordinates", () => {
  assert.equal(calculateDistanceKm([121.5, 14.6], [121.5, 14.6]), 0);
  assert.ok(Math.abs(calculateDistanceKm([0, 0], [1, 0]) - 111.195) < 0.01);
});

test("the base fare covers the first two travel kilometers", () => {
  assert.equal(DEFAULT_TRAVEL_BASE_FEE, 20);
  assert.equal(BASE_FARE_DISTANCE_KM, 2);
  assert.equal(calculateTravelFare(0), 20);
  assert.equal(calculateTravelFare(1.99), 20);
  assert.equal(calculateTravelFare(2), 20);
  assert.equal(calculateTravelFare(2.1), 21);
  assert.equal(calculateTravelFare(2.51), 25.1);
  assert.equal(calculateTravelFare(3), 30);
});

test("travel fare adds the configured rate only to distance beyond the base fare range", () => {
  assert.equal(calculateTravelFare(3.5), 35);
  assert.equal(calculateTravelFare(3.5, { feePerKm: 8 }), 32);
  assert.equal(calculateTravelFare(3.5, { baseFee: 30, baseFareDistanceKm: 3, feePerKm: 8 }), 34);
  assert.equal(calculateTotalPrice(100, calculateTravelFare(3)), 130);
  assert.throws(() => calculateTravelFare(3.5, { baseFareDistanceKm: -1, feePerKm: 8 }), TypeError);
});

test("vouchers only discount the travel fare and cannot make it negative", () => {
  assert.equal(calculateTravelFeeDiscount(35, 50), 35);
  assert.equal(calculateTravelFeeDiscount(75, 50), 50);
  const voucherDeduction = calculateTravelFeeDiscount(75, 50);
  assert.equal(calculateTotalPrice(100, 75 - voucherDeduction, 20), 145);
  assert.throws(() => calculateTravelFeeDiscount(20, -1), TypeError);
});

test("booking total combines task offer, travel fare, and optional tip", () => {
  assert.equal(calculateTotalPrice(100, 35), 135);
  assert.equal(calculateTotalPrice(100, 20, 50), 170);
  assert.equal(calculateTotalPrice(100, 20, 1.5), 121.5);
});

test("task offer scales proportionally from the 60-minute baseline", () => {
  assert.equal(BASELINE_TASK_OFFER_DURATION_MINUTES, 60);
  assert.equal(calculateDurationAdjustedTaskOffer(900, 60), 900);
  assert.equal(calculateDurationAdjustedTaskOffer(900, 30), 450);
  assert.equal(calculateDurationAdjustedTaskOffer(900, 90), 1350);
  assert.equal(calculateDurationAdjustedTaskOffer(900, 120), 1800);
  assert.equal(calculateDurationAdjustedTaskOffer(100, 15), 25);
  assert.throws(() => calculateDurationAdjustedTaskOffer(100, 0), TypeError);
});