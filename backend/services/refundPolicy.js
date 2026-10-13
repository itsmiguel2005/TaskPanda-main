const REFUND_WINDOW_MS = 48 * 60 * 60 * 1000;

function isRefundableBookingStatus(status) {
  return ["complete", "closed", "settled", "disputed"].includes(String(status || "").toLowerCase());
}

function getRefundDeadline(booking) {
  const completedAt = new Date(booking?.workCompletedAt || booking?.completionSubmittedAt || NaN);
  return Number.isNaN(completedAt.getTime()) ? null : new Date(completedAt.getTime() + REFUND_WINDOW_MS);
}

function isWithinRefundWindow(booking, now = new Date()) {
  const deadline = getRefundDeadline(booking);
  return Boolean(deadline && now.getTime() <= deadline.getTime());
}

function wasCashPaidManuallyConfirmed(booking) {
  const cashPaidConfirmed = Boolean(booking?.cashPaidConfirmedAt || booking?.clientConfirmedCash);
  if (!cashPaidConfirmed || booking?.cashPaidAutoConfirmed === true) return false;
  if (booking?.cashPaidAutoConfirmed === false) return true;
  if (booking?.cashReceipt?.receiptNumber) return true;

  const paidAt = new Date(booking?.cashPaidConfirmedAt || NaN);
  const settledAt = new Date(booking?.settledAt || NaN);
  return !(Number.isFinite(paidAt.getTime())
    && Number.isFinite(settledAt.getTime())
    && paidAt.getTime() === settledAt.getTime());
}

function isCurrencyAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    && amount >= 0
    && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-7;
}

function resolveRefundDecision({ action, requestedCashAmount, approvedCashAmount }) {
  const requested = Number(requestedCashAmount);
  const approved = Number(approvedCashAmount);
  if (!isCurrencyAmount(requested) || !isCurrencyAmount(approved)) {
    return { valid: false, message: "Refund amounts must be non-negative currency amounts with no more than two decimal places." };
  }
  if (action === "APPROVE_FULL") {
    if (approved !== requested) {
      return { valid: false, message: "A full approval must approve the complete requested cash amount." };
    }
    return { valid: true, outcome: "refunded" };
  }
  if (action === "APPROVE_PARTIAL") {
    if (approved >= requested) {
      return { valid: false, message: "A partial approval must be less than the requested cash amount." };
    }
    return { valid: true, outcome: "partially_refunded" };
  }
  if (action === "REJECT") {
    return approved === 0
      ? { valid: true, outcome: "rejected" }
      : { valid: false, message: "A rejected request cannot approve a cash refund." };
  }
  return { valid: false, message: "Choose a valid refund resolution." };
}

module.exports = {
  REFUND_WINDOW_MS,
  getRefundDeadline,
  isRefundableBookingStatus,
  isWithinRefundWindow,
  wasCashPaidManuallyConfirmed,
  isCurrencyAmount,
  resolveRefundDecision,
};
