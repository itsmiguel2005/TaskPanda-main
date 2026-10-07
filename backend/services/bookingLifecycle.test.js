const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SAME_DAY_REQUEST_TTL_MS,
  canArriveForSameDayBooking,
  DEFAULT_ESTIMATED_DURATION_MINUTES,
  getBookingOccupiedWindow,
  getInterBookingTravelDurationMinutes,
  getBookingRequestExpiration,
  getEstimatedTravelDurationMinutes,
  getScheduledServiceTime,
  hasScheduleConflict,
  isSamePhilippineCalendarDay,
  isValidEstimatedDurationMinutes,
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
  assert.equal(canArriveForSameDayBooking(serviceDate, "1:30 PM", 0, new Date("2026-10-03T05:22:00.000Z")), false);
  assert.equal(canArriveForSameDayBooking(serviceDate, "1:30 PM", 0, new Date("2026-10-03T05:15:00.000Z")), true);
  assert.equal(canArriveForSameDayBooking(serviceDate, "10:00 AM", null, new Date("2026-10-03T00:00:00.000Z")), false);
  assert.equal(canArriveForSameDayBooking("2026-10-04T00:00:00.000Z", "7:30 AM", null, new Date("2026-10-03T00:00:00.000Z")), true);
});

test("duration limits and backwards-compatible default are applied", () => {
  assert.equal(DEFAULT_ESTIMATED_DURATION_MINUTES, 60);
  assert.equal(isValidEstimatedDurationMinutes(15), true);
  assert.equal(isValidEstimatedDurationMinutes(720), true);
  assert.equal(isValidEstimatedDurationMinutes(0), false);
  assert.equal(isValidEstimatedDurationMinutes(100), false);
});

test("occupied windows include estimated duration and a 30-minute turnover buffer", () => {
  const window = getBookingOccupiedWindow({
    serviceDate: "2026-10-03T00:00:00.000Z",
    timeSlot: "9:00 AM",
    estimatedDurationMinutes: 120,
  });
  assert.equal(window.startAt.toISOString(), "2026-10-03T01:00:00.000Z");
  assert.equal(window.endAt.toISOString(), "2026-10-03T03:30:00.000Z");
  assert.equal(getBookingOccupiedWindow({
    serviceDate: "2026-10-03T00:00:00.000Z",
    timeSlot: "9:00 AM",
  }).durationMinutes, 60);
});

test("schedule conflict checks duration overlap instead of exact time equality", () => {
  const existing = [{
    _id: "existing-booking",
    serviceDate: "2026-10-03T00:00:00.000Z",
    timeSlot: "9:00 AM",
    estimatedDurationMinutes: 120,
  }];
  assert.equal(hasScheduleConflict({
    serviceDate: "2026-10-03T00:00:00.000Z",
    timeSlot: "10:30 AM",
    estimatedDurationMinutes: 90,
  }, existing), true);
  assert.equal(hasScheduleConflict({
    serviceDate: "2026-10-03T00:00:00.000Z",
    timeSlot: "1:30 PM",
    estimatedDurationMinutes: 90,
  }, existing), false);
  assert.equal(hasScheduleConflict({
    serviceDate: "2026-10-03T00:00:00.000Z",
    timeSlot: "9:00 AM",
    estimatedDurationMinutes: 90,
  }, existing, "existing-booking"), false);
});

test("inter-booking travel time uses the two client pins at 30 km/h", () => {
  const tenKmEast = 10 / (2 * Math.PI * 6371.0088 / 360);
  assert.equal(getInterBookingTravelDurationMinutes(
    { type: "Point", coordinates: [0, 0] },
    { type: "Point", coordinates: [tenKmEast, 0] }
  ), 20);
  assert.equal(getInterBookingTravelDurationMinutes(null, {
    type: "Point",
    coordinates: [tenKmEast, 0],
  }), 0);
});

test("schedule conflicts include client-to-client travel and the separate safety buffer", () => {
  const firstBooking = {
    serviceDate,
    timeSlot: "7:30 AM",
    estimatedDurationMinutes: 60,
    serviceGeoLocation: { type: "Point", coordinates: [0, 0] },
  };
  const distantNextBooking = {
    serviceDate,
    timeSlot: "9:00 AM",
    estimatedDurationMinutes: 60,
    serviceGeoLocation: { type: "Point", coordinates: [10 / 111.195, 0] },
  };
  assert.equal(hasScheduleConflict(distantNextBooking, [firstBooking]), true);
  assert.equal(hasScheduleConflict({
    ...distantNextBooking,
    timeSlot: "10:30 AM",
  }, [firstBooking]), false);
  assert.equal(hasScheduleConflict({
    ...firstBooking,
    timeSlot: "7:30 AM",
    serviceGeoLocation: distantNextBooking.serviceGeoLocation,
  }, [{
    ...firstBooking,
    timeSlot: "9:00 AM",
  }]), true);
});
