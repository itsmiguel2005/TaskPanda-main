import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "./Header.jsx";
import ProviderModal from "./ProviderModal.jsx";
import ProviderStreak from "./ProviderStreak.jsx";
import RequestBookingModal from "./RequestBookingModal.jsx";
import PandaSwipeRefresh from "./PandaSwipeRefresh.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useBookings } from "../context/BookingContext.jsx";
import { PROFESSIONS } from "../utils/professions.js";

const filterCategories = PROFESSIONS.map((name) => ({ name }));

const sortOptions = [
  { value: "distance", label: "Nearest" },
  { value: "name", label: "Name A–Z" },
];
const FAVORITES_SYNC_EVENT = "taskpanda:favorites-sync";
const MINIMUM_TASK_OFFER = 100;

function formatPhpAmount(value) {
  const amount = Number(value);
  return `₱${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

function estimateTravelFare(distanceKm) {
  const distance = Number(distanceKm);
  if (!Number.isFinite(distance) || distance < 0) return null;
  const fare = 20 + Math.max(0, distance - 2) * 10;
  return Math.round((fare + Number.EPSILON) * 100) / 100;
}

function CheckBox({ label, count, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-sky-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="flex-1 text-sm text-slate-700">{label}</span>
      {count !== undefined && (
        <span className="text-xs tabular-nums text-slate-500">[{count}]</span>
      )}
    </label>
  );
}

export default function Explore() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { createBooking } = useBookings();
  const [viewingProvider, setViewingProvider] = useState(null);
  const [bookingProvider, setBookingProvider] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [searchCoordinates, setSearchCoordinates] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [showAllCats, setShowAllCats] = useState(false);
  const [sortBy, setSortBy] = useState("distance");
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [tesdaOnly, setTesdaOnly] = useState(false);
  const [minKm] = useState(0);
  const [maxKm, setMaxKm] = useState(25);
  const [providers, setProviders] = useState([]);
  const [totalProviders, setTotalProviders] = useState(0);
  const [favoriteProviderIds, setFavoriteProviderIds] = useState(new Set());
  const [verifiedFavoriteProviderIds, setVerifiedFavoriteProviderIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const { token } = useAuth();

  useEffect(() => {
    const coordinates = user?.geoLocation?.coordinates;
    if (coordinates?.length === 2) setSearchCoordinates({ type: "Point", coordinates });
  }, [user]);

  useEffect(() => {
    const service = searchParams.get("service");
    if (service) {
      setSelectedCategories(new Set([service]));
      setSearchQuery(service);
      setAppliedQuery(service);
    }
  }, [searchParams]);

  useEffect(() => {
    const handleFavoritesSync = (event) => {
      const nextIds = Array.isArray(event?.detail?.favoriteProviderIds)
        ? event.detail.favoriteProviderIds
        : [];
      setFavoriteProviderIds(new Set(nextIds.map((id) => String(id)).filter(Boolean)));
    };

    window.addEventListener(FAVORITES_SYNC_EVENT, handleFavoritesSync);
    return () => window.removeEventListener(FAVORITES_SYNC_EVENT, handleFavoritesSync);
  }, []);

  useEffect(() => {
    if (!token) {
      setFavoriteProviderIds(new Set());
      setVerifiedFavoriteProviderIds(new Set());
      return undefined;
    }

    let cancelled = false;
    const loadFavorites = async () => {
      try {
        const response = await fetch("/api/client/favorites", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;

        const favorites = Array.isArray(data.favorites) ? data.favorites : [];
        const nextIds = favorites.map((favorite) => String(favorite._id || favorite.id)).filter(Boolean);
        const normalizedSet = new Set(nextIds);
        const verifiedIds = favorites
          .filter((favorite) => favorite.isVerified === true || favorite.verificationStatus === "verified")
          .map((favorite) => String(favorite._id || favorite.id))
          .filter(Boolean);
        setFavoriteProviderIds(normalizedSet);
        setVerifiedFavoriteProviderIds(new Set(verifiedIds));
        window.dispatchEvent(new CustomEvent(FAVORITES_SYNC_EVENT, { detail: { favoriteProviderIds: nextIds } }));
      } catch {
        if (!cancelled) setFavoriteProviderIds(new Set());
      }
    };

    void loadFavorites();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!searchCoordinates?.coordinates) {
      setProviders([]);
      setTotalProviders(0);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setSearchError("");
      const [longitude, latitude] = searchCoordinates.coordinates;
      const params = new URLSearchParams({
        longitude: String(longitude),
        latitude: String(latitude),
        minKm: String(minKm),
        maxKm: String(maxKm),
      });
      if (appliedQuery) params.set("q", appliedQuery);
      if (selectedCategories.size) params.set("categories", [...selectedCategories].join(","));
      if (tesdaOnly) params.set("credential", "tesda");

      try {
        const response = await fetch(`/api/providers?${params}`, { signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Could not search nearby providers.");
        setProviders(data.providers || []);
        setTotalProviders(data.total || 0);
      } catch (error) {
        if (error.name !== "AbortError") setSearchError(error.message || "Could not search nearby providers.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [searchCoordinates, appliedQuery, selectedCategories, tesdaOnly, minKm, maxKm]);

  const visibleCats = showAllCats ? filterCategories : filterCategories.slice(0, 4);
  const registeredLocationLabel = [user?.barangay, user?.city, user?.province].filter(Boolean).join(", ");

  const toggleCategory = (name) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSearch = () => {
    setAppliedQuery(searchQuery.trim());
  };

  const handleUseCurrentLocation = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Location is not available in this browser.");
      return;
    }

    let bestPosition = null;
    let attempts = 0;

    const tryCapture = () => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const candidate = {
            longitude: Number(coords.longitude.toFixed(6)),
            latitude: Number(coords.latitude.toFixed(6)),
            accuracy: Number(coords.accuracy || 0),
          };

          if (!bestPosition || candidate.accuracy < bestPosition.accuracy) {
            bestPosition = candidate;
          }

          if (candidate.accuracy <= 50 || attempts >= 2) {
            setSearchCoordinates({
              type: "Point",
              coordinates: [bestPosition.longitude, bestPosition.latitude],
            });
            return;
          }

          attempts += 1;
          tryCapture();
        },
        () => {
          if (attempts >= 2) {
            setLocationError("Unable to get a precise location. Set a nearby-search pin in your profile instead.");
            return;
          }
          attempts += 1;
          tryCapture();
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    };

    tryCapture();
  };

  const clearFilters = () => {
    setSelectedCategories(new Set());
    setTesdaOnly(false);
    setMaxKm(25);
    setSearchQuery("");
    setAppliedQuery("");
    setSortBy("distance");
    setSearchParams({});
  };

  const toggleFavorite = useCallback(async (providerId) => {
    if (!token || !providerId) return;

    const normalizedId = String(providerId);
    const isSaved = favoriteProviderIds.has(normalizedId);
    const fallbackSet = new Set(favoriteProviderIds);

    try {
      const response = isSaved
        ? await fetch(`/api/client/favorites/${normalizedId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          })
        : await fetch("/api/client/favorites", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ providerId: normalizedId }),
          });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Could not update favorites.");
      }

      const nextSet = new Set(favoriteProviderIds);
      if (isSaved) nextSet.delete(normalizedId);
      else nextSet.add(normalizedId);

      setFavoriteProviderIds(nextSet);
      window.dispatchEvent(new CustomEvent(FAVORITES_SYNC_EVENT, { detail: { favoriteProviderIds: [...nextSet] } }));
    } catch (error) {
      setFavoriteProviderIds(fallbackSet);
      window.alert(error.message || "Could not update favorites.");
    }
  }, [favoriteProviderIds, token]);

  const removeFilter = (type, value) => {
    if (type === "category") {
      setSelectedCategories((prev) => {
        const next = new Set(prev);
        next.delete(value);
        return next;
      });
    } else if (type === "tesda") {
      setTesdaOnly(false);
    } else if (type === "search") {
      setAppliedQuery("");
      setSearchQuery("");
    }
  };

  const filteredProviders = useMemo(() => {
    return [...providers].sort((a, b) => {
      const aIsFavorite = favoriteProviderIds.has(String(a._id));
      const bIsFavorite = favoriteProviderIds.has(String(b._id));
      if (aIsFavorite !== bIsFavorite) return aIsFavorite ? -1 : 1;
      if (sortBy === "name") {
        return (a.fullName || a.username || "").localeCompare(b.fullName || b.username || "");
      }
      return 0;
    });
  }, [providers, sortBy, favoriteProviderIds]);

  const activeFilters = [];
  if (appliedQuery) {
    activeFilters.push({ type: "search", label: `Search: ${appliedQuery}`, value: appliedQuery });
  }
  selectedCategories.forEach((cat) => {
    activeFilters.push({ type: "category", label: cat, value: cat });
  });
  if (tesdaOnly) {
    activeFilters.push({ type: "tesda", label: "TESDA Certified", value: "tesda" });
  }

  const resultsSubtitle = () => {
    return `Showing providers ${minKm}–${maxKm} km away${appliedQuery ? ` matching “${appliedQuery}”` : ""}`;
  };

  const refreshProviders = async () => {
    if (!searchCoordinates?.coordinates) return;
    setLoading(true);
    setSearchError("");
    const [longitude, latitude] = searchCoordinates.coordinates;
    const params = new URLSearchParams({
      longitude: String(longitude),
      latitude: String(latitude),
      minKm: String(minKm),
      maxKm: String(maxKm),
    });
    if (appliedQuery) params.set("q", appliedQuery);
    if (selectedCategories.size) params.set("categories", [...selectedCategories].join(","));
    if (tesdaOnly) params.set("credential", "tesda");
    try {
      const response = await fetch(`/api/providers?${params}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not refresh nearby professionals.");
      setProviders(data.providers || []);
      setTotalProviders(data.total || 0);
    } catch (requestError) {
      setSearchError(requestError.message || "Could not refresh nearby professionals.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-page">
      <Header showNav activeTab="Explore" />

      <div className="dashboard-shell mt-6 grid grid-cols-1 gap-6 pb-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
        {/* Hero Search Section */}
        <div className="relative lg:col-start-2 lg:row-start-1">
          <div className="dashboard-panel grid gap-5 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1fr)_9rem]">
            <div className="min-w-0 max-w-2xl">
              <p className="dashboard-kicker">Local services, matched to you</p>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">
                Discover local <span className="text-blue-600">professionals</span>
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
                Search nearby tradespeople by name, service, or location.
              </p>

              <div className="mt-5 flex min-w-0 items-center overflow-hidden rounded-xl border border-sky-100 bg-sky-50/60 p-1.5 shadow-sm">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                  placeholder="Name, service, or location"
                  className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  className="dashboard-primary-button dashboard-focus shrink-0 px-5 py-3 text-sm"
                >
                  Search
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button type="button" onClick={handleUseCurrentLocation} className="dashboard-focus rounded text-sm font-semibold text-blue-700 underline-offset-4 hover:text-blue-900 hover:underline">
                  {searchCoordinates ? "Update search location" : "Use my current location"}
                </button>
                {searchCoordinates && (
                  <span className="text-xs text-slate-600">
                    {registeredLocationLabel
                      ? `Showing providers near ${registeredLocationLabel}`
                      : "Nearby search is active"}
                  </span>
                )}
              </div>
              {locationError && <p className="mt-2 text-sm text-red-700" role="alert">{locationError}</p>}
              {!searchCoordinates && (
                <p className="mt-2 text-xs text-slate-600">
                  {registeredLocationLabel
                    ? `We couldn’t map your registered location (${registeredLocationLabel}). Set a nearby-search pin in your profile or use your current location.`
                    : "Set a nearby-search pin in your profile or use your current location."}
                </p>
              )}
            </div>
            <div className="hidden items-end justify-center lg:flex" aria-hidden="true">
              <img src="/assets/Panda Cropped.png" alt="" className="h-36 w-32 object-contain object-bottom" />
            </div>
          </div>
      </div>

        {/* Left Sidebar */}
        <aside className="w-full shrink-0 lg:col-start-1 lg:row-start-1 lg:row-span-2">
          <div className="dashboard-panel p-4 sm:p-5 lg:sticky lg:top-20">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-bold tracking-tight text-slate-900">
                Browse Filters
              </h2>
              <button
                onClick={clearFilters}
                className="dashboard-focus rounded text-sm font-semibold text-blue-700 underline-offset-2 hover:text-blue-900 hover:underline"
              >
                Reset All
              </button>
            </div>

            {/* Qualification */}
            <div className="mb-5">
              <h3 className="dashboard-kicker mb-3">
                Qualification
              </h3>
              <div className="space-y-2.5">
                <CheckBox
                  label="Approved TESDA certificate"
                  checked={tesdaOnly}
                  onChange={() => setTesdaOnly((value) => !value)}
                />
              </div>
            </div>

            {/* Service Category */}
            <div className="mb-5">
              <h3 className="dashboard-kicker mb-3">
                Service Category
              </h3>
              <div className="space-y-2.5">
                {visibleCats.map((cat) => (
                  <CheckBox
                    key={cat.name}
                    label={cat.name}
                    checked={selectedCategories.has(cat.name)}
                    onChange={() => toggleCategory(cat.name)}
                  />
                ))}
              </div>
              {filterCategories.length >= 4 && (
                <button
                  onClick={() => setShowAllCats(!showAllCats)}
                  className="dashboard-focus mt-2 rounded text-sm font-semibold text-blue-700 underline-offset-2 hover:text-blue-900 hover:underline"
                >
                  {showAllCats
                    ? "Show less"
                    : `Show all ${filterCategories.length}`}
                </button>
              )}
            </div>

            {/* Distance range */}
            <div className="mb-5">
              <h3 className="dashboard-kicker mb-3">
                Distance range
              </h3>
              <p className="mb-3 text-sm font-semibold tabular-nums text-slate-800">0–{Number(maxKm).toFixed(1)} km</p>
              <div className="relative mx-2 h-8">
                <div className="absolute left-0 right-0 top-3 h-1 rounded bg-sky-100" />
                <div className="absolute top-3 h-1 rounded bg-blue-600" style={{ left: '0%', right: `${100 - (maxKm / 100) * 100}%` }} />
                <label className="sr-only" htmlFor="max-distance">Maximum distance</label>
                <input
                  id="max-distance"
                  type="range"
                  min="0.5"
                  max="100"
                  step="0.5"
                  value={maxKm}
                  onChange={(event) => setMaxKm(Math.max(0.5, Number(event.target.value)))}
                  className="absolute inset-0 z-10 h-7 w-full appearance-none bg-transparent accent-blue-700 pointer-events-auto"
                  style={{ pointerEvents: "auto" }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs text-slate-500"><span>Min 0 km</span><span>Max {Number(maxKm).toFixed(1)} km</span></div>
            </div>
          </div>
        </aside>

        {/* Right Main Area */}
        <div className="min-w-0 lg:col-start-2 lg:row-start-2">
          {/* Results Header */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold tracking-tight text-slate-900">
                {totalProviders}{" "}
                {totalProviders === 1 ? "Professional" : "Professionals"}{" "}
                Found
              </p>
              <p className="text-sm text-slate-600">{resultsSubtitle()}</p>
            </div>
            <div className="shrink-0">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="dashboard-focus rounded-lg border border-sky-100 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400"
              >
                {sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    Sort: {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Filter Chips */}
          {activeFilters.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {activeFilters.map((f) => (
                <span
                  key={`${f.type}-${f.value}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold text-blue-950"
                >
                  {f.label}
                  <button
                    onClick={() => removeFilter(f.type, f.value)}
                    className="dashboard-focus ml-0.5 flex h-4 w-4 items-center justify-center rounded-full hover:bg-sky-200"
                    aria-label={`Remove ${f.label}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-3 w-3"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

          {searchError && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{searchError}</p>}

          {/* Provider Grid */}
          <PandaSwipeRefresh
            disabled={!searchCoordinates || loading}
            onRefresh={refreshProviders}
          >
          {!searchCoordinates ? (
            <div className="rounded-xl border border-dashed border-sky-200 bg-white py-12 text-center">
              <p className="text-base font-semibold text-slate-900">
                {registeredLocationLabel ? "We couldn’t map your registered location yet" : "Set a search location to see nearby professionals"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {registeredLocationLabel
                  ? `Your address is ${registeredLocationLabel}. Update your nearby-search pin in your profile or use your current location.`
                  : "Use current location or save a nearby-search pin in your profile."}
              </p>
            </div>
          ) : loading && filteredProviders.length === 0 ? (
            <div className="rounded-xl border border-sky-100 bg-white py-12 text-center text-sm text-slate-600">Searching nearby professionals...</div>
          ) : filteredProviders.length > 0 ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProviders.map((provider) => {
                const isProviderVerified = Boolean(
                  provider.isVerified === true
                    || provider.verificationStatus === "verified"
                    || verifiedFavoriteProviderIds.has(String(provider._id))
                );
                const rating = Number(provider?.averageRating ?? 0);
                const reviews = Number(provider?.totalReviews ?? 0);
                const hasRatings = rating > 0 && reviews > 0;
                const travelEstimate = estimateTravelFare(provider.distanceKm);
                const distance = Number(provider.distanceKm);
                const distanceLabel = Number.isFinite(distance) ? `${distance.toFixed(2)} km` : "Distance unavailable";

                return (
                  <div
                    key={provider._id}
                    className="relative flex h-full flex-col justify-between overflow-hidden rounded-xl border border-sky-100 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.035)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_14px_32px_rgba(15,23,42,0.07)]"
                  >
                    <ProviderStreak streak={provider.onTimeStreak} className="absolute right-3 top-3 z-10 max-w-[calc(100%-1.5rem)]" />
                    <div className="h-40 overflow-hidden bg-sky-50">
                      {provider.profileImage ? (
                        <img
                          src={provider.profileImage}
                          alt={`${provider.fullName || provider.username || "Provider"} profile`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-end justify-center text-white" aria-label="No profile photo">
                          <svg viewBox="0 0 120 120" role="img" aria-hidden="true" className="h-36 w-36 text-white">
                            <circle cx="60" cy="35" r="23" fill="currentColor" />
                            <path d="M18 116c2-30 19-48 42-48s40 18 42 48" fill="currentColor" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col px-4 py-4 sm:px-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-bold text-slate-900">
                            {provider.fullName || provider.username || "Provider"}
                          </h3>
                          <div className="flex min-w-0 items-center gap-1.5">
                            <p className="truncate text-xs text-slate-600">{provider.professions?.join(" · ") || "Service provider"}</p>
                            {isProviderVerified && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700" aria-label="Verified provider">
                                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3 w-3">
                                  <path fillRule="evenodd" d="M10 1.667a2.5 2.5 0 0 1 2.357 1.666h1.81a2.5 2.5 0 0 1 2.5 2.5v1.81a2.5 2.5 0 0 1 0 4.714v1.81a2.5 2.5 0 0 1-2.5 2.5h-1.81a2.5 2.5 0 0 1-4.714 0h-1.81a2.5 2.5 0 0 1-2.5-2.5v-1.81a2.5 2.5 0 0 1 0-4.714v-1.81a2.5 2.5 0 0 1 2.5-2.5h1.81A2.5 2.5 0 0 1 10 1.667Zm3.09 6.75a.75.75 0 0 0-1.18-.92l-2.74 3.52-1.08-1.08a.75.75 0 0 0-1.06 1.06l1.68 1.68a.75.75 0 0 0 1.12-.07l3.26-4.19Z" clipRule="evenodd" />
                                </svg>
                                Verified
                              </span>
                            )}
                          </div>
                        </div>
                        {token && (
                          <button
                            type="button"
                            aria-label={favoriteProviderIds.has(String(provider._id)) ? "Remove from favorites" : "Add to favorites"}
                            onClick={() => toggleFavorite(provider._id)}
                            className={`dashboard-focus flex h-9 w-9 items-center justify-center rounded-full border transition ${favoriteProviderIds.has(String(provider._id)) ? "border-rose-200 bg-rose-100 text-rose-600" : "border-sky-100 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-600"}`}
                          >
                            <svg viewBox="0 0 24 24" fill={favoriteProviderIds.has(String(provider._id)) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                              <path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 0 1 6.5 4c1.74 0 3.41.81 4.5 2.09A6.12 6.12 0 0 1 15.5 4 4.5 4.5 0 0 1 20 8.5c0 3.78-3.4 6.86-8.55 11.5L12 21.35Z" />
                            </svg>
                          </button>
                        )}
                      </div>

                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        {(provider.tesdaCertificates || []).map((certificate) => (
                          <span key={`${provider._id}-${certificate.trade}`} className="inline-flex items-center rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-800">TESDA · {certificate.trade}</span>
                        ))}
                        <span className="inline-flex items-center rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-blue-950">
                          {[provider.barangay, provider.city, provider.province].filter(Boolean).join(", ") || "Nearby"}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <div className="flex items-center gap-1 text-amber-500" aria-label={hasRatings ? `${rating.toFixed(1)} out of 5 stars` : "No ratings yet"}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span key={star} className={hasRatings && star <= Math.round(rating) ? "text-amber-500" : "text-gray-300"}>
                              ★
                            </span>
                          ))}
                        </div>
                        <span className="font-semibold text-slate-900">{hasRatings ? rating.toFixed(1) : "New"}</span>
                        <span className="text-xs text-slate-500">({hasRatings ? reviews : 0} reviews)</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">
                        {provider.bio || "This provider has not added an introduction yet."}
                      </p>

                      <div className="mt-4 grid grid-cols-2 divide-x divide-sky-100 border-y border-sky-100 py-3">
                        <div className="min-w-0 pr-2.5">
                          <p className="dashboard-kicker text-blue-900">Task offer</p>
                          <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">From {formatPhpAmount(MINIMUM_TASK_OFFER)}</p>
                        </div>
                        <div className="min-w-0 pl-2.5">
                          <p className="dashboard-kicker text-blue-900">Travel estimate</p>
                          <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{travelEstimate == null ? "Unavailable" : formatPhpAmount(travelEstimate)}</p>
                          <p className="mt-0.5 text-[10px] leading-4 text-blue-950">{distanceLabel} · ₱20 base + ₱10/km after 2 km</p>
                          <p className="mt-0.5 text-[10px] leading-4 text-slate-500">Approximate; confirmed in request</p>
                        </div>
                      </div>

                      <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                        <button
                          type="button"
                          onClick={() => setViewingProvider(provider)}
                          className="dashboard-secondary-button dashboard-focus px-3 py-2 text-xs"
                        >
                          View Profile
                        </button>
                        <button
                          type="button"
                          onClick={() => setBookingProvider(provider)}
                          className="dashboard-primary-button dashboard-focus px-3 py-2 text-xs"
                        >
                          Book
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : loading ? (
            <div className="rounded-xl border border-sky-100 bg-white py-12 text-center text-sm text-slate-600">Updating results...</div>
          ) : searchError ? null : (
            <div className="rounded-xl border border-dashed border-sky-200 bg-white py-16 text-center">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-base font-semibold text-slate-900">
                No professionals found
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Try a different name, service, location, or distance range.
              </p>
              <button
                onClick={clearFilters}
                className="dashboard-primary-button dashboard-focus mt-4 px-5 py-2.5 text-sm"
              >
                Clear all filters
              </button>
            </div>
          )}
          </PandaSwipeRefresh>
        </div>
      </div>

        <ProviderModal
          provider={viewingProvider}
          onClose={() => setViewingProvider(null)}
          isFavorite={viewingProvider ? favoriteProviderIds.has(String(viewingProvider._id)) : false}
          onToggleFavorite={() => viewingProvider && toggleFavorite(viewingProvider._id)}
          onBook={() => {
            setBookingProvider(viewingProvider);
            setViewingProvider(null);
          }}
        />
        <RequestBookingModal
          provider={bookingProvider}
          onClose={() => setBookingProvider(null)}
          onSubmit={createBooking}
        />
    </div>
  );
}
