const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateDistanceKm,
  calculateTravelFare,
  calculateTravelFeeDiscount,
  calculateTotalPrice,
} = require("./bookingPricing");

test("distance calculation uses longitude-latitude coordinates", () => {
  assert.equal(calculateDistanceKm([121.5, 14.6], [121.5, 14.6]), 0);
  assert.ok(Math.abs(calculateDistanceKm([0, 0], [1, 0]) - 111.195) < 0.01);
});

test("travel fare applies the configured base plus the per-kilometer rate", () => {
  assert.equal(calculateTravelFare(0), 20);
  assert.equal(calculateTravelFare(2), 40);
});

test("travel fare accepts adjusted global rates", () => {
  assert.equal(calculateTravelFare(2.1), 41);
  assert.equal(calculateTravelFare(3.5), 55);
  assert.equal(calculateTravelFare(3.5, { baseFee: 25, feePerKm: 8 }), 53);
  assert.throws(() => calculateTravelFare(3.5, { baseFee: -1, feePerKm: 8 }), TypeError);
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
  assert.equal(calculateTotalPrice(100, 21, 50), 171);
  assert.equal(calculateTotalPrice(100, 20, 1.5), 121.5);
});