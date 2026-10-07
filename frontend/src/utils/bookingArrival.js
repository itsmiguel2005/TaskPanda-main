const PH_TIMEZONE_OFFSET_MINUTES = 8 * 60;
const ESTIMATED_TRAVEL_SPEED_KMH = 30;
const TRAVEL_BUFFER_MINUTES = 15;
const SCHEDULE_BUFFER_MINUTES = 30;
const DEFAULT_ESTIMATED_DURATION_MINUTES = 60;

function getAppointmentStart(serviceDate, timeSlot) {
  const date = new Date(serviceDate);
  const match = String(timeSlot || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (Number.isNaN(date.getTime()) || !match) return null;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hours - PH_TIMEZONE_OFFSET_MINUTES / 60,
    Number(match[2])
  ));
}

export function getBookingOccupiedWindow(booking) {
  const startAt = booking?.startAt ? new Date(booking.startAt) : getAppointmentStart(
    booking?.serviceDate,
    booking?.timeSlot || booking?.time
  );
  if (!startAt || Number.isNaN(startAt.getTime())) return null;
  const duration = Number(booking?.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES);
  const durationMinutes = Number.isInteger(duration) && duration > 0 ? duration : DEFAULT_ESTIMATED_DURATION_MINUTES;
  const occupiedUntil = booking?.occupiedUntil ? new Date(booking.occupiedUntil) : new Date(
    startAt.getTime() + (durationMinutes + SCHEDULE_BUFFER_MINUTES) * 60 * 1000
  );
  if (Number.isNaN(occupiedUntil.getTime())) return null;
  return { startAt, occupiedUntil };
}

export function hasScheduleConflict(candidate, existingBookings = [], excludeBookingId = "") {
  const candidateWindow = getBookingOccupiedWindow(candidate);
  if (!candidateWindow) return true;
  return existingBookings.some((booking) => {
    if (excludeBookingId && String(booking?.id || booking?._id || "") === String(excludeBookingId)) return false;
    const existingWindow = getBookingOccupiedWindow(booking);
    return existingWindow
      && candidateWindow.startAt < existingWindow.occupiedUntil
      && existingWindow.startAt < candidateWindow.occupiedUntil;
  });
}

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

export function canArriveForSameDayBooking(booking, now = new Date(), existingBookings = []) {
  if (isSamePhilippineCalendarDay(booking?.serviceDate, now)) {
    const scheduledTime = getAppointmentStart(booking?.serviceDate, booking?.timeSlot || booking?.time);
    const travelDurationMinutes = getEstimatedTravelDurationMinutes(booking?.travelDistanceKm);
    if (!scheduledTime || travelDurationMinutes == null) return false;
    if (now.getTime() + travelDurationMinutes * 60 * 1000 > scheduledTime.getTime()) return false;
  }
  return !hasScheduleConflict(booking, existingBookings, booking?.id || booking?._id);
}
