const assert = require("node:assert/strict");
const test = require("node:test");
require("../db");
const Booking = require("../models/Booking");
const { completedDateFilter } = require("./adminOperationsController");

function assertTrustedDateRange(range, expected) {
  for (const [operator, date] of Object.entries(expected)) {
    assert.equal(range[operator].toISOString(), date.toISOString());
  }
  assert.ok(Object.getOwnPropertySymbols(range).some((symbol) => symbol.toString().includes("trustedSymbol")));
}

test("transaction date filter applies an inclusive UTC date range to completion timestamps", () => {
  const filter = completedDateFilter("2026-10-01", "2026-10-10");
  const fields = ["settledAt", "workCompletedAt", "completionSubmittedAt", "updatedAt", "createdAt"];

  assert.equal(filter.$or.length, fields.length);
  for (const [index, field] of fields.entries()) {
    assert.deepEqual(Object.keys(filter.$or[index]), [field]);
    assertTrustedDateRange(filter.$or[index][field], {
      $gte: new Date("2026-10-01T00:00:00.000Z"),
      $lte: new Date("2026-10-10T23:59:59.999Z"),
    });
  }
});

test("transaction date filter supports either date boundary and no-filter requests", () => {
  const fromOnly = completedDateFilter("2026-10-01", "");
  assertTrustedDateRange(fromOnly.$or[0].settledAt, {
    $gte: new Date("2026-10-01T00:00:00.000Z"),
  });

  const toOnly = completedDateFilter("", "2026-10-10");
  assertTrustedDateRange(toOnly.$or[0].settledAt, {
    $lte: new Date("2026-10-10T23:59:59.999Z"),
  });

  assert.equal(completedDateFilter("", ""), null);
});

test("transaction date filter casts cleanly with MongoDB filter sanitization enabled", () => {
  const filter = completedDateFilter("2026-10-01", "2026-10-10");
  assert.doesNotThrow(() => Booking.find({ status: "settled", ...filter }).cast(Booking));
});
