const test = require("node:test");
const assert = require("node:assert/strict");
const Booking = require("../models/Booking");
const User = require("../models/User");
const { processExpiredBookingRequests, handleUpdateBookingStatus } = require("./bookingController");

const originalFind = Booking.find;
const originalFindOne = Booking.findOne;
const originalFindOneAndUpdate = Booking.findOneAndUpdate;
const originalBookingUpdateOne = Booking.updateOne;
const originalUpdateOne = User.updateOne;

test.afterEach(() => {
  Booking.find = originalFind;
  Booking.findOne = originalFindOne;
  Booking.findOneAndUpdate = originalFindOneAndUpdate;
  Booking.updateOne = originalBookingUpdateOne;
  User.updateOne = originalUpdateOne;
});

test("appointment-cutoff expiry restores a redeemed travel voucher", async () => {
  const bookingId = "64b000000000000000000001";
  const clientId = "64b000000000000000000002";
  const voucherId = "64b000000000000000000003";
  const voucher = { _id: voucherId, status: "redeemed", bookingId };
  const previousPhilippineDay = new Date(Date.now() + 8 * 60 * 60 * 1000);
  previousPhilippineDay.setUTCHours(0, 0, 0, 0);
  previousPhilippineDay.setUTCDate(previousPhilippineDay.getUTCDate() - 1);
  const serviceDate = previousPhilippineDay.toISOString();
  const expiredBooking = { _id: bookingId, clientId, voucherId, status: "expired" };
  let expiryUpdated = false;
  let voucherRestored = false;
  let restorationRecorded = false;

  Booking.find = (filter) => {
    assert.equal(filter.$or[0].status.$in[0], "pending");
    assert.ok(filter.$or[0].$or.some((condition) => condition.serviceDate));
    assert.equal(filter.$or[1].voucherRestoredAt.$exists, false);
    return {
      select: async () => [{
        _id: bookingId,
        clientId,
        voucherId,
        status: "pending",
        serviceDate,
        timeSlot: "9:00 AM",
      }],
    };
  };
  Booking.findOneAndUpdate = async (filter, update, options) => {
    assert.equal(String(filter._id), bookingId);
    assert.deepEqual(filter.status.$in, ["pending", "Pending Request"]);
    assert.equal(update.$set.status, "expired");
    assert.ok(update.$set.expiredAt instanceof Date);
    assert.match(update.$set.expirationReason, /30 minutes prior to appointment time/);
    assert.equal(options.new, true);
    expiryUpdated = true;
    return expiredBooking;
  };
  User.updateOne = async (filter, update) => {
    assert.equal(String(filter._id), clientId);
    const match = filter.vouchers.$elemMatch;
    assert.equal(String(match._id), voucherId);
    assert.equal(match.status, "redeemed");
    assert.equal(String(match.bookingId), bookingId);
    assert.equal(update.$set["vouchers.$.status"], "active");
    assert.equal(update.$unset["vouchers.$.bookingId"], 1);
    assert.equal(update.$unset["vouchers.$.redeemedAt"], 1);
    voucher.status = "active";
    delete voucher.bookingId;
    voucherRestored = true;
    return { modifiedCount: 1 };
  };
  Booking.updateOne = async (filter, update) => {
    assert.equal(String(filter._id), bookingId);
    assert.equal(filter.status, "expired");
    assert.equal(filter.voucherRestoredAt.$exists, false);
    assert.ok(update.$set.voucherRestoredAt instanceof Date);
    restorationRecorded = true;
    return { modifiedCount: 1 };
  };

  assert.equal(await processExpiredBookingRequests(), 1);
  assert.equal(expiryUpdated, true);
  assert.equal(voucherRestored, true);
  assert.equal(restorationRecorded, true);
  assert.equal(voucher.status, "active");
  assert.equal(voucher.bookingId, undefined);
});

