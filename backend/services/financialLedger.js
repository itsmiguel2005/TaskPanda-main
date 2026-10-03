function getTransactionAmounts(booking) {
  const grossTaskValue = Number(booking.offeredPrice || 0);
  const providerLaborEarnings = grossTaskValue;
  const travelFee = Number(booking.travelFeeBeforeDiscount ?? booking.travelFee ?? 0);
  const voucherDeduction = Number(booking.travelFeeDiscount || 0);
  const netTravelFee = Number(booking.travelFee ?? Math.max(0, travelFee - voucherDeduction));
  const tip = Number(booking.tipAmount || 0);

  return {
    grossTaskValue,
    providerLaborEarnings,
    travelFee,
    voucherDeduction,
    netTravelFee,
    tip,
    providerTotalEarnings: providerLaborEarnings + tip,
    clientPaidTotal: grossTaskValue + netTravelFee + tip,
  };
}

module.exports = { getTransactionAmounts };
