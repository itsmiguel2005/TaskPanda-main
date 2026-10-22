const assert = require("node:assert/strict");
const test = require("node:test");
const Booking = require("../models/Booking");
const UserDashboardDismissal = require("../models/UserDashboardDismissal");
const { handleDismissDashboardBookings } = require("./bookingController");

const originalFind = Booking.find;
const originalBulkWrite = UserDashboardDismissal.bulkWrite;

test("clients can dismiss expired and refunded bookings from their dashboard", async () => {
  const bookingId = "507f1f77bcf86cd799439011";
  let query;
  let bulkWriteOperations;

  Booking.find = (filter) => {
    query = filter;
    return {
      select() {
        return {
          lean: async () => [{ _id: bookingId }],
        };
      },
    };
  };
  UserDashboardDismissal.bulkWrite = async (operations) => {
    bulkWriteOperations = operations;
  };

  try {
    const response = {
      statusCode: 200,
      status(statusCode) {
        this.statusCode = statusCode;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };

    await handleDismissDashboardBookings({
      body: { bookingIds: [bookingId] },
      user: { _id: "client-id", role: "client" },
    }, response);

    const eligibleStatuses = query.status.$in;
    for (const status of [
      "expired",
      "Expired",
      "refunded",
      "Refunded",
      "partially_refunded",
      "Partially Refunded",
    ]) {
      assert.ok(eligibleStatuses.includes(status), `${status} should be dismissible`);
    }
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.dismissedBookingIds, [bookingId]);
    assert.equal(bulkWriteOperations.length, 1);
  } finally {
    Booking.find = originalFind;
    UserDashboardDismissal.bulkWrite = originalBulkWrite;
  }
});

test("providers can dismiss refunded bookings from their dashboard", async () => {
  const bookingId = "507f1f77bcf86cd799439011";
  let query;

  Booking.find = (filter) => {
    query = filter;
    return {
      select() {
        return {
          lean: async () => [{ _id: bookingId }],
        };
      },
    };
  };
  UserDashboardDismissal.bulkWrite = async () => {};

  try {
    const response = {
      statusCode: 200,
      status(statusCode) {
        this.statusCode = statusCode;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };

    await handleDismissDashboardBookings({
      body: { bookingIds: [bookingId] },
      user: { _id: "provider-id", role: "provider" },
    }, response);

    const eligibleStatuses = query.status.$in;
    for (const status of ["refunded", "Refunded", "partially_refunded", "Partially Refunded"]) {
      assert.ok(eligibleStatuses.includes(status), `${status} should be dismissible by providers`);
    }
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.dismissedBookingIds, [bookingId]);
  } finally {
    Booking.find = originalFind;
    UserDashboardDismissal.bulkWrite = originalBulkWrite;
  }
});

test.after(() => {
  Booking.find = originalFind;
  UserDashboardDismissal.bulkWrite = originalBulkWrite;
});
