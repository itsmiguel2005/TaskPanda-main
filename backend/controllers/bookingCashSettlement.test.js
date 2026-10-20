const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { processCashSettlementFallbacks } = require("./bookingController");

const originalCollection = mongoose.connection.collection;
const originalFindOneAndUpdate = Booking.findOneAndUpdate;

test.afterEach(() => {
  mongoose.connection.collection = originalCollection;
  Booking.findOneAndUpdate = originalFindOneAndUpdate;
});

test("cash settlement update only applies while scanned eligibility still matches", async () => {
  const bookingId = new mongoose.Types.ObjectId();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  let updateFilter;
  let scanFilter;

  mongoose.connection.collection = (name) => {
    assert.equal(name, "bookings");
    return {
      find: (filter) => {
        scanFilter = filter;
        return {
          toArray: async () => [{
            _id: bookingId,
            status: "complete",
            paymentMethod: "cash",
            workCompletedAt: new Date(cutoff.getTime() - 1),
            clientConfirmedCash: true,
            providerConfirmedCash: false,
          }],
        };
      },
    };
  };
  Booking.findOneAndUpdate = async (filter) => {
    updateFilter = filter;
    // A concurrent refund_pending transition makes the conditional update a miss.
    return null;
  };

  await processCashSettlementFallbacks();

  assert.equal(scanFilter.status, "complete");
  assert.equal(scanFilter.paymentMethod, "cash");
  assert.equal(updateFilter._id, bookingId);
  assert.equal(updateFilter.status, "complete");
  assert.equal(updateFilter.paymentMethod, "cash");
  assert.deepEqual(updateFilter.workCompletedAt, scanFilter.workCompletedAt);
  assert.deepEqual(updateFilter.$or, scanFilter.$or);
});
