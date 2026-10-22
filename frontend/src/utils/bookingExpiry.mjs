const PH_TIMEZONE_OFFSET_HOURS = 8;
const SAME_DAY_REQUEST_TTL_MS = 15 * 60 * 1000;
const APPOINTMENT_REQUEST_EXPIRY_BUFFER_MS = 30 * 60 * 1000;

function getScheduledAppointmentTime(serviceDate, timeSlot) {
  const serviceDay = new Date(serviceDate);
  const match = String(timeSlot || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (Number.isNaN(serviceDay.getTime()) || !match) return null;

  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  const minutes = Number(match[2]);
  if (minutes > 59 || Number(match[1]) < 1 || Number(match[1]) > 12) return null;

  return new Date(Date.UTC(
    serviceDay.getUTCFullYear(),
    serviceDay.getUTCMonth(),
    serviceDay.getUTCDate(),
    hours - PH_TIMEZONE_OFFSET_HOURS,
    minutes
  ));
}

function isSamePhilippineDay(serviceDate, timestamp) {
  const serviceDay = new Date(serviceDate);
  const localDay = new Date(timestamp.getTime() + PH_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000);
  return !Number.isNaN(serviceDay.getTime())
    && serviceDay.getUTCFullYear() === localDay.getUTCFullYear()
    && serviceDay.getUTCMonth() === localDay.getUTCMonth()
    && serviceDay.getUTCDate() === localDay.getUTCDate();
}

export function getBookingRequestExpiryDetails(booking) {
  if (!booking) return { type: "", deadline: null };

  const storedDeadline = booking.requestExpiresAt ? new Date(booking.requestExpiresAt) : null;
  const validStoredDeadline = storedDeadline && !Number.isNaN(storedDeadline.getTime())
    ? storedDeadline
    : null;
  const submittedAt = booking.createdAt ? new Date(booking.createdAt) : null;
  const validSubmittedAt = submittedAt && !Number.isNaN(submittedAt.getTime())
    ? submittedAt
    : null;
  const scheduledTime = getScheduledAppointmentTime(
    booking.serviceDate || booking.date,
    booking.timeSlot || booking.time
  );

  if (!scheduledTime) {
    return { type: booking.requestExpiryType || "", deadline: validStoredDeadline, sameDay: false };
  }

  const sameDay = Boolean(validSubmittedAt
    && isSamePhilippineDay(booking.serviceDate || booking.date, validSubmittedAt));
  const calculatedType = sameDay
    && scheduledTime.getTime() > validSubmittedAt.getTime()
    && scheduledTime.getTime() - validSubmittedAt.getTime() <= APPOINTMENT_REQUEST_EXPIRY_BUFFER_MS
    ? "urgent_same_day"
    : "appointment_cutoff";
  const type = ["urgent_same_day", "appointment_cutoff"].includes(booking.requestExpiryType)
    ? booking.requestExpiryType
    : calculatedType;

  if (type === "urgent_same_day") {
    if (!validSubmittedAt) return { type, deadline: validStoredDeadline, sameDay };
    const responseDeadline = new Date(validSubmittedAt.getTime() + SAME_DAY_REQUEST_TTL_MS);
    return {
      type,
      deadline: scheduledTime < responseDeadline ? scheduledTime : responseDeadline,
      sameDay,
    };
  }

  return {
    type,
    deadline: new Date(scheduledTime.getTime() - APPOINTMENT_REQUEST_EXPIRY_BUFFER_MS),
    sameDay,
  };
}

export function formatBookingRequestCountdown(seconds) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatBookingRequestDeadline(deadline, includeDate = false) {
  if (!deadline || Number.isNaN(new Date(deadline).getTime())) return "";
  return new Date(deadline).toLocaleString("en-PH", includeDate
    ? { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }
    : { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}
