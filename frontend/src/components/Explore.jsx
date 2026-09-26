import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "./Header.jsx";
import ProviderModal from "./ProviderModal.jsx";
import RequestBookingModal from "./RequestBookingModal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useBookings } from "../context/BookingContext.jsx";

const filterCategories = [
  { name: "Air Conditioning Technician" },
  { name: "Appliance Installer" },
  { name: "Appliance Repair" },
  { name: "Carpenter" },
  { name: "Ceiling Installer" },
  { name: "Chimney Sweep" },
  { name: "House Cleaner" },
  { name: "Deep Cleaning" },
  { name: "Drainage Engineer" },
  { name: "Dryer Vent Cleaning" },
  { name: "Door Repair" },
  { name: "Electrician" },
  { name: "Furniture Assembly" },
  { name: "Handyman" },
  { name: "Landscaper" },
  { name: "Locksmith" },
  { name: "Mason" },
  { name: "Painter" },
  { name: "Plumber" },
  { name: "Roofer" },
];

const sortOptions = [
  { value: "distance", label: "Nearest" },
  { value: "name", label: "Name A–Z" },
];

function CheckBox({ label, count, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
      />
      <span className="flex-1 text-sm text-gray-700">{label}</span>
      {count !== undefined && (
        <span className="text-xs text-gray-400">[{count}]</span>
      )}
    </label>
  );
}

