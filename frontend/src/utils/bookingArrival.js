const PH_TIMEZONE_OFFSET_MINUTES = 8 * 60;
const ESTIMATED_TRAVEL_SPEED_KMH = 30;
const TRAVEL_BUFFER_MINUTES = 15;

export function isSamePhilippineCalendarDay(serviceDate, now = new Date()) {
  const serviceDay = new Date(serviceDate);
  if (Number.isNaN(serviceDay.getTime())) return false;
  const philippinesNow = new Date(now.getTime() + PH_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  return serviceDay.getUTCFullYear() === philippinesNow.getUTCFullYear()
    && serviceDay.getUTCMonth() === philippinesNow.getUTCMonth()
    && serviceDay.getUTCDate() === philippinesNow.getUTCDate();
}

export function getEstimatedTravelDurationMinutes(distanceKm) {
  if (distanceKm == null || String(distanceKm).trim() === "") return null;
  const distance = Number(distanceKm);
  if (!Number.isFinite(distance) || distance < 0) return null;
  return Math.ceil((distance / ESTIMATED_TRAVEL_SPEED_KMH) * 60) + TRAVEL_BUFFER_MINUTES;
}

export function canArriveForSameDayBooking(booking, now = new Date()) {
  if (!isSamePhilippineCalendarDay(booking?.serviceDate, now)) return true;
  const date = new Date(booking.serviceDate);
  const match = String(booking.timeSlot || booking.time || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  const travelDurationMinutes = getEstimatedTravelDurationMinutes(booking.travelDistanceKm);
  if (Number.isNaN(date.getTime()) || !match || travelDurationMinutes == null) return false;

  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  const scheduledTime = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hours - PH_TIMEZONE_OFFSET_MINUTES / 60,
    Number(match[2])
  );
  return now.getTime() + travelDurationMinutes * 60 * 1000 <= scheduledTime;
}
