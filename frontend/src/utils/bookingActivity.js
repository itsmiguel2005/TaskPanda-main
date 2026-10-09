function timestamp(value) {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestNestedTimestamp(items, fields) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((latest, item) => (
    Math.max(latest, ...fields.map((field) => timestamp(item?.[field])))
  ), 0);
}

const terminalStatuses = new Set([
  "cancelled",
  "cancelled - provider no-show",
  "canceled",
  "closed",
  "complete",
  "completed",
  "declined",
  "declined by provider",
  "expired",
  "provider_no_show",
  "settled",
]);

export function compareBookingStatusPriority(first, second) {
  const firstIsTerminal = terminalStatuses.has(String(first?.status || "").toLowerCase());
  const secondIsTerminal = terminalStatuses.has(String(second?.status || "").toLowerCase());
  return Number(firstIsTerminal) - Number(secondIsTerminal);
}

export function sortBookingsWithOngoingFirst(bookings, compareWithinGroup) {
  return [...bookings].sort((first, second) => (
    compareBookingStatusPriority(first, second)
    || compareWithinGroup(first, second)
  ));
}

export function getBookingActivityTimestamp(booking) {
  if (!booking) return 0;

  return Math.max(
    timestamp(booking.createdAt),
    timestamp(booking.updatedAt),
    timestamp(booking.cancellationRequestedAt),
    timestamp(booking.cancellationResolvedAt),
    timestamp(booking.completionSubmittedAt),
    timestamp(booking.workCompletedAt),
    timestamp(booking.settledAt),
    timestamp(booking.reviewedAt),
    timestamp(booking.cashPaidConfirmedAt),
    timestamp(booking.cashReceivedConfirmedAt),
    timestamp(booking.noShowCheckInAt),
    timestamp(booking.noShowCheckInSentAt),
    timestamp(booking.providerNoShowReportedAt),
    timestamp(booking.lateNotice?.notifiedAt),
    timestamp(booking.lateNotice?.respondedAt),
    latestNestedTimestamp(booking.statusHistory, ["at"]),
    latestNestedTimestamp(booking.providerUpdates, ["requestedAt", "respondedAt"]),
    latestNestedTimestamp(booking.revisionRequests, ["createdAt", "respondedAt", "addressedAt"]),
    latestNestedTimestamp(booking.counterOffers, ["createdAt", "respondedAt"]),
  );
}

export function compareBookingsByLatestActivity(first, second) {
  return compareBookingStatusPriority(first, second)
    || getBookingActivityTimestamp(second) - getBookingActivityTimestamp(first)
    || timestamp(second?.createdAt) - timestamp(first?.createdAt);
}
