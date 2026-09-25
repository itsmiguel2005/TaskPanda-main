import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "./Header.jsx";
import ProviderModal from "./ProviderModal.jsx";
import RequestBookingModal from "./RequestBookingModal.jsx";

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
  { name: "EV Charger Installation" },
  { name: "Furniture Assembly" },
  { name: "Furniture Repair" },
  { name: "Glass Installer" },
  { name: "Garage Door Repair" },
  { name: "Gutter Cleaning" },
  { name: "Handyman" },
  { name: "Hauling & Junk Removal" },
  { name: "Insulation" },
  { name: "Landscaper" },
  { name: "Locksmith" },
  { name: "Mason" },
  { name: "Moving Helper" },
  { name: "Painter" },
  { name: "Pest Control" },
  { name: "Plumber" },
  { name: "Pressure Washing" },
  { name: "Pool Cleaner" },
  { name: "Roofer" },
  { name: "Smart Home Installation" },
  { name: "Water Heater" },
];

const providers = [
  {
    name: "Sweetie Palm",
    trade: "Carpenter",
    cred: "TESDA NC II Carpentry",
    bio: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    rating: 4.8,
    reviews: 12,
    location: "Dagupan City",
    verified: true,
    tesda: true,
    availability: ["today", "tomorrow"],
    color: "bg-emerald-100 text-emerald-700",
    banner: "from-emerald-400 to-emerald-600",
  },
  {
    name: "Pedro Cruz",
    trade: "Plumber",
    cred: "TESDA NC II Plumbing",
    bio: "Experienced plumber with 10+ years serving Dagupan households for all pipe and water needs.",
    rating: 4.6,
    reviews: 28,
    location: "Dagupan City",
    verified: true,
    tesda: true,
    availability: ["today", "this-week"],
    color: "bg-blue-100 text-blue-700",
    banner: "from-blue-400 to-blue-600",
  },
  {
    name: "Maria Santos",
    trade: "Electrician",
    cred: "TESDA NC II Electrical",
    bio: "Certified electrician specializing in residential wiring, panel upgrades, and circuit troubleshooting.",
    rating: 4.9,
    reviews: 35,
    location: "Dagupan City",
    verified: true,
    tesda: true,
    availability: ["today", "tomorrow", "weekends"],
    color: "bg-amber-100 text-amber-700",
    banner: "from-amber-400 to-amber-600",
  },
  {
    name: "Juan Dela Cruz",
    trade: "Air Conditioning Technician",
    cred: "TESDA NC II AC Technician",
    bio: "AC maintenance and repair specialist. Quick response and honest pricing for all brands.",
    rating: 4.5,
    reviews: 19,
    location: "Manila",
    verified: true,
    tesda: true,
    availability: ["tomorrow", "this-week"],
    color: "bg-cyan-100 text-cyan-700",
    banner: "from-cyan-400 to-cyan-600",
  },
  {
    name: "Ana Reyes",
    trade: "Painter",
    cred: "Professional Painter",
    bio: "Interior and exterior painting services. Clean finish, on-time delivery, competitive rates.",
    rating: 4.7,
    reviews: 14,
    location: "Dagupan City",
    verified: false,
    tesda: false,
    availability: ["this-week", "weekends"],
    color: "bg-rose-100 text-rose-700",
    banner: "from-rose-400 to-rose-600",
  },
  {
    name: "Ricky Padilla",
    trade: "Landscaper",
    cred: "Licensed Landscaper",
    bio: "Lawn care, garden design, tree trimming, and hardscaping for homes and businesses.",
    rating: 4.3,
    reviews: 9,
    location: "Manila",
    verified: true,
    tesda: false,
    availability: ["today", "weekends"],
    color: "bg-green-100 text-green-700",
    banner: "from-green-400 to-green-600",
  },
];

function StarIcon({ filled }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-3.5 w-3.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}

const availabilityOptions = [
  { key: "today", label: "Available Today" },
  { key: "tomorrow", label: "Available Tomorrow" },
  { key: "this-week", label: "This week" },
  { key: "weekends", label: "Weekends only" },
];

const ratingOptions = [
  { label: "5 stars & up", min: 5 },
  { label: "4 stars & up", min: 4 },
  { label: "3 stars & up", min: 3 },
  { label: "2 stars & up", min: 2 },
];

