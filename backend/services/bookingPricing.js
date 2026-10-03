const EARTH_RADIUS_KM = 6371.0088;

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

function calculateTravelFare(distanceKm) {
  const distance = Number(distanceKm);
  if (!Number.isFinite(distance) || distance < 0) {
    throw new TypeError("Travel distance must be a non-negative number.");
  }

  return roundCurrency(20 + Math.max(0, distance - 2) * 10);
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

module.exports = {
  calculateDistanceKm,
  calculateTravelFare,
  calculateTravelFeeDiscount,
  calculateTotalPrice,
};