test("expiry processing recovers vouchers from bookings that already expired", async () => {
  const bookingId = "64b000000000000000000011";
  const clientId = "64b000000000000000000012";
  const voucherId = "64b000000000000000000013";
  const voucher = { _id: voucherId, status: "redeemed", bookingId };
  const booking = { _id: bookingId, clientId, voucherId, status: "expired" };
  let restorationRecorded = false;

  Booking.find = () => ({
    select: async () => [{ ...booking }],
  });
  Booking.findOneAndUpdate = async () => {
    throw new Error("Already-expired bookings must not be expired a second time.");
  };
  User.updateOne = async (filter, update) => {
    assert.equal(String(filter._id), clientId);
    assert.equal(filter.vouchers.$elemMatch.status, "redeemed");
    assert.equal(String(filter.vouchers.$elemMatch.bookingId), bookingId);
    assert.equal(update.$set["vouchers.$.status"], "active");
    voucher.status = "active";
    delete voucher.bookingId;
    return { modifiedCount: 1 };
  };
  Booking.updateOne = async (filter, update) => {
    assert.equal(String(filter._id), bookingId);
    assert.equal(update.$set.voucherRestoredAt instanceof Date, true);
    restorationRecorded = true;
    return { modifiedCount: 1 };
  };

  assert.equal(await processExpiredBookingRequests(), 0);
  assert.equal(voucher.status, "active");
  assert.equal(restorationRecorded, true);
});