const sortOptions = [
  { value: "relevance", label: "Relevance" },
  { value: "rating", label: "Highest Rated" },
  { value: "reviews", label: "Most Reviews" },
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
  const [viewingProvider, setViewingProvider] = useState(null);
  const [showBooking, setShowBooking] = useState(false);
  const [searchService, setSearchService] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [showAllCats, setShowAllCats] = useState(false);
  const [sortBy, setSortBy] = useState("relevance");
  const [appliedSearch, setAppliedSearch] = useState({ service: "", location: "" });

  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [tesdaOnly, setTesdaOnly] = useState(false);
  const [availabilityFilter, setAvailabilityFilter] = useState(new Set());
  const [ratingMin, setRatingMin] = useState(null);

  useEffect(() => {
    const service = searchParams.get("service");
    if (service) {
      setSelectedCategories(new Set([service]));
      setAppliedSearch((prev) => ({ ...prev, service }));
    }
  }, [searchParams]);

  const visibleCats = showAllCats ? filterCategories : filterCategories.slice(0, 4);

  const toggleCategory = (name) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAvailability = (key) => {
    setAvailabilityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSearch = () => {
    setAppliedSearch({ service: searchService, location: searchLocation });
  };

  const clearFilters = () => {
    setSelectedCategories(new Set());
    setVerifiedOnly(false);
    setTesdaOnly(false);
    setAvailabilityFilter(new Set());
    setRatingMin(null);
    setSearchService("");
    setSearchLocation("");
    setAppliedSearch({ service: "", location: "" });
    setSortBy("relevance");
    setSearchParams({});
  };

  const removeFilter = (type, value) => {
    if (type === "category") {
      setSelectedCategories((prev) => {
        const next = new Set(prev);
        next.delete(value);
        return next;
      });
    } else if (type === "availability") {
      setAvailabilityFilter((prev) => {
        const next = new Set(prev);
        next.delete(value);
        return next;
      });
    } else if (type === "rating") {
      setRatingMin(null);
    } else if (type === "verified") {
      setVerifiedOnly(false);
    } else if (type === "tesda") {
      setTesdaOnly(false);
    } else if (type === "service") {
      setAppliedSearch((prev) => ({ ...prev, service: "" }));
    } else if (type === "location") {
      setAppliedSearch((prev) => ({ ...prev, location: "" }));
      setSearchLocation("");
    }
  };

  const filteredProviders = useMemo(() => {
    let result = providers;

    if (appliedSearch.service) {
      const q = appliedSearch.service.toLowerCase();
      result = result.filter(
        (p) =>
          p.trade.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.cred.toLowerCase().includes(q)
      );
    }

    if (appliedSearch.location) {
      const q = appliedSearch.location.toLowerCase();
      result = result.filter((p) =>
        p.location.toLowerCase().includes(q)
      );
    }

    if (selectedCategories.size > 0) {
      result = result.filter((p) => selectedCategories.has(p.trade));
    }

    if (verifiedOnly) {
      result = result.filter((p) => p.verified);
    }

    if (tesdaOnly) {
      result = result.filter((p) => p.tesda);
    }

    if (availabilityFilter.size > 0) {
      result = result.filter((p) =>
        [...availabilityFilter].some((a) => p.availability.includes(a))
      );
    }

    if (ratingMin !== null) {
      result = result.filter((p) => p.rating >= ratingMin);
    }

    if (sortBy === "rating") {
      result = [...result].sort((a, b) => b.rating - a.rating);
    } else if (sortBy === "reviews") {
      result = [...result].sort((a, b) => b.reviews - a.reviews);
    } else if (sortBy === "name") {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [
    appliedSearch,
    selectedCategories,
    verifiedOnly,
    tesdaOnly,
    availabilityFilter,
    ratingMin,
    sortBy,
  ]);

  const activeFilters = [];
  if (appliedSearch.service) {
    activeFilters.push({ type: "service", label: `Service: ${appliedSearch.service}`, value: appliedSearch.service });
  }
  if (appliedSearch.location) {
    activeFilters.push({ type: "location", label: `Location: ${appliedSearch.location}`, value: appliedSearch.location });
  }
  selectedCategories.forEach((cat) => {
    activeFilters.push({ type: "category", label: cat, value: cat });
  });
  if (verifiedOnly) {
    activeFilters.push({ type: "verified", label: "ID Verified", value: "verified" });
  }
  if (tesdaOnly) {
    activeFilters.push({ type: "tesda", label: "TESDA Certified", value: "tesda" });
  }
  availabilityFilter.forEach((a) => {
    const opt = availabilityOptions.find((o) => o.key === a);
    if (opt) {
      activeFilters.push({ type: "availability", label: opt.label, value: a });
    }
  });
  if (ratingMin !== null) {
    const opt = ratingOptions.find((o) => o.min === ratingMin);
    if (opt) {
      activeFilters.push({ type: "rating", label: opt.label, value: ratingMin });
    }
  }

  const resultsSubtitle = () => {
    const parts = [];
    if (appliedSearch.service) parts.push(`'${appliedSearch.service}'`);
    if (appliedSearch.location) parts.push(`in ${appliedSearch.location}`);
    if (selectedCategories.size === 1) parts.push(`category: ${[...selectedCategories][0]}`);
    return parts.length ? `Showing results for ${parts.join(" ")}` : "Showing all professionals";
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
              Find trusted experts for carpentry, plumbing, cleaning, and
              more.
            </p>

            <div className="mt-6 flex items-center overflow-hidden rounded-xl bg-white shadow-lg">
              <input
                type="text"
                value={searchService}
                onChange={(e) => setSearchService(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="What services do you need?"
                className="flex-1 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 outline-none"
              />
              <div className="h-8 w-px bg-gray-200" />
              <input
                type="text"
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="Dagupan City"
                className="w-24 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 outline-none sm:w-36 md:w-44"
              />
              <button
                onClick={handleSearch}
                className="shrink-0 bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-700"
              >
                Search
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto mt-6 flex max-w-5xl gap-6 px-4 pb-10 sm:px-6 lg:px-8">
        {/* Left Sidebar */}
        <aside className="hidden w-64 shrink-0 lg:block">
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

            {/* Verification */}
            <div className="mb-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Verification
              </h3>
              <div className="space-y-2.5">
                <CheckBox
                  label="TESDA CERTIFIED ONLY"
                  checked={tesdaOnly}
                  onChange={() => setTesdaOnly((v) => !v)}
                />
                <CheckBox
                  label="ID VERIFIED PROFESSIONALS"
                  checked={verifiedOnly}
                  onChange={() => setVerifiedOnly((v) => !v)}
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

            {/* Availability */}
            <div className="mb-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Availability
              </h3>
              <div className="space-y-2.5">
                {availabilityOptions.map((opt) => (
                  <CheckBox
                    key={opt.key}
                    label={opt.label}
                    checked={availabilityFilter.has(opt.key)}
                    onChange={() => toggleAvailability(opt.key)}
                  />
                ))}
              </div>
            </div>

            {/* Rating */}
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Rating
              </h3>
              <div className="space-y-2.5">
                {ratingOptions.map((opt) => (
                  <CheckBox
                    key={opt.min}
                    label={opt.label}
                    checked={ratingMin === opt.min}
                    onChange={() =>
                      setRatingMin((prev) => (prev === opt.min ? null : opt.min))
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Right Main Area */}
        <div className="flex-1 lg:min-w-0">
          {/* Results Header */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-gray-900">
                {filteredProviders.length}{" "}
                {filteredProviders.length === 1 ? "Professional" : "Professionals"}{" "}
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

          {/* Provider Grid */}
          {filteredProviders.length > 0 ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProviders.map((provider) => (
                <div
                  key={provider.name}
                  className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
                >
                  <div className={`relative h-28 bg-gradient-to-r ${provider.banner}`}>
                    <div className="absolute -bottom-6 left-4">
                      <div className={`flex h-14 w-14 items-center justify-center rounded-full border-4 border-white text-lg font-bold ${provider.color}`}>
                        {provider.name.charAt(0)}
                      </div>
                    </div>
                  </div>
                  <div className="px-4 pb-4 pt-8">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">
                          {provider.name}
                        </h3>
                        <p className="text-xs text-gray-500">{provider.trade}</p>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        {provider.cred}
                      </span>
                      {provider.location && (
                        <span className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          📍 {provider.location}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500">
                      {provider.bio}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <StarIcon filled />
                        <span className="text-sm font-semibold text-gray-800">
                          {provider.rating}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({provider.reviews})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewingProvider(provider)}
                        className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-700"
                      >
                        View Profile
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-base font-semibold text-gray-700">
                No professionals found
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your filters or search terms
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
        <ProviderModal provider={viewingProvider} onClose={() => setViewingProvider(null)} onBookNow={() => setShowBooking(true)} />
      </div>
      {showBooking && (
        <RequestBookingModal provider={viewingProvider} onClose={() => setShowBooking(false)} />
      )}
    </div>
  );
}
