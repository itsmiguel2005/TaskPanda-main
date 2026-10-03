const assert = require("node:assert/strict");
const test = require("node:test");
const { getTransactionAmounts } = require("./financialLedger");

test("voucher deductions reduce travel only and preserve provider labor and tip", () => {
  const amounts = getTransactionAmounts({
    offeredPrice: 1000,
    travelFeeBeforeDiscount: 75,
    travelFeeDiscount: 50,
    travelFee: 25,
    tipAmount: 20,
  });

  assert.equal(amounts.grossTaskValue, 1000);
  assert.equal(amounts.providerLaborEarnings, 1000);
  assert.equal(amounts.travelFee, 75);
  assert.equal(amounts.voucherDeduction, 50);
  assert.equal(amounts.netTravelFee, 25);
  assert.equal(amounts.tip, 20);
  assert.equal(amounts.providerTotalEarnings, 1020);
  assert.equal(amounts.clientPaidTotal, 1045);
});

test("legacy bookings without a pre-discount travel amount remain readable", () => {
  const amounts = getTransactionAmounts({
    offeredPrice: 400,
    travelFee: 40,
    travelFeeDiscount: 0,
  });
  assert.equal(amounts.travelFee, 40);
  assert.equal(amounts.netTravelFee, 40);
  assert.equal(amounts.providerLaborEarnings, 400);
});
