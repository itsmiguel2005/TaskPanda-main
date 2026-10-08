import { apiFetch } from "../services/api.js";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const DEFAULT_MAP_CENTER = [14.5995, 120.9842];
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
  return [latitude, longitude];
}

function getProviderMapCoordinates(provider) {
  return getCoordinates(provider?.mapLocation);
}

function getMapCenterDistanceKm(first, second) {
  const latitudeDistance = (first.lat - second.lat) * 111;
  const longitudeDistance = (first.lng - second.lng) * 111 * Math.cos((first.lat * Math.PI) / 180);
  return Math.hypot(latitudeDistance, longitudeDistance);
}

function getProviderGroups(providers) {
  const groups = new Map();
  providers.forEach((provider) => {
    const coordinates = getProviderMapCoordinates(provider);
    if (!coordinates) return;
    const key = `${coordinates[0]}:${coordinates[1]}`;
    const group = groups.get(key) || { coordinates, providers: [] };
    group.providers.push(provider);
    groups.set(key, group);
  });
  return [...groups.values()];
}

function createProviderMarkerIcon(providers) {
  const marker = document.createElement("span");
  marker.className = "relative flex h-10 w-10 items-center justify-center overflow-visible rounded-full border-2 border-white bg-emerald-600 text-xs font-bold text-white shadow-md ring-2 ring-emerald-700/70";

  if (providers.length > 1) {
    marker.textContent = String(providers.length);
  } else {
    const provider = providers[0];
    const imageUrl = String(provider.profileImage || "");
    if (/^https?:\/\//i.test(imageUrl)) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = "";
      image.className = "h-full w-full rounded-full object-cover";
      marker.append(image);
    } else {
      marker.textContent = String(provider.name || "P").trim().charAt(0).toUpperCase();
    }
  }

  return L.divIcon({
    html: marker,
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function createProviderPopup(providers, onSelect) {
  const popup = document.createElement("div");
  popup.className = "max-h-56 min-w-48 max-w-64 space-y-2 overflow-y-auto";

  providers.forEach((provider) => {
    const entry = document.createElement("div");
    entry.className = "flex items-center gap-2 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0";

    const details = document.createElement("div");
    details.className = "min-w-0 flex-1";
    const name = document.createElement("p");
    name.className = "truncate text-xs font-semibold text-slate-900";
    name.textContent = provider.name || provider.username || "Local provider";
    const profession = document.createElement("p");
    profession.className = "truncate text-[10px] text-slate-600";
    profession.textContent = Array.isArray(provider.professions) && provider.professions.length
      ? provider.professions.join(" · ")
      : "Service provider";
    details.append(name, profession);

    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "shrink-0 rounded-md bg-slate-900 px-2 py-1.5 text-[10px] font-semibold text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700";
    viewButton.textContent = "View";
    viewButton.addEventListener("click", () => onSelect(provider));
    entry.append(details, viewButton);
    popup.append(entry);
  });

  return popup;
}

export default function ServiceLocationPicker({
  value,
  onChange,
  token,
  heading = "Where should the service take place?",
  description = "Search an address, use your current location, or click the map and drag the pin to the exact service spot.",
  searchPlaceholder = "Street, barangay, city, or landmark",
  addressLabel = "Selected service address",
  addressPlaceholder = "Choose a result or enter the address for the pin",
  mapLabel = "OpenStreetMap service location picker",
  endpointBase = "/api/bookings/service-location",
  showNearbyProviders = false,
  onProviderSelect = () => {},
}) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const providerMarkersLayerRef = useRef(null);
  const choosePinRef = useRef(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onProviderSelectRef = useRef(onProviderSelect);
  const lookupControllerRef = useRef(null);
  const providerRequestControllerRef = useRef(null);
  const providerRequestTimeoutRef = useRef(null);
  const lastProviderSearchCenterRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState(value.address || "");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [nearbyProviders, setNearbyProviders] = useState([]);
  const [nearbyProvidersLoading, setNearbyProvidersLoading] = useState(false);
  const [nearbyProvidersError, setNearbyProvidersError] = useState("");
  const [error, setError] = useState("");

  valueRef.current = value;
  onChangeRef.current = onChange;
  onProviderSelectRef.current = onProviderSelect;

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return undefined;
    const initialCoordinates = getCoordinates(valueRef.current.geoLocation);
    const map = L.map(mapElementRef.current, { scrollWheelZoom: false })
      .setView(initialCoordinates || DEFAULT_MAP_CENTER, initialCoordinates ? 16 : 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
    }).addTo(map);
    mapRef.current = map;
    const providerMarkersLayer = L.layerGroup().addTo(map);
    providerMarkersLayerRef.current = providerMarkersLayer;

    const loadNearbyProviders = () => {
      if (!showNearbyProviders) return;
      if (providerRequestTimeoutRef.current) {
        window.clearTimeout(providerRequestTimeoutRef.current);
      }

      providerRequestTimeoutRef.current = window.setTimeout(async () => {
        const center = map.getCenter();
        const previousCenter = lastProviderSearchCenterRef.current;
        if (previousCenter && getMapCenterDistanceKm(center, previousCenter) < 0.7) return;

        lastProviderSearchCenterRef.current = center;
        providerRequestControllerRef.current?.abort();
        const controller = new AbortController();
        providerRequestControllerRef.current = controller;
        setNearbyProvidersLoading(true);
        setNearbyProvidersError("");

        try {
          const parameters = new URLSearchParams({
            latitude: String(center.lat),
            longitude: String(center.lng),
          });
          const response = await apiFetch(`/api/providers/map?${parameters}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || "Could not load providers near this part of the map.");
          if (!controller.signal.aborted) {
            setNearbyProviders(Array.isArray(data.providers) ? data.providers : []);
          }
        } catch (providerError) {
          if (providerError.name !== "AbortError") {
            setNearbyProvidersError(providerError.message || "Could not load providers near this part of the map.");
          }
        } finally {
          if (!controller.signal.aborted) setNearbyProvidersLoading(false);
        }
      }, 650);
    };

    const setPin = (latitude, longitude) => {
      const geoLocation = {
        type: "Point",
        coordinates: [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))],
      };
      const fallbackAddress = `Pinned location (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`;
      const marker = markerRef.current || L.marker([latitude, longitude], {
        icon: SERVICE_LOCATION_ICON,
        draggable: true,
        keyboard: true,
        title: "Drag to adjust the service location",
      }).addTo(map);
      if (!markerRef.current) {
        marker.on("dragend", () => {
          const position = marker.getLatLng();
          choosePin(position.lat, position.lng);
        });
      }
      markerRef.current = marker;
      marker.setLatLng([latitude, longitude]);
      onChangeRef.current({ ...valueRef.current, address: fallbackAddress, geoLocation });
      setSearchQuery(fallbackAddress);
      return marker;
    };

    const lookupAddress = async (latitude, longitude) => {
      lookupControllerRef.current?.abort();
      const controller = new AbortController();
      lookupControllerRef.current = controller;
      setIsLookingUp(true);
      setError("");
      try {
        const parameters = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
        const response = await apiFetch(`${endpointBase}/reverse?${parameters}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Could not find the address for this pin.");
        onChangeRef.current({
          ...valueRef.current,
          ...data.result,
          geoLocation: {
            type: "Point",
            coordinates: [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))],
          },
        });
        setSearchQuery(data.result.address);
      } catch (lookupError) {
        if (lookupError.name !== "AbortError") {
          setError("The pin is saved, but its street address could not be loaded. You can still book using the pinned coordinates, or enter a nearby address or landmark.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLookingUp(false);
      }
    };

    const choosePin = (latitude, longitude) => {
      setPin(latitude, longitude);
      void lookupAddress(latitude, longitude);
    };

    choosePinRef.current = choosePin;

    if (initialCoordinates) {
      const marker = L.marker(initialCoordinates, {
        icon: SERVICE_LOCATION_ICON,
        draggable: true,
        keyboard: true,
        title: "Drag to adjust the service location",
      }).addTo(map);
      markerRef.current = marker;
      marker.on("dragend", () => {
        const position = marker.getLatLng();
        choosePin(position.lat, position.lng);
      });
    }
    map.on("click", (event) => choosePin(event.latlng.lat, event.latlng.lng));
    map.on("moveend", loadNearbyProviders);
    loadNearbyProviders();
    const invalidateTimer = window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      window.clearTimeout(invalidateTimer);
      if (providerRequestTimeoutRef.current) {
        window.clearTimeout(providerRequestTimeoutRef.current);
        providerRequestTimeoutRef.current = null;
      }
      lookupControllerRef.current?.abort();
      providerRequestControllerRef.current?.abort();
      providerMarkersLayer.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      providerMarkersLayerRef.current = null;
      choosePinRef.current = null;
    };
  }, [endpointBase, token]);

  useEffect(() => {
    const layer = providerMarkersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    getProviderGroups(nearbyProviders).forEach(({ coordinates, providers }) => {
      const marker = L.marker(coordinates, {
        icon: createProviderMarkerIcon(providers),
        title: providers.length === 1
          ? `Approximate location of ${providers[0].name || "a provider"}`
          : `${providers.length} providers in this approximate area`,
      });
      marker.bindPopup(createProviderPopup(providers, (provider) => {
        onProviderSelectRef.current({ ...provider, _id: provider.id });
      }));
      marker.addTo(layer);
    });
  }, [nearbyProviders]);

  useEffect(() => {
    const coordinates = getCoordinates(value.geoLocation);
    const map = mapRef.current;
    if (!map || !coordinates) return;

    map.setView(coordinates, Math.max(map.getZoom(), 16));
    let marker = markerRef.current;
    if (!marker) {
      marker = L.marker(coordinates, {
        icon: SERVICE_LOCATION_ICON,
        draggable: true,
        keyboard: true,
        title: "Drag to adjust the service location",
      }).addTo(map);
      marker.on("dragend", () => {
        const position = marker.getLatLng();
        choosePinRef.current?.(position.lat, position.lng);
      });
      markerRef.current = marker;
    }
    marker.setLatLng(coordinates);
  }, [value.geoLocation?.coordinates?.[0], value.geoLocation?.coordinates?.[1]]);

  const searchAddress = async (event) => {
    event?.preventDefault();
    const query = searchQuery.trim();
    if (query.length < 3) {
      setError("Enter at least 3 characters of an address to search.");
      return;
    }
    setIsSearching(true);
    setError("");
    setSearchResults([]);
    try {
      const parameters = new URLSearchParams({ q: query });
      const response = await apiFetch(`${endpointBase}/search?${parameters}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Address search is unavailable.");
      setSearchResults(data.results || []);
      if (!data.results?.length) setError("No matching Philippine addresses found. Try a nearby landmark or move the pin manually.");
    } catch (searchError) {
      setError(searchError.message || "Address search is unavailable. Move the pin manually or try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (result) => {
    const coordinates = getCoordinates(result.geoLocation);
    if (!coordinates) {
      setError("That search result has no valid map position. Choose another result.");
      return;
    }
    onChange({ ...value, ...result });
    setSearchQuery(result.address);
    setSearchResults([]);
    setError("");
    if (mapRef.current) {
      mapRef.current.setView(coordinates, 17);
      const marker = markerRef.current || L.marker(coordinates, {
        icon: SERVICE_LOCATION_ICON,
        draggable: true,
        keyboard: true,
        title: "Drag to adjust the service location",
      }).addTo(mapRef.current);
      if (!markerRef.current) {
        marker.on("dragend", () => {
          const position = marker.getLatLng();
          choosePinRef.current?.(position.lat, position.lng);
        });
      }
      markerRef.current = marker;
      marker.setLatLng(coordinates);
    }
  };

  const useCurrentLocation = () => {
    setError("");
    if (!navigator.geolocation) {
      setError("Location access is not available in this browser. Search an address or move the pin instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const latitude = Number(coords.latitude.toFixed(6));
        const longitude = Number(coords.longitude.toFixed(6));
        if (mapRef.current) mapRef.current.setView([latitude, longitude], 17);
        choosePinRef.current?.(latitude, longitude);
      },
      () => setError("Could not access your current location. Search an address or move the pin instead."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <section aria-labelledby="service-location-heading" className="relative z-0 isolate space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <h3 id="service-location-heading" className="text-sm font-semibold text-gray-900">{heading}</h3>
        <p className="mt-1 text-xs leading-5 text-gray-600">{description}</p>
      </div>

      <div role="search" className="flex gap-2">
        <label htmlFor="service-location-search" className="sr-only">Search a service address in the Philippines</label>
        <input
          id="service-location-search"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void searchAddress(event);
          }}
          placeholder={searchPlaceholder}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20"
        />
        <button type="button" onClick={() => void searchAddress()} disabled={isSearching} className="shrink-0 rounded-lg bg-primary-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700 disabled:cursor-wait disabled:opacity-60">
          {isSearching ? "Searching…" : "Search"}
        </button>
      </div>

      <button type="button" onClick={useCurrentLocation} className="text-sm font-semibold text-primary-800 underline underline-offset-2 hover:text-primary-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700">
        Use my current location
      </button>

      {searchResults.length > 0 && (
        <ul aria-label="Address search results" className="max-h-36 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
          {searchResults.map((result, index) => (
            <li key={`${result.address}-${index}`}>
              <button type="button" onClick={() => selectSearchResult(result)} className="w-full px-3 py-2 text-left text-xs leading-5 text-gray-800 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary-700">
                {result.address}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div ref={mapElementRef} className="h-56 w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100 sm:h-64" role="application" aria-label={mapLabel} />
      {showNearbyProviders && (
        <p className="text-xs leading-5 text-slate-600" aria-live="polite">
          {nearbyProvidersError
            ? nearbyProvidersError
            : nearbyProvidersLoading
              ? "Finding providers near this map area…"
              : nearbyProviders.length
                ? `${nearbyProviders.length} provider${nearbyProviders.length === 1 ? "" : "s"} nearby. Pins show an approximate area, not an exact address.`
                : "No providers found near this map area. Move the map to explore."}
        </p>
      )}

      <div>
        <label htmlFor="service-location-address" className="block text-xs font-medium text-gray-700">{addressLabel}</label>
        <input
          id="service-location-address"
          type="text"
          maxLength={300}
          value={value.address || ""}
          onChange={(event) => onChange({ ...value, address: event.target.value })}
          placeholder={addressPlaceholder}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20"
        />
        <p className="mt-1 text-xs text-gray-600" aria-live="polite">
          {isLookingUp ? "Finding the address for the pin…" : getCoordinates(value.geoLocation) ? "Pin selected. Drag it or click another point to adjust." : "A map pin is required to calculate travel distance."}
        </p>
      </div>

      {error && <p role="alert" className="text-xs leading-5 text-red-700">{error}</p>}
      <p className="text-[11px] leading-4 text-gray-600">Map data © OpenStreetMap contributors. The map and address search require an internet connection.</p>
    </section>
  );
}
