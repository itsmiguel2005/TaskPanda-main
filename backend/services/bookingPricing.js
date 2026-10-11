const EARTH_RADIUS_KM = 6371.0088;
const BASELINE_TASK_OFFER_DURATION_MINUTES = 60;
const DEFAULT_TRAVEL_BASE_FEE = 20;
const BASE_FARE_DISTANCE_KM = 2;
const {
  maxTaskOfferPhp: MAX_TASK_OFFER_PHP,
  maxTipPhp: MAX_TIP_PHP,
  maxBookingTransactionPhp: MAX_BOOKING_TRANSACTION_PHP,
} = require("../../shared/bookingLimits.json");

function calculateDistanceKm(originCoordinates, destinationCoordinates) {
  if (!Array.isArray(originCoordinates) || !Array.isArray(destinationCoordinates)) return null;
  if (originCoordinates.length !== 2 || destinationCoordinates.length !== 2) return null;

  const [originLongitude, originLatitude] = originCoordinates.map(Number);
  const [destinationLongitude, destinationLatitude] = destinationCoordinates.map(Number);
  const coordinates = [originLongitude, originLatitude, destinationLongitude, destinationLatitude];
  if (!coordinates.every(Number.isFinite)) return null;
  if (Math.abs(originLongitude) > 180 || Math.abs(destinationLongitude) > 180) return null;
  if (Math.abs(originLatitude) > 90 || Math.abs(destinationLatitude) > 90) return null;

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(destinationLatitude - originLatitude);
  const longitudeDelta = toRadians(destinationLongitude - originLongitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(originLatitude)) *
      Math.cos(toRadians(destinationLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

function roundCurrency(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function calculateDurationAdjustedTaskOffer(offerFor60Minutes, durationMinutes) {
  const offer = Number(offerFor60Minutes);
  const duration = Number(durationMinutes);
  if (!Number.isFinite(offer) || offer < 0) {
    throw new TypeError("Task offer must be a non-negative number.");
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new TypeError("Task duration must be a positive number of minutes.");
  }
  return roundCurrency((offer * duration) / BASELINE_TASK_OFFER_DURATION_MINUTES);
}

function calculateTravelFare(
  distanceKm,
  {
    baseFee = DEFAULT_TRAVEL_BASE_FEE,
    baseFareDistanceKm = BASE_FARE_DISTANCE_KM,
    feePerKm = 10,
  } = {}
) {
  const distance = Number(distanceKm);
  if (!Number.isFinite(distance) || distance < 0) {
    throw new TypeError("Travel distance must be a non-negative number.");
  }
  const base = Number(baseFee);
  const baseFareDistance = Number(baseFareDistanceKm);
  const perKilometer = Number(feePerKm);
  if (
    !Number.isFinite(base) || base < 0 ||
    !Number.isFinite(baseFareDistance) || baseFareDistance < 0 ||
    !Number.isFinite(perKilometer) || perKilometer < 0
  ) {
    throw new TypeError("Travel fee rates must be non-negative numbers.");
  }

  return roundCurrency(base + Math.max(0, distance - baseFareDistance) * perKilometer);
}

function calculateTravelFeeDiscount(travelFare, voucherAmount) {
  const fare = Number(travelFare);
  const voucherValue = Number(voucherAmount);
  if (!Number.isFinite(fare) || fare < 0) {
    throw new TypeError("Travel fare must be a non-negative number.");
  }
  if (!Number.isFinite(voucherValue) || voucherValue < 0) {
    throw new TypeError("Voucher amount must be a non-negative number.");
  }
  return roundCurrency(Math.min(fare, voucherValue));
}

function calculateTotalPrice(taskOffer, travelFare, tipAmount = 0) {
  return roundCurrency(Number(taskOffer) + Number(travelFare) + Number(tipAmount));
}

function areBookingAmountsWithinLimits(taskOffer, tipAmount = 0) {
  const offer = Number(taskOffer);
  const tip = Number(tipAmount);
  return Number.isFinite(offer)
    && offer >= 0
    && offer <= MAX_TASK_OFFER_PHP
    && Number.isFinite(tip)
    && tip >= 0
    && tip <= MAX_TIP_PHP;
}

function isBookingTransactionWithinLimit(taskOffer, travelFare, tipAmount = 0) {
  return calculateTotalPrice(taskOffer, travelFare, tipAmount) <= MAX_BOOKING_TRANSACTION_PHP;
}

module.exports = {
  calculateDistanceKm,
  BASELINE_TASK_OFFER_DURATION_MINUTES,
  DEFAULT_TRAVEL_BASE_FEE,
  BASE_FARE_DISTANCE_KM,
  MAX_TASK_OFFER_PHP,
  MAX_TIP_PHP,
  MAX_BOOKING_TRANSACTION_PHP,
  calculateDurationAdjustedTaskOffer,
  calculateTravelFare,
  calculateTravelFeeDiscount,
  calculateTotalPrice,
  areBookingAmountsWithinLimits,
  isBookingTransactionWithinLimit,
};