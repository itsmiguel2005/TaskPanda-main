function formatUTCDate(date) {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function dateWithYearOffset(date, yearOffset) {
  const year = date.getUTCFullYear() + yearOffset;
  const month = date.getUTCMonth();
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return formatUTCDate(new Date(Date.UTC(year, month, day)));
}

export function getProviderDateOfBirthBounds(today = new Date()) {
  const earliestDate = new Date(`${dateWithYearOffset(today, -121)}T00:00:00.000Z`);
  earliestDate.setUTCDate(earliestDate.getUTCDate() + 1);
  return {
    min: formatUTCDate(earliestDate),
    max: dateWithYearOffset(today, -18),
  };
}

export function isProviderDateOfBirthInRange(value, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { min, max } = getProviderDateOfBirthBounds(today);
  if (value < min || value > max) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && formatUTCDate(date) === value;
}
