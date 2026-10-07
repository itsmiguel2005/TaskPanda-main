const SAME_DAY_REQUEST_TTL_MS = 15 * 60 * 1000;
const PH_TIMEZONE_OFFSET_MINUTES = 8 * 60;
const ESTIMATED_TRAVEL_SPEED_KMH = 30;
const TRAVEL_BUFFER_MINUTES = 15;
const SCHEDULE_BUFFER_MINUTES = 30;
const DEFAULT_ESTIMATED_DURATION_MINUTES = 60;
const MIN_ESTIMATED_DURATION_MINUTES = 15;
const MAX_ESTIMATED_DURATION_MINUTES = 720;

function getServiceDayParts(serviceDate) {
  const date = new Date(serviceDate);
  if (Number.isNaN(date.getTime())) return null;
  return [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()];
}

function isSamePhilippineCalendarDay(serviceDate, now = new Date()) {
  const serviceDay = getServiceDayParts(serviceDate);
  const philippinesNow = new Date(now.getTime() + PH_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  if (!serviceDay) return false;
  return serviceDay[0] === philippinesNow.getUTCFullYear()
    && serviceDay[1] === philippinesNow.getUTCMonth()
    && serviceDay[2] === philippinesNow.getUTCDate();
}

function getScheduledServiceTime(serviceDate, timeSlot) {
  const serviceDay = getServiceDayParts(serviceDate);
  const match = String(timeSlot || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!serviceDay || !match) return null;

  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  const minutes = Number(match[2]);
  return new Date(Date.UTC(
    serviceDay[0],
    serviceDay[1],
    serviceDay[2],
    hours - PH_TIMEZONE_OFFSET_MINUTES / 60,
    minutes
  ));
}

function isValidEstimatedDurationMinutes(value) {
  const duration = Number(value);
  return Number.isInteger(duration)
    && duration >= MIN_ESTIMATED_DURATION_MINUTES
    && duration <= MAX_ESTIMATED_DURATION_MINUTES
    && duration % MIN_ESTIMATED_DURATION_MINUTES === 0;
}

function getEstimatedDurationMinutes(value) {
  const duration = Number(value);
  return isValidEstimatedDurationMinutes(duration) ? duration : DEFAULT_ESTIMATED_DURATION_MINUTES;
}

function getBookingOccupiedWindow(booking) {
  const startAt = getScheduledServiceTime(booking?.serviceDate, booking?.timeSlot || booking?.time);
  if (!startAt) return null;
  const durationMinutes = getEstimatedDurationMinutes(
    booking?.estimatedDurationMinutes ?? booking?.counterOfferDurationMinutes
  );
  return {
    startAt,
    endAt: new Date(startAt.getTime() + (durationMinutes + SCHEDULE_BUFFER_MINUTES) * 60 * 1000),
    durationMinutes,
  };
}

function hasScheduleConflict(candidate, existingBookings = [], excludeBookingId = "") {
  const candidateWindow = getBookingOccupiedWindow(candidate);
  if (!candidateWindow) return true;
  return existingBookings.some((booking) => {
    if (excludeBookingId && String(booking?._id || booking?.id || "") === String(excludeBookingId)) return false;
    const existingWindow = getBookingOccupiedWindow(booking);
    return existingWindow
      && candidateWindow.startAt < existingWindow.endAt
      && existingWindow.startAt < candidateWindow.endAt;
  });
}

function getEstimatedTravelDurationMinutes(distanceKm) {
  if (distanceKm == null || String(distanceKm).trim() === "") return null;
  const distance = Number(distanceKm);
  if (!Number.isFinite(distance) || distance < 0) return null;
  return Math.ceil((distance / ESTIMATED_TRAVEL_SPEED_KMH) * 60) + TRAVEL_BUFFER_MINUTES;
}

function canArriveForSameDayBooking(serviceDate, timeSlot, distanceKm, now = new Date()) {
  if (!isSamePhilippineCalendarDay(serviceDate, now)) return true;
  const scheduledTime = getScheduledServiceTime(serviceDate, timeSlot);
  const travelDurationMinutes = getEstimatedTravelDurationMinutes(distanceKm);
  if (!scheduledTime || travelDurationMinutes == null) return false;
  return now.getTime() + travelDurationMinutes * 60 * 1000 <= scheduledTime.getTime();
}

function getBookingRequestExpiration(serviceDate, submittedAt = new Date()) {
  if (!isSamePhilippineCalendarDay(serviceDate, submittedAt)) return null;
  return new Date(submittedAt.getTime() + SAME_DAY_REQUEST_TTL_MS);
}

module.exports = {
  SAME_DAY_REQUEST_TTL_MS,
  DEFAULT_ESTIMATED_DURATION_MINUTES,
  MAX_ESTIMATED_DURATION_MINUTES,
  MIN_ESTIMATED_DURATION_MINUTES,
  SCHEDULE_BUFFER_MINUTES,
  canArriveForSameDayBooking,
  getBookingOccupiedWindow,
  getEstimatedDurationMinutes,
  getBookingRequestExpiration,
  getEstimatedTravelDurationMinutes,
  getScheduledServiceTime,
  hasScheduleConflict,
  isValidEstimatedDurationMinutes,
  isSamePhilippineCalendarDay,
};
