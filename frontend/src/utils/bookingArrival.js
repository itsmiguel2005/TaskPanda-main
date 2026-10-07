const PH_TIMEZONE_OFFSET_MINUTES = 8 * 60;
const ESTIMATED_TRAVEL_SPEED_KMH = 30;
const TRAVEL_BUFFER_MINUTES = 15;
const SCHEDULE_BUFFER_MINUTES = 30;
const DEFAULT_ESTIMATED_DURATION_MINUTES = 60;
const EARTH_RADIUS_KM = 6371.0088;

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

function getLocationCoordinates(location) {
  const coordinates = location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  const [longitude, latitude] = coordinates.map(Number);
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180
    || !Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
  return [longitude, latitude];
}

function getInterBookingTravelDurationMinutes(fromLocation, toLocation) {
  const from = getLocationCoordinates(fromLocation);
  const to = getLocationCoordinates(toLocation);
  if (!from || !to) return 0;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to[1] - from[1]);
  const longitudeDelta = toRadians(to[0] - from[0]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(from[1])) * Math.cos(toRadians(to[1]))
      * Math.sin(longitudeDelta / 2) ** 2;
  const distanceKm = 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, haversine)));
  return Math.ceil((distanceKm / ESTIMATED_TRAVEL_SPEED_KMH) * 60);
}

export function hasScheduleConflict(candidate, existingBookings = [], excludeBookingId = "") {
  const candidateWindow = getBookingOccupiedWindow(candidate);
  if (!candidateWindow) return true;
  const candidateDuration = Number(candidate?.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES);
  return existingBookings.some((booking) => {
    if (excludeBookingId && String(booking?.id || booking?._id || "") === String(excludeBookingId)) return false;
    const existingWindow = getBookingOccupiedWindow(booking);
    if (!existingWindow) return false;

    const isCandidateFirst = candidateWindow.startAt <= existingWindow.startAt;
    const firstStart = isCandidateFirst ? candidateWindow.startAt : existingWindow.startAt;
    const firstDuration = isCandidateFirst ? candidateDuration : Number(
      booking?.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES
    );
    const firstLocation = isCandidateFirst ? candidate?.serviceGeoLocation : booking?.serviceGeoLocation;
    const nextStart = isCandidateFirst ? existingWindow.startAt : candidateWindow.startAt;
    const nextLocation = isCandidateFirst ? booking?.serviceGeoLocation : candidate?.serviceGeoLocation;
    const requiredGapMinutes = firstDuration
      + getInterBookingTravelDurationMinutes(firstLocation, nextLocation)
      + SCHEDULE_BUFFER_MINUTES;
    return firstStart.getTime() + requiredGapMinutes * 60 * 1000 > nextStart.getTime();
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
