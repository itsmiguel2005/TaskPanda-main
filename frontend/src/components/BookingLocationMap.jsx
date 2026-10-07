import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const SERVICE_LOCATION_ICON = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function getCoordinates(geoLocation) {
  const coordinates = geoLocation?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180 || !Number.isFinite(latitude) || Math.abs(latitude) > 90) {
    return null;
  }
  return { latitude, longitude };
}

export default function BookingLocationMap({ address, serviceGeoLocation, className = "h-40" }) {
  const mapElementRef = useRef(null);
  const location = getCoordinates(serviceGeoLocation);
  const safeAddress = String(address || "").trim();

  useEffect(() => {
    const mapElement = mapElementRef.current;
    if (!mapElement || !location) return undefined;

    let map = null;
    let invalidateTimer = null;
    const initializeMap = () => {
      if (map || !mapElement.isConnected) return;
      map = L.map(mapElement, { scrollWheelZoom: false, tap: true })
        .setView([location.latitude, location.longitude], 16);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
      }).addTo(map);
      const popupContent = document.createElement("span");
      popupContent.textContent = safeAddress || "Pinned service location";
      L.marker([location.latitude, location.longitude], {
        icon: SERVICE_LOCATION_ICON,
        title: "Pinned service location",
        alt: "Pinned service location",
      }).addTo(map).bindPopup(popupContent);
      invalidateTimer = window.setTimeout(() => map?.invalidateSize(), 0);
    };

    const observer = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          initializeMap();
          observer.disconnect();
        }
      }, { rootMargin: "120px" });

    if (observer) observer.observe(mapElement);
    else initializeMap();

    return () => {
      observer?.disconnect();
      if (invalidateTimer != null) window.clearTimeout(invalidateTimer);
      map?.remove();
    };
  }, [location?.latitude, location?.longitude, safeAddress]);

  return (
    <div className="min-w-0">
      <p className="break-words text-sm leading-5 text-slate-800">{safeAddress || "Address to be confirmed"}</p>
      {location ? (
        <>
          <div
            ref={mapElementRef}
            role="region"
            aria-label={`Interactive map showing the pinned service location${safeAddress ? ` at ${safeAddress}` : ""}`}
            className={`booking-location-map mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ${className}`}
          />
          <p className="mt-1 text-[11px] leading-4 text-slate-600">Drag the map to explore; use + and − to zoom.</p>
        </>
      ) : (
        <p className="mt-1 text-xs leading-5 text-slate-600">A pinned map is not available for this booking.</p>
      )}
    </div>
  );
}