export default function Explore() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, refreshProfile } = useAuth();
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
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

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
    return sortBy === "name"
      ? [...providers].sort((a, b) => (a.fullName || a.username || "").localeCompare(b.fullName || b.username || ""))
      : providers;
  }, [providers, sortBy]);

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

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <Header showNav activeTab="Explore" />

      {/* Hero Search Section */}
      <div className="relative mx-auto mt-6 max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-700 via-slate-700 to-slate-800 px-6 py-10 sm:px-10 sm:py-12">
          <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute bottom-0 left-1/2 h-32 w-32 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute -bottom-4 -right-2 hidden h-48 w-40 overflow-hidden sm:block md:right-8">
            <img
              src="/assets/Panda Cropped.png"
              alt="TaskPanda mascot"
              className="h-full w-full object-contain"
            />
          </div>

          <div className="relative z-10 max-w-lg">
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
              Discover Local Professionals
            </h1>
            <p className="mt-3 text-base leading-relaxed text-teal-100/80">
              Find nearby professionals by name, trade, or location.
            </p>

            <div className="mt-6 flex items-center overflow-hidden rounded-xl bg-white shadow-lg">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="Name, service (e.g. IT repair), or location"
                className="flex-1 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 outline-none"
              />
              <button
                type="button"
                onClick={handleSearch}
                className="shrink-0 bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-700"
              >
                Search
              </button>
            </div>
            <button type="button" onClick={handleUseCurrentLocation} className="mt-3 text-sm font-semibold text-white underline underline-offset-4">
              {searchCoordinates ? "Update search location" : "Use my current location"}
            </button>
            {locationError && <p className="mt-2 text-sm text-amber-100" role="alert">{locationError}</p>}
            {!searchCoordinates && <p className="mt-1 text-xs text-teal-100/80">Set a nearby-search pin in your profile or use your current location.</p>}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto mt-6 flex max-w-5xl flex-col gap-6 px-4 pb-10 sm:px-6 lg:flex-row lg:px-8">
        {/* Left Sidebar */}
        <aside className="w-full shrink-0 lg:w-64">
          <div className="sticky top-20 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">
                Browse Filters
              </h2>
              <button
                onClick={clearFilters}
                className="text-sm font-medium text-purple-600 hover:text-purple-800"
              >
                Reset All
              </button>
            </div>

            {/* Qualification */}
            <div className="mb-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
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
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
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
                  className="mt-2 text-sm font-medium text-purple-600 hover:text-purple-800"
                >
                  {showAllCats
                    ? "Show less"
                    : `Show all ${filterCategories.length}`}
                </button>
              )}
            </div>

            {/* Distance range */}
            <div className="mb-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Distance range
              </h3>
              <p className="mb-3 text-sm font-semibold text-gray-800">0–{Number(maxKm).toFixed(1)} km</p>
              <div className="relative mx-2 h-8">
                <div className="absolute left-0 right-0 top-3 h-1 rounded bg-gray-200" />
                <div className="absolute top-3 h-1 rounded bg-primary-600" style={{ left: '0%', right: `${100 - (maxKm / 100) * 100}%` }} />
                <label className="sr-only" htmlFor="max-distance">Maximum distance</label>
                <input
                  id="max-distance"
                  type="range"
                  min="0.5"
                  max="100"
                  step="0.5"
                  value={maxKm}
                  onChange={(event) => setMaxKm(Math.max(0.5, Number(event.target.value)))}
                  className="absolute inset-0 z-10 h-7 w-full appearance-none bg-transparent accent-primary-700 pointer-events-auto"
                  style={{ pointerEvents: "auto" }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs text-gray-400"><span>Min 0 km</span><span>Max {Number(maxKm).toFixed(1)} km</span></div>
            </div>
          </div>
        </aside>

        {/* Right Main Area */}
        <div className="flex-1 lg:min-w-0">
          {/* Results Header */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-gray-900">
                {totalProviders}{" "}
                {totalProviders === 1 ? "Professional" : "Professionals"}{" "}
                Found
              </p>
              <p className="text-sm text-gray-500">{resultsSubtitle()}</p>
            </div>
            <div className="shrink-0">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-purple-500"
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
                  className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700"
                >
                  {f.label}
                  <button
                    onClick={() => removeFilter(f.type, f.value)}
                    className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full hover:bg-purple-200"
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

          {searchError && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{searchError}</p>}

          {/* Provider Grid */}
          {!searchCoordinates ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
              <p className="text-base font-semibold text-gray-800">Set a search location to see nearby professionals</p>
              <p className="mt-1 text-sm text-gray-500">Use current location or save a nearby-search pin in your profile.</p>
            </div>
          ) : loading && filteredProviders.length === 0 ? (
            <div className="rounded-xl border border-gray-100 bg-white py-12 text-center text-sm text-gray-500">Searching nearby professionals...</div>
          ) : filteredProviders.length > 0 ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProviders.map((provider) => (
                <div
                  key={provider._id}
                  className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
                >
                  <div className="h-40 overflow-hidden bg-slate-200">
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
                  <div className="px-4 py-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">
                          {provider.fullName || provider.username || "Provider"}
                        </h3>
                        <p className="text-xs text-gray-500">{provider.professions?.join(" · ") || "Service provider"}</p>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      {(provider.tesdaCertificates || []).map((certificate) => (
                        <span key={`${provider._id}-${certificate.trade}`} className="inline-flex items-center rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-800">TESDA · {certificate.trade}</span>
                      ))}
                      <span className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        {[provider.barangay, provider.city, provider.province].filter(Boolean).join(", ") || "Nearby"} · {provider.distanceKm} km
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500">
                      {provider.bio || "This provider has not added an introduction yet."}
                    </p>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setViewingProvider(provider)}
                        className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-700"
                      >
                        View Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => setBookingProvider(provider)}
                        className="rounded-lg border border-purple-200 px-4 py-1.5 text-xs font-semibold text-purple-700 transition hover:bg-purple-50"
                      >
                        Book
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : loading ? (
            <div className="rounded-xl border border-gray-100 bg-white py-12 text-center text-sm text-gray-500">Updating results...</div>
          ) : searchError ? null : (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-base font-semibold text-gray-700">
                No professionals found
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Try a different name, service, location, or distance range.
              </p>
              <button
                onClick={clearFilters}
                className="mt-4 rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-700"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
        <ProviderModal provider={viewingProvider} onClose={() => setViewingProvider(null)} />
        <RequestBookingModal
          provider={bookingProvider}
          onClose={() => setBookingProvider(null)}
          onSubmit={createBooking}
        />
      </div>
    </div>
  );
}