test("provider acceptance expires a pending request inside the 30-minute buffer", async () => {
  const bookingId = "64b000000000000000000021";
  const providerId = "64b000000000000000000022";
  const appointmentPhilippineTime = new Date(Date.now() + 20 * 60 * 1000 + 8 * 60 * 60 * 1000);
  appointmentPhilippineTime.setSeconds(0, 0);
  const appointmentHour = appointmentPhilippineTime.getUTCHours();
  const timeSlot = `${appointmentHour % 12 || 12}:${String(appointmentPhilippineTime.getUTCMinutes()).padStart(2, "0")} ${appointmentHour >= 12 ? "PM" : "AM"}`;
  const serviceDate = new Date(Date.UTC(
    appointmentPhilippineTime.getUTCFullYear(),
    appointmentPhilippineTime.getUTCMonth(),
    appointmentPhilippineTime.getUTCDate()
  ));
  const expiredBooking = { _id: bookingId, providerId, status: "expired" };
  let updateFilter;
  let updatePayload;
  let responseStatus;
  let responseBody;

  Booking.findOne = () => ({
    select: async () => ({
      serviceDate,
      timeSlot,
      requestExpiresAt: null,
      requestExpiryType: "appointment_cutoff",
      travelDistanceKm: 0,
    }),
  });
  Booking.findOneAndUpdate = async (filter, update) => {
    updateFilter = filter;
    updatePayload = update;
    return expiredBooking;
  };

  const response = {
    status(status) {
      responseStatus = status;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };
  await handleUpdateBookingStatus(
    {
      params: { id: bookingId },
      body: { status: "approved" },
      user: { _id: providerId, role: "provider" },
    },
    response
  );

  assert.equal(responseStatus, 400);
  assert.equal(
    responseBody.message,
    "This booking request has expired because it is within 30 minutes of the scheduled time, leaving insufficient travel time."
  );
  assert.deepEqual(updateFilter.status.$in, ["pending", "Pending Request"]);
  assert.equal(updatePayload.$set.status, "expired");
  assert.match(updatePayload.$set.expirationReason, /30 minutes prior to appointment time/);
});

test("urgent same-day requests bypass the appointment cutoff while their response timer is active", async () => {
  const bookingId = "64b000000000000000000041";
  const providerId = "64b000000000000000000042";
  const appointmentPhilippineTime = new Date(Date.now() + 25 * 60 * 1000 + 8 * 60 * 60 * 1000);
  appointmentPhilippineTime.setSeconds(0, 0);
  const appointmentHour = appointmentPhilippineTime.getUTCHours();
  const timeSlot = `${appointmentHour % 12 || 12}:${String(appointmentPhilippineTime.getUTCMinutes()).padStart(2, "0")} ${appointmentHour >= 12 ? "PM" : "AM"}`;
  const serviceDate = new Date(Date.UTC(
    appointmentPhilippineTime.getUTCFullYear(),
    appointmentPhilippineTime.getUTCMonth(),
    appointmentPhilippineTime.getUTCDate()
  ));
  let statusUpdateAttempted = false;
  let responseStatus;
  let responseBody;

  Booking.findOne = () => ({
    select: async () => ({
      serviceDate,
      timeSlot,
      requestExpiresAt: new Date(appointmentPhilippineTime.getTime() - 10 * 60 * 1000),
      requestExpiryType: "urgent_same_day",
      createdAt: new Date(),
      travelDistanceKm: 1000,
    }),
  });
  Booking.find = () => ({
    select: () => ({ lean: async () => [] }),
  });
  Booking.findOneAndUpdate = async () => {
    statusUpdateAttempted = true;
    throw new Error("Travel-time validation should stop this test before updating status.");
  };

  const response = {
    status(status) {
      responseStatus = status;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };
  await handleUpdateBookingStatus(
    {
      params: { id: bookingId },
      body: { status: "approved" },
      user: { _id: providerId, role: "provider" },
    },
    response
  );

  assert.equal(responseStatus, 409);
  assert.equal(responseBody.message, "Arrival time missed—please request a schedule adjustment");
  assert.equal(statusUpdateAttempted, false);
});

test("expiry processing only selects pending requests for expiry", async () => {
  Booking.find = (filter) => {
    assert.deepEqual(filter.$or[0].status.$in, ["pending", "Pending Request"]);
    return { select: async () => [] };
  };
  Booking.findOneAndUpdate = async () => {
    throw new Error("No pending booking was selected for expiry.");
  };

  assert.equal(await processExpiredBookingRequests(), 0);
});

test("a same-day advance request is not expired by its legacy 15-minute timer", async () => {
  const philippineToday = new Date(Date.now() + 8 * 60 * 60 * 1000);
  philippineToday.setUTCHours(0, 0, 0, 0);
  const submittedAt = new Date(philippineToday);
  submittedAt.setUTCHours(8, 0, 0, 0);
  let expiryUpdateAttempted = false;

  Booking.find = () => ({
    select: async () => [{
      _id: "64b000000000000000000031",
      status: "pending",
      serviceDate: philippineToday,
      timeSlot: "6:00 PM",
      createdAt: submittedAt,
      requestExpiresAt: new Date(submittedAt.getTime() + 15 * 60 * 1000),
      requestExpiryType: undefined,
    }],
  });
  Booking.findOneAndUpdate = async () => {
    expiryUpdateAttempted = true;
    throw new Error("Advance bookings stay pending until the appointment cutoff.");
  };

  assert.equal(await processExpiredBookingRequests(), 0);
  assert.equal(expiryUpdateAttempted, false);
});

test("a same-day advance request expires at its appointment cutoff despite its legacy timer", async () => {
  const bookingId = "64b000000000000000000051";
  const serviceDate = new Date("2026-10-03T00:00:00.000Z");
  const createdAt = new Date("2026-10-03T00:00:00.000Z");
  const candidate = {
    _id: bookingId,
    status: "pending",
    serviceDate,
    timeSlot: "3:00 PM",
    createdAt,
    requestExpiresAt: new Date("2026-10-03T00:15:00.000Z"),
    requestExpiryType: undefined,
  };
  const fixedNow = new Date("2026-10-03T06:45:00.000Z");
  let updatePayload;

  Booking.find = () => ({
    select: async () => [candidate],
  });
  Booking.findOneAndUpdate = async (filter, update) => {
    assert.equal(String(filter._id), bookingId);
    updatePayload = update;
    return { _id: bookingId, status: "expired" };
  };

  assert.equal(await processExpiredBookingRequests(fixedNow), 1);
  assert.equal(updatePayload.$set.expiredAt.getTime(), fixedNow.getTime());
  assert.match(updatePayload.$set.expirationReason, /30 minutes prior to appointment time/);
});
