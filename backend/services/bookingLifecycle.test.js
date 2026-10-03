const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SAME_DAY_REQUEST_TTL_MS,
  canArriveForSameDayBooking,
  getBookingRequestExpiration,
  getEstimatedTravelDurationMinutes,
  getScheduledServiceTime,
  isSamePhilippineCalendarDay,
} = require("./bookingLifecycle");

const serviceDate = "2026-10-03T00:00:00.000Z";

test("same-day detection follows the Philippine calendar day", () => {
  assert.equal(isSamePhilippineCalendarDay(serviceDate, new Date("2026-10-03T01:00:00.000Z")), true);
  assert.equal(isSamePhilippineCalendarDay(serviceDate, new Date("2026-10-02T15:59:59.000Z")), false);
  assert.equal(isSamePhilippineCalendarDay(serviceDate, new Date("2026-10-03T16:00:00.000Z")), false);
});

test("only same-day requests receive the strict 15-minute expiration", () => {
  const submittedAt = new Date("2026-10-03T01:00:00.000Z");
  assert.equal(getBookingRequestExpiration(serviceDate, submittedAt).getTime(), submittedAt.getTime() + SAME_DAY_REQUEST_TTL_MS);
  assert.equal(getBookingRequestExpiration("2026-10-04T00:00:00.000Z", submittedAt), null);
});

test("appointment slots are translated from Philippine time to UTC", () => {
  assert.equal(getScheduledServiceTime(serviceDate, "9:00 AM").toISOString(), "2026-10-03T01:00:00.000Z");
  assert.equal(getScheduledServiceTime(serviceDate, "6:00 PM").toISOString(), "2026-10-03T10:00:00.000Z");
  assert.equal(getScheduledServiceTime(serviceDate, "not a slot"), null);
});

test("travel duration uses 30 km/h and includes a 15-minute buffer", () => {
  assert.equal(getEstimatedTravelDurationMinutes(0), 15);
  assert.equal(getEstimatedTravelDurationMinutes(15), 45);
  assert.equal(getEstimatedTravelDurationMinutes(-1), null);
});

test("same-day acceptance is blocked when travel plus buffer misses the slot", () => {
  assert.equal(canArriveForSameDayBooking(serviceDate, "10:00 AM", 15, new Date("2026-10-03T01:14:59.000Z")), true);
  assert.equal(canArriveForSameDayBooking(serviceDate, "10:00 AM", 15, new Date("2026-10-03T01:15:01.000Z")), false);
  assert.equal(canArriveForSameDayBooking(serviceDate, "10:00 AM", null, new Date("2026-10-03T00:00:00.000Z")), false);
  assert.equal(canArriveForSameDayBooking("2026-10-04T00:00:00.000Z", "7:30 AM", null, new Date("2026-10-03T00:00:00.000Z")), true);
});
