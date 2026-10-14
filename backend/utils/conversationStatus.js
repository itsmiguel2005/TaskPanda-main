const ACTIVE_BOOKING_STATUSES = new Set([
  "pending",
  "approved",
  "en_route",
  "in_progress",
  "in_revision",
  "disputed",
  "refund_pending",
  "refund_repayment_pending",
  "refund_repayment_reported",
  "refund_repayment_overdue",
  "cancel_requested",
]);

const ARCHIVED_BOOKING_STATUSES = new Set([
  "settled",
  "complete",
  "closed",
  "canceled",
  "provider_no_show",
  "declined",
  "expired",
  "refunded",
  "partially_refunded",
]);

const BOOKING_STATUS_ALIASES = Object.freeze({
  "pending request": "pending",
  confirmed: "approved",
  "on the way": "en_route",
  "in progress": "in_progress",
  "in revision": "in_revision",
  "cancellation requested": "cancel_requested",
  cancelled: "canceled",
  "cancelled - provider no-show": "provider_no_show",
  "canceled - provider no-show": "provider_no_show",
  rejected: "declined",
  "declined by provider": "declined",
  completed: "complete",
  "refund under review": "refund_pending",
  "repayment pending": "refund_repayment_pending",
  "repayment reported": "refund_repayment_reported",
  "repayment overdue": "refund_repayment_overdue",
});

function normalizeBookingStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return BOOKING_STATUS_ALIASES[status] || status;
}

function getConversationStatusGroup(value) {
  const status = normalizeBookingStatus(value);
  if (ACTIVE_BOOKING_STATUSES.has(status)) return "active";
  if (ARCHIVED_BOOKING_STATUSES.has(status)) return "archived";
  return null;
}

module.exports = {
  ACTIVE_BOOKING_STATUSES,
  ARCHIVED_BOOKING_STATUSES,
  normalizeBookingStatus,
  getConversationStatusGroup,
};
