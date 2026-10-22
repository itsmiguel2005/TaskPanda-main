import test from "node:test";
import assert from "node:assert/strict";
import {
  formatBookingRequestCountdown,
  formatBookingRequestDeadline,
  getBookingRequestExpiryDetails,
} from "./bookingExpiry.mjs";

test("advance same-day booking uses its 30-minute appointment cutoff instead of a stale 15-minute timer", () => {
  const booking = {
    serviceDate: "2026-10-22T00:00:00.000Z",
    timeSlot: "6:00 PM",
    createdAt: "2026-10-22T07:00:00.000Z",
    requestExpiresAt: "2026-10-22T07:15:00.000Z",
  };

  const expiry = getBookingRequestExpiryDetails(booking);
  assert.equal(expiry.type, "appointment_cutoff");
  assert.equal(expiry.deadline.toISOString(), "2026-10-22T09:30:00.000Z");
  assert.equal(formatBookingRequestDeadline(expiry.deadline), "5:30 PM");
});

test("urgent same-day booking uses the 15-minute timer capped by appointment time", () => {
  const booking = {
    serviceDate: "2026-10-22T00:00:00.000Z",
    timeSlot: "3:00 PM",
    createdAt: "2026-10-22T06:45:00.000Z",
    requestExpiresAt: "2026-10-22T07:00:00.000Z",
    requestExpiryType: "urgent_same_day",
  };

  const expiry = getBookingRequestExpiryDetails(booking);
  assert.equal(expiry.type, "urgent_same_day");
  assert.equal(expiry.deadline.toISOString(), "2026-10-22T07:00:00.000Z");
  assert.equal(formatBookingRequestDeadline(expiry.deadline), "3:00 PM");
});

test("future booking uses the same appointment-minus-30-minute cutoff", () => {
  const booking = {
    serviceDate: "2026-10-23T00:00:00.000Z",
    timeSlot: "6:00 PM",
    createdAt: "2026-10-22T07:00:00.000Z",
    requestExpiryType: "appointment_cutoff",
  };

  assert.equal(
    getBookingRequestExpiryDetails(booking).deadline.toISOString(),
    "2026-10-23T09:30:00.000Z"
  );
});

test("countdown formatting includes hours for long advance-booking windows", () => {
  assert.equal(formatBookingRequestCountdown(9000), "2:30:00");
  assert.equal(formatBookingRequestCountdown(900), "15:00");
});
