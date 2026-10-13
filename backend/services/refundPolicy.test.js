const test = require("node:test");
const assert = require("node:assert/strict");
const {
  REFUND_WINDOW_MS,
  getRefundDeadline,
  isRefundableBookingStatus,
  isWithinRefundWindow,
  wasCashPaidManuallyConfirmed,
  resolveRefundDecision,
} = require("./refundPolicy");

test("refund eligibility uses completion time and includes the 48-hour boundary", () => {
  const completedAt = new Date("2026-10-12T00:00:00.000Z");
  const booking = { status: "settled", workCompletedAt: completedAt };
  assert.equal(getRefundDeadline(booking).getTime(), completedAt.getTime() + REFUND_WINDOW_MS);
  assert.equal(isWithinRefundWindow(booking, new Date(completedAt.getTime() + REFUND_WINDOW_MS)), true);
  assert.equal(isWithinRefundWindow(booking, new Date(completedAt.getTime() + REFUND_WINDOW_MS + 1)), false);
});

test("refund eligibility accepts only completed, disputed, or settled lifecycle states", () => {
  for (const status of ["complete", "closed", "settled", "disputed"]) {
    assert.equal(isRefundableBookingStatus(status), true);
  }
  for (const status of ["pending", "refund_pending", "canceled", "provider_no_show", "in_progress"]) {
    assert.equal(isRefundableBookingStatus(status), false);
  }
});

test("automatic cash settlement is not treated as proof that cash changed hands", () => {
  const settledAt = new Date("2026-10-13T00:00:00.000Z");
  assert.equal(wasCashPaidManuallyConfirmed({
    clientConfirmedCash: true,
    cashPaidConfirmedAt: settledAt,
    cashPaidAutoConfirmed: true,
    settledAt,
  }), false);
  assert.equal(wasCashPaidManuallyConfirmed({
    clientConfirmedCash: true,
    cashPaidConfirmedAt: settledAt,
    settledAt,
  }), false);
  assert.equal(wasCashPaidManuallyConfirmed({
    clientConfirmedCash: true,
    cashPaidConfirmedAt: new Date(settledAt.getTime() - 1000),
    settledAt,
  }), true);
  assert.equal(wasCashPaidManuallyConfirmed({
    clientConfirmedCash: true,
    cashPaidConfirmedAt: settledAt,
    cashPaidAutoConfirmed: false,
    settledAt,
  }), true);
});

test("refund decisions distinguish full, partial, and rejected cash amounts", () => {
  assert.deepEqual(resolveRefundDecision({
    action: "APPROVE_FULL",
    requestedCashAmount: 300,
    approvedCashAmount: 300,
  }), { valid: true, outcome: "refunded" });
  assert.deepEqual(resolveRefundDecision({
    action: "APPROVE_PARTIAL",
    requestedCashAmount: 300,
    approvedCashAmount: 100,
  }), { valid: true, outcome: "partially_refunded" });
  assert.equal(resolveRefundDecision({
    action: "APPROVE_PARTIAL",
    requestedCashAmount: 0,
    approvedCashAmount: 0,
  }).valid, false);
  assert.equal(resolveRefundDecision({
    action: "REJECT",
    requestedCashAmount: 300,
    approvedCashAmount: 0,
  }).valid, true);
});
