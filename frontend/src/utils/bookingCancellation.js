const STATUS_ALIASES = {
  "pending request": "pending",
  confirmed: "approved",
  "on the way": "en_route",
  "in progress": "in_progress",
  completed: "complete",
};

function getStatus(bookingOrStatus) {
  const value = bookingOrStatus && typeof bookingOrStatus === "object"
    ? bookingOrStatus.statusCode || bookingOrStatus.bookingStatus || bookingOrStatus.status
    : bookingOrStatus;
  const status = String(value || "").trim().toLowerCase();
  return STATUS_ALIASES[status] || status;
}

export function canRequestCancellation(bookingOrStatus) {
  return ["pending", "approved"].includes(getStatus(bookingOrStatus));
}

export function requiresCancellationApproval(booking) {
  const createdAt = new Date(booking?.createdAt || 0).getTime();
  return Number.isFinite(createdAt) && Date.now() - createdAt >= 10 * 60 * 1000;
}

export function getCancellationLockMessage(bookingOrStatus) {
  const status = getStatus(bookingOrStatus);
  if (status === "en_route") return "Cancellation locked: The provider is already on the way.";
  if (status === "in_progress") return "Cancellation locked: The provider has started the task.";
  if (status === "complete") return "Cancellation unavailable: The task is complete.";
  return "";
}