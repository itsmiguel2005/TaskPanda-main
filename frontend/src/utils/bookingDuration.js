export const DEFAULT_ESTIMATED_DURATION_MINUTES = 60;

export function formatEstimatedDuration(value) {
  const duration = Number(value);
  const minutes = Number.isInteger(duration) && duration >= 0
    ? duration
    : DEFAULT_ESTIMATED_DURATION_MINUTES;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const parts = [];

  if (hours > 0) parts.push(`${hours} hr${hours === 1 ? "" : "s"}`);
  if (remainingMinutes > 0 || hours === 0) parts.push(`${remainingMinutes} min`);
  return parts.join(" ");
}
