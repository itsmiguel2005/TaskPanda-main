import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useBookings } from "../context/BookingContext.jsx";
import Header from "./Header.jsx";
import BookingProgress from "./BookingProgress.jsx";
import BookingHistory from "./BookingHistory.jsx";
import AddressActions from "./AddressActions.jsx";
import { canRequestCancellation, getCancellationLockMessage } from "../utils/bookingCancellation.js";
import StatusChangeConfirmation from "./StatusChangeConfirmation.jsx";

export const categories = [
  { name: "All Services", icon: "🏠" },
  { name: "Carpentry", icon: "🪵" },
  { name: "Electrical", icon: "⚡" },
  { name: "Plumbing", icon: "🔧" },
  { name: "Painting", icon: "🎨" },
  { name: "Cleaning", icon: "🧹" },
  { name: "Landscaping", icon: "🌱" },
];

function hasMutualSettlement(booking) {
  return Boolean((booking?.clientConfirmedCash || booking?.cashPaidConfirmedAt) && (booking?.providerConfirmedCash || booking?.cashReceivedConfirmedAt));
}

function StatusBadge({ status }) {
  const colors = {
    "Pending Request": "bg-amber-100 text-amber-700 border-amber-200",
    Confirmed: "bg-green-100 text-green-700 border-green-200",
    "On the Way": "bg-cyan-100 text-cyan-800 border-cyan-200",
    "In Progress": "bg-purple-100 text-purple-700 border-purple-200",
    Completed: "bg-blue-100 text-blue-700 border-blue-200",
    Settled: "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Cancellation Requested": "bg-amber-100 text-amber-700 border-amber-200",
    Cancelled: "bg-red-100 text-red-700 border-red-200",
    "Declined by Provider": "bg-rose-100 text-rose-800 border-rose-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em] ${
        colors[status] || "bg-gray-100 text-gray-700 border-gray-200"
      }`}
    >
      {status}
    </span>
  );
}

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

const FAVORITES_SYNC_EVENT = "taskpanda:favorites-sync";

function resolveProviderPerformance(provider, bookings) {
  if (!Array.isArray(bookings) || bookings.length === 0) {
    return { rating: 0, reviews: 0 };
  }

  const providerKey = String(provider?._id || "");
  const providerName = String(provider?.fullName || provider?.username || "").trim().toLowerCase();

  const matchingReviews = bookings.filter((booking) => {
    const status = String(booking?.statusCode || booking?.status || "").trim().toLowerCase();
    if (!["complete", "completed", "closed", "settled"].includes(status)) return false;
    if (!Number.isFinite(Number(booking?.clientRating))) return false;
    const sameProviderId = providerKey && String(booking?.providerId || "") === providerKey;
    const sameProviderName = providerName && String(booking?.worker || "").trim().toLowerCase() === providerName;
    return sameProviderId || sameProviderName;
  });

  if (!matchingReviews.length) return { rating: 0, reviews: 0 };

  const totalRating = matchingReviews.reduce((sum, booking) => sum + Number(booking.clientRating), 0);
  return {
    rating: Number((totalRating / matchingReviews.length).toFixed(1)),
    reviews: matchingReviews.length,
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLoggedIn, user, token } = useAuth();
  const { bookings: bookingList, isLoading, error, requestCancellation, respondToProviderUpdate } = useBookings();
  const [bannerVisible, setBannerVisible] = useState(true);
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");
  const [bookingSearchQuery, setBookingSearchQuery] = useState("");
  const [cancelingId, setCancelingId] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [dismissedBookingIds, setDismissedBookingIds] = useState(() => {
    if (typeof window === "undefined") return [];

    try {
      const savedDismissals = JSON.parse(window.localStorage.getItem("taskpanda-hidden-dashboard-bookings") || "[]");
      return Array.isArray(savedDismissals) ? savedDismissals : [];
    } catch {
      return [];
    }
  });
  const [expandedHistoryIds, setExpandedHistoryIds] = useState({});
  const [favoriteProviderIds, setFavoriteProviderIds] = useState(new Set());
  const [favoriteProviders, setFavoriteProviders] = useState([]);
  const [topRatedProviders, setTopRatedProviders] = useState([]);
  const [topRatedProvidersLoading, setTopRatedProvidersLoading] = useState(false);
  const [topRatedProvidersError, setTopRatedProvidersError] = useState("");
  const requestRef = useRef(null);
  const scrollRef = useRef(null);
  const catScrollRef = useRef(null);
  const locationKey = useMemo(() => {
    const coords = user?.geoLocation?.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2) return "";
    const [longitude, latitude] = coords;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return "";
    return `${longitude.toFixed(5)}:${latitude.toFixed(5)}`;
  }, [user?.geoLocation?.coordinates]);
  const visibleTopRatedProviders = useMemo(() => topRatedProviders, [topRatedProviders]);

  const tabs = ["All", "Pending", "Active", "Completed", "Cancelled", "Declined"];
  const dashboardDismissableStatuses = new Set(["Completed", "Settled", "Cancelled", "Declined by Provider"]);
  const nonDismissedBookingList = bookingList.filter((booking) => !dismissedBookingIds.includes(booking.id));

  const canDismissBookingFromDashboard = (booking) => dashboardDismissableStatuses.has(String(booking?.status || ""));

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("taskpanda-hidden-dashboard-bookings", JSON.stringify(dismissedBookingIds));
    }
  }, [dismissedBookingIds]);

  const tabCounts = {
    All: nonDismissedBookingList.length,
    Pending: nonDismissedBookingList.filter(
      (b) => b.status === "Pending Request"
    ).length,
    Active: nonDismissedBookingList.filter((b) => ["Confirmed", "On the Way", "In Progress", "Cancellation Requested", "In Revision", "Disputed"].includes(b.status)).length,
    Completed: nonDismissedBookingList.filter(
      (b) => b.status === "Completed"
    ).length,
    Cancelled: nonDismissedBookingList.filter((b) => b.status === "Cancelled").length,
    Declined: nonDismissedBookingList.filter((b) => b.status === "Declined by Provider").length,
  };

  const scroll = (direction) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: direction === "left" ? -200 : 200,
        behavior: "smooth",
      });
    }
  };

  const scrollCategories = (direction) => {
    if (catScrollRef.current) {
      catScrollRef.current.scrollBy({
        left: direction === "left" ? -200 : 200,
        behavior: "smooth",
      });
    }
  };

  const normalizedBookingQuery = bookingSearchQuery.trim().toLowerCase();
  const matchingBookingList = nonDismissedBookingList.filter((booking) => !normalizedBookingQuery ||
    [booking.worker, booking.cred, booking.task, booking.description]
      .some((value) => String(value || "").toLowerCase().includes(normalizedBookingQuery))
  );
  const filteredBookings = matchingBookingList.filter((booking) => {
    if (activeTab === "All") return true;
    if (activeTab === "Pending") return booking.status === "Pending Request";
    if (activeTab === "Active") return ["Confirmed", "On the Way", "In Progress", "Cancellation Requested", "In Revision", "Disputed"].includes(booking.status);
    if (activeTab === "Completed") return booking.status === "Completed";
    if (activeTab === "Cancelled") return booking.status === "Cancelled";
    return booking.status === "Declined by Provider";
  });

  const filteredCategories = categories.filter((cat) =>
    search.trim()
      ? cat.name.toLowerCase().includes(search.toLowerCase())
      : true
  );

  const cancelBooking = bookingList.find((booking) => booking.id === cancelingId);
  const cancelBookingNeedsReason = Boolean(cancelBooking && Date.now() - new Date(cancelBooking.createdAt).getTime() >= 10 * 60 * 1000);
  const enRouteBooking = bookingList.find((booking) => booking.status === "On the Way");
  const hasDismissedBookings = dismissedBookingIds.length > 0;

  useEffect(() => {
    let active = true;
    let latestRequest = 0;

    const refreshFavoriteProviders = async () => {
      if (!token) return;
      const requestId = ++latestRequest;
      try {
        const response = await fetch("/api/client/favorites", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        if (!active || requestId !== latestRequest) return;
        setFavoriteProviders(Array.isArray(data.favorites) ? data.favorites : []);
      } catch {
        // Preserve the currently displayed favorites if a background refresh fails.
      }
    };

    const handleFavoritesSync = (event) => {
      const nextIds = Array.isArray(event?.detail?.favoriteProviderIds)
        ? event.detail.favoriteProviderIds
        : [];
      const normalizedIds = nextIds.map((id) => String(id)).filter(Boolean);
      setFavoriteProviderIds(new Set(normalizedIds));
      void refreshFavoriteProviders();
    };

    window.addEventListener(FAVORITES_SYNC_EVENT, handleFavoritesSync);
    return () => {
      active = false;
      window.removeEventListener(FAVORITES_SYNC_EVENT, handleFavoritesSync);
    };
  }, [token]);

  useEffect(() => {
    if (!token) {
      setFavoriteProviderIds(new Set());
      setFavoriteProviders([]);
      return undefined;
    }

    let cancelled = false;

    const loadFavorites = async () => {
      try {
        const response = await fetch("/api/client/favorites", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          if (!cancelled) {
            setFavoriteProviderIds(new Set());
            setFavoriteProviders([]);
          }
          return;
        }

        const data = await response.json().catch(() => ({}));
        const providers = Array.isArray(data.favorites) ? data.favorites : [];
        if (cancelled) return;

        const favoriteIds = providers
          .map((provider) => String(provider?._id || provider?.id || ""))
          .filter(Boolean);

        setFavoriteProviderIds(new Set(favoriteIds));
        setFavoriteProviders(providers);
        window.dispatchEvent(new CustomEvent(FAVORITES_SYNC_EVENT, { detail: { favoriteProviderIds: favoriteIds } }));
      } catch {
        if (!cancelled) {
          setFavoriteProviderIds(new Set());
          setFavoriteProviders([]);
        }
      }
    };

    void loadFavorites();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const toggleFavorite = useCallback(async (providerId) => {
    if (!token || !providerId) return;

    const normalizedProviderId = String(providerId);
    const isSaved = favoriteProviderIds.has(normalizedProviderId);
    const previousSet = new Set(favoriteProviderIds);

    try {
      const response = isSaved
        ? await fetch(`/api/client/favorites/${normalizedProviderId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          })
        : await fetch("/api/client/favorites", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ providerId: normalizedProviderId }),
          });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Could not update favorites.");
      }

      const nextSet = new Set(favoriteProviderIds);
      if (isSaved) nextSet.delete(normalizedProviderId);
      else nextSet.add(normalizedProviderId);

      setFavoriteProviderIds(nextSet);
      window.dispatchEvent(new CustomEvent(FAVORITES_SYNC_EVENT, { detail: { favoriteProviderIds: [...nextSet] } }));

      if (isSaved) {
        setFavoriteProviders((current) => current.filter(
          (provider) => String(provider?._id || provider?.id) !== normalizedProviderId
        ));
      } else {
        const provider = topRatedProviders.find(
          (item) => String(item?._id || item?.id) === normalizedProviderId
        );

        if (provider) {
          setFavoriteProviders((current) => {
            const alreadyExists = current.some(
              (item) => String(item?._id || item?.id) === normalizedProviderId
            );
            return alreadyExists ? current : [...current, provider];
          });
        }
      }
    } catch (error) {
      setFavoriteProviderIds(previousSet);
      window.alert(error.message || "Could not update favorites.");
    }
  }, [favoriteProviderIds, token, topRatedProviders]);

  const loadTopRatedProviders = useCallback(async () => {
    if (!locationKey) {
      setTopRatedProviders([]);
      setTopRatedProvidersLoading(false);
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    setTopRatedProvidersLoading(true);
    setTopRatedProvidersError("");

    const [longitude, latitude] = locationKey.split(":").map(Number);
    const params = new URLSearchParams({
      longitude: String(longitude),
      latitude: String(latitude),
      minKm: "0",
      maxKm: "25",
      limit: "3",
    });

    try {
      const response = await fetch(`/api/providers?${params.toString()}`, { signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load nearby providers.");

      const providers = Array.isArray(data.providers) ? data.providers : [];
      const nextProviders = providers.slice(0, 3).map((provider, index) => {
        const professions = Array.isArray(provider.professions) ? provider.professions : [];
        const category = professions[0] || "Local Service";
        const backendRating = Number(provider?.averageRating ?? 0);
        const backendReviews = Number(provider?.totalReviews ?? 0);
        const fallbackPerformance = resolveProviderPerformance(provider, bookingList);
        const rating = Number.isFinite(backendRating) && backendReviews > 0
          ? backendRating
          : fallbackPerformance.reviews > 0 ? fallbackPerformance.rating : 0;
        const reviews = Number.isFinite(backendReviews) && backendReviews > 0
          ? backendReviews
          : fallbackPerformance.reviews;

        return {
          _id: provider._id,
          id: provider.id || provider._id,
          name: provider.fullName || provider.username || "Local pro",
          cred: professions.join(" · ") || "Local service provider",
          rating,
          reviews,
          category,
          accent: index === 0 ? "from-amber-100 via-orange-50 to-white" : index === 1 ? "from-teal-100 via-cyan-50 to-white" : "from-violet-100 via-fuchsia-50 to-white",
        };
      });

      setTopRatedProviders((current) => {
        const sameSnapshot = current.length === nextProviders.length && current.every((provider, index) => (
          provider.name === nextProviders[index].name &&
          provider.category === nextProviders[index].category &&
          provider.rating === nextProviders[index].rating &&
          provider.reviews === nextProviders[index].reviews
        ));
        return sameSnapshot ? current : nextProviders;
      });
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setTopRatedProvidersError(requestError.message || "Could not load nearby providers.");
        setTopRatedProviders([]);
      }
    } finally {
      if (requestRef.current === controller) {
        setTopRatedProvidersLoading(false);
      }
    }
  }, [bookingList, locationKey]);

  useEffect(() => {
    if (!locationKey) {
      setTopRatedProviders([]);
      setTopRatedProvidersLoading(false);
      return undefined;
    }

    let timeoutId = window.setTimeout(() => {
      void loadTopRatedProviders();
    }, 150);

    const handleDataSync = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        void loadTopRatedProviders();
      }, 150);
    };

    window.addEventListener("taskpanda:data-sync", handleDataSync);

    return () => {
      window.clearTimeout(timeoutId);
      if (requestRef.current) {
        requestRef.current.abort();
        requestRef.current = null;
      }
      window.removeEventListener("taskpanda:data-sync", handleDataSync);
    };
  }, [locationKey, loadTopRatedProviders]);

  const handleDismissBooking = (bookingId) => {
    const booking = bookingList.find((item) => item.id === bookingId);
    if (!booking || !canDismissBookingFromDashboard(booking)) {
      return;
    }

    setDismissedBookingIds((currentDismissals) => currentDismissals.includes(bookingId)
      ? currentDismissals
      : [...currentDismissals, bookingId]);
  };

  const handleRestoreDismissedBookings = () => {
    setDismissedBookingIds([]);
  };

  const toggleHistory = (bookingId) => {
    setExpandedHistoryIds((current) => ({
      ...current,
      [bookingId]: !current[bookingId],
    }));
  };

  const handleCancelBooking = async () => {
    if (!cancelingId || !cancelBooking || !canRequestCancellation(cancelBooking)) {
      throw new Error(cancelBooking ? getCancellationLockMessage(cancelBooking) || "Cancellation is only available while the booking is pending or confirmed." : "This booking is no longer available.");
    }
    await requestCancellation(cancelingId, "request", cancellationReason);
    setCancelingId(null);
    setCancellationReason("");
  };

  const handleProviderUpdateResponse = async (bookingId, updateId, action) => {
    try {
      await respondToProviderUpdate(bookingId, updateId, action);
    } catch (requestError) {
      window.alert(requestError.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <Header showNav activeTab="Home" />

      {enRouteBooking && (
        <div role="status" className="border-b border-cyan-200 bg-cyan-50 px-4 py-3 text-cyan-950 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
            <p className="text-sm font-semibold">{enRouteBooking.worker} is on the way for {enRouteBooking.task}.</p>
            <button onClick={() => navigate("/bookings")} className="shrink-0 text-sm font-semibold underline underline-offset-2">View booking</button>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
        <div className="space-y-8">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-700 via-slate-700 to-slate-800 px-6 py-10 sm:px-10 sm:py-12">
            <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute bottom-0 left-1/2 h-32 w-32 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute right-1/4 top-1/4 h-16 w-16 rounded-full bg-white/5" />

            <div className="pointer-events-none absolute -bottom-4 -right-2 hidden h-48 w-40 overflow-hidden sm:block md:right-8">
              <img
                src="/assets/Panda Cropped.png"
                alt="TaskPanda mascot"
                className="h-full w-full object-contain"
              />
            </div>

            <div className="relative z-10 max-w-lg">
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
                Find trusted local pros for your home
              </h1>
              <p className="mt-4 text-base leading-relaxed text-teal-100/80 sm:text-lg">
                TaskPanda connects with certified tradespeople and trusted
                independent local specialists.
              </p>

              <div className="mt-8 flex items-center overflow-hidden rounded-xl bg-white shadow-lg" style={{ scrollbarGutter: "auto" }}>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search for carpentry, plumbing, cleaning, or electrical services..."
                  className="flex-1 px-5 py-3.5 text-sm text-gray-800 placeholder-gray-400/70 outline-none"
                />
                <button className="shrink-0 bg-gray-800 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-gray-900">
                  Search
                </button>
              </div>
            </div>
          </div>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Explore Categories</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => scrollCategories("left")}
                  className="rounded-full border border-gray-200 bg-white p-1.5 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                  aria-label="Scroll left"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path d="M10 4L4 12l6 8V4z" />
                    <rect x="10" y="11" width="12" height="2" />
                  </svg>
                </button>
                <button
                  onClick={() => scrollCategories("right")}
                  className="rounded-full border border-gray-200 bg-white p-1.5 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                  aria-label="Scroll right"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path d="M14 4l6 8-6 8V4z" />
                    <rect x="2" y="11" width="12" height="2" />
                  </svg>
                </button>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("/explore");
                  }}
                  className="text-sm font-medium text-primary-600 hover:text-primary-800"
                >
                  View All
                </a>
              </div>
            </div>
            <div
              ref={catScrollRef}
              className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
              style={{ scrollbarWidth: "none" }}
            >
              {filteredCategories.map((cat) => (
                <div
                  key={cat.name}
                  onClick={() => navigate(`/explore?service=${encodeURIComponent(cat.name)}`)}
                  className="flex shrink-0 cursor-pointer flex-col items-center gap-2 rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm transition hover:shadow-md w-[120px]"
                >
                  <span className="text-2xl">{cat.icon}</span>
                  <span className="whitespace-nowrap text-xs font-medium text-gray-700">
                    {cat.name}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5" style={{ contain: "layout paint" }}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-600">Trusted picks</p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">Top Rated Local Pros</h2>
              </div>
              <button
                type="button"
                onClick={() => navigate("/explore")}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                Explore all
              </button>
            </div>

            {topRatedProvidersError && (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{topRatedProvidersError}</p>
            )}

            <div className="flex min-h-[220px] gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin", contain: "layout paint" }}>
              {visibleTopRatedProviders.length > 0 ? (
                visibleTopRatedProviders.map((pro) => {
                  const hasRatings = Number(pro.rating) > 0 && Number(pro.reviews) > 0;

                  return (
                    <div
                      key={`${pro.name}-${pro.category}`}
                      className={`group relative flex min-h-[190px] min-w-[260px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br ${pro.accent} p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white shadow-sm">
                          {pro.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-gray-900">{pro.name}</p>
                          <p className="truncate text-xs text-gray-600">{pro.cred}</p>
                        </div>
                        {token && (
                          <button
                            type="button"
                            aria-label={favoriteProviderIds.has(String(pro._id || pro.id || pro.name)) ? "Remove from favorites" : "Add to favorites"}
                            onClick={() => toggleFavorite(pro._id || pro.id || pro.name)}
                            className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${favoriteProviderIds.has(String(pro._id || pro.id || pro.name)) ? "border-rose-200 bg-rose-100 text-rose-600" : "border-gray-200 bg-white text-gray-500 hover:border-rose-200 hover:text-rose-600"}`}
                          >
                            <svg viewBox="0 0 24 24" fill={favoriteProviderIds.has(String(pro._id || pro.id || pro.name)) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                              <path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 0 1 6.5 4c1.74 0 3.41.81 4.5 2.09A6.12 6.12 0 0 1 15.5 4 4.5 4.5 0 0 1 20 8.5c0 3.78-3.4 6.86-8.55 11.5L12 21.35Z" />
                            </svg>
                          </button>
                        )}
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-amber-500">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span key={star} className={hasRatings && star <= Math.round(pro.rating) ? "text-amber-500" : "text-gray-300"}>★</span>
                          ))}
                          <span className="text-sm font-semibold text-gray-900">{hasRatings ? pro.rating.toFixed(1) : "New"}</span>
                        </div>
                        <span className="text-[11px] font-medium text-gray-500">{hasRatings ? `${pro.reviews} reviews` : "No ratings yet"}</span>
                      </div>

                      <div className="mt-4 flex items-center justify-start gap-2">
                        <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-700">
                          {pro.category}
                        </span>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => navigate("/explore")}
                          className="flex-1 rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-700"
                        >
                          Book now
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate("/profile")}
                          className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                        >
                          View profile
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex min-h-[200px] w-full items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 text-center">
                  <div>
                    <p className="text-base font-semibold text-gray-700">No nearby providers yet</p>
                    <p className="mt-1 text-sm text-gray-500">Trusted local pros will appear here once they are available.</p>
                  </div>
                </div>
              )}
            </div>

            {topRatedProvidersLoading && (
              <p className="mt-3 text-xs text-gray-500">Loading nearby top-rated pros…</p>
            )}
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Your Favourites</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => scroll("left")}
                  className="rounded-full border border-gray-200 bg-white p-1.5 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                  aria-label="Scroll left"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path d="M10 4L4 12l6 8V4z" />
                    <rect x="10" y="11" width="12" height="2" />
                  </svg>
                </button>
                <button
                  onClick={() => scroll("right")}
                  className="rounded-full border border-gray-200 bg-white p-1.5 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                  aria-label="Scroll right"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path d="M14 4l6 8-6 8V4z" />
                    <rect x="2" y="11" width="12" height="2" />
                  </svg>
                </button>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("/explore");
                  }}
                  className="text-sm font-medium text-primary-600 hover:text-primary-800"
                >
                  View All
                </a>
              </div>
            </div>
            <div
              ref={scrollRef}
              className="flex gap-3 overflow-x-auto pb-2"
              style={{ scrollbarWidth: "none" }}
            >
              {favoriteProviders.length > 0 ? (
                favoriteProviders.map((provider) => {
                  const normalizedId = String(provider?._id || provider?.id || "");
                  const providerName = provider.fullName || provider.username || "Provider";
                  const professions = Array.isArray(provider.professions) ? provider.professions : [];
                  const rating = Number(provider?.averageRating ?? 0);
                  const reviews = Number(provider?.totalReviews ?? 0);
                  const category = professions[0] || "Local Service";
                  const hasRatings = rating > 0 && reviews > 0;

                  return (
                    <div key={normalizedId} className="group relative flex min-h-[190px] min-w-[260px] flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white shadow-sm">
                          {providerName.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-gray-900">{providerName}</p>
                          <p className="truncate text-xs text-gray-600">{professions.join(" · ") || "Service provider"}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleFavorite(normalizedId)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-100 text-rose-600 transition hover:bg-rose-200"
                          aria-label="Remove from favorites"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                            <path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 0 1 6.5 4c1.74 0 3.41.81 4.5 2.09A6.12 6.12 0 0 1 15.5 4 4.5 4.5 0 0 1 20 8.5c0 3.78-3.4 6.86-8.55 11.5L12 21.35Z" />
                          </svg>
                        </button>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-amber-500">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span key={star} className={hasRatings && star <= Math.round(rating) ? "text-amber-500" : "text-gray-300"}>★</span>
                          ))}
                          <span className="text-sm font-semibold text-gray-900">{hasRatings ? rating.toFixed(1) : "New"}</span>
                        </div>
                        <span className="text-[11px] font-medium text-gray-500">{hasRatings ? `${reviews} reviews` : "No ratings yet"}</span>
                      </div>

                      <div className="mt-4 flex items-center justify-start gap-2">
                        <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-700">{category}</span>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <button type="button" onClick={() => navigate("/explore")} className="flex-1 rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-700">Book now</button>
                        <button type="button" onClick={() => navigate("/profile")} className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50">View profile</button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex min-w-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                  Save a provider as a favorite to see them here.
                </div>
              )}
            </div>
          </section>
      </div>

      <aside className="w-full shrink-0 lg:w-[420px]">
          <div className="sticky top-20 min-w-0 rounded-2xl border border-gray-200 bg-white shadow-sm shadow-gray-200/80">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-px bg-gray-100">
              {[
                { label: "Active", value: tabCounts.Active, color: "bg-white" },
                { label: "Completed", value: tabCounts.Completed, color: "bg-white" },
              ].map((s) => (
                <div key={s.label} className={`${s.color} px-4 py-3 text-center`}>
                  <p className="text-lg font-bold text-gray-900">{s.value}</p>
                  <p className="text-[11px] font-medium text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-base font-bold text-gray-900">
                Active Bookings
              </h2>
              <button
                onClick={() => navigate("/bookings")}
                className="text-sm font-medium text-primary-600 hover:text-primary-800"
              >
                See All &gt;
              </button>
            </div>
            {error && <p role="alert" className="border-b border-red-100 px-5 py-3 text-xs text-red-700">{error}</p>}
            {isLoading && <p className="border-b border-gray-100 px-5 py-3 text-xs text-gray-500">Loading bookings...</p>}
            <div className="flex w-full min-w-0 gap-1 overflow-x-auto border-b border-gray-100 px-5 py-3">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    activeTab === tab
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {tab}
                    <span
                      className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                        activeTab === tab
                          ? "bg-white/20 text-white"
                          : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {tabCounts[tab] ?? 0}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <label className="relative block px-4 pt-3">
              <span className="sr-only">Search bookings</span>
              <input type="search" value={bookingSearchQuery} onChange={(event) => setBookingSearchQuery(event.target.value)} placeholder="Search provider or repair" className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-7 top-[1.125rem] h-4 w-4 text-gray-400"><circle cx="10.8" cy="10.8" r="6.3" /><path strokeLinecap="round" d="m16 16 4.2 4.2" /></svg>
            </label>
            <div className="max-h-[520px] overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
              {hasDismissedBookings && (
                <div className="mb-3 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-[11px] text-gray-600">
                  <span>{dismissedBookingIds.length} hidden</span>
                  <button type="button" onClick={handleRestoreDismissedBookings} className="font-semibold text-primary-600 hover:text-primary-700">Restore</button>
                </div>
              )}
              {filteredBookings.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm font-medium text-gray-500">
                    {hasDismissedBookings
                      ? "No active bookings match this view."
                      : {
                          All: "No bookings yet. Start by booking a service.",
                          Pending: "No pending requests right now.",
                          Active: "No active bookings in progress.",
                          Completed: "No completed bookings yet.",
                          Cancelled: "No cancelled bookings.",
                          Declined: "No requests have been declined by a provider.",
                        }[activeTab] || "No bookings in this view."}
                  </p>
                  {hasDismissedBookings && (
                    <button type="button" onClick={handleRestoreDismissedBookings} className="mt-3 text-xs font-semibold text-primary-600 hover:text-primary-700">Restore dismissed bookings</button>
                  )}
                </div>
              ) : (
                filteredBookings.map((booking) => {
                  const canDismissBooking = canDismissBookingFromDashboard(booking);

                  return (
                    <div
                      key={booking.id}
                      className="mb-3 min-w-0 rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-gray-300 hover:bg-white hover:shadow-md active:translate-y-0"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <StatusBadge status={booking.status} />
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold tracking-[0.04em] text-white">
                            {booking.price}
                          </span>
                          {canDismissBooking && (
                            <button
                              type="button"
                              onClick={() => handleDismissBooking(booking.id)}
                              aria-label={`Dismiss ${booking.task} booking`}
                              title="Dismiss this booking from the dashboard"
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 transition-all duration-200 ease-out hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700 active:scale-95"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
                                <path d="M6 6l12 12M18 6L6 18" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      <BookingProgress status={booking.status} />
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                          {booking.worker.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {booking.worker}
                          </p>
                          <p className="truncate text-xs text-gray-500">{booking.cred}</p>
                        </div>
                      </div>
                      <div className="mt-3 border-t border-gray-200 pt-2.5">
                        <p className="break-words text-sm font-medium leading-relaxed text-gray-800">
                          {booking.task}
                        </p>
                        <p className="mt-1 break-words text-xs text-gray-500">{booking.date}</p>
                        {booking.status === "Cancellation Requested" && booking.cancellationExpiresAt && (
                          <p className="mt-1 text-xs text-amber-700">
                            Response due {new Date(booking.cancellationExpiresAt).toLocaleString()}
                          </p>
                        )}
                        {booking.cancellationOutcome === "rejected" && (
                          <p className="mt-1 text-xs text-red-700">The cancellation was declined. This booking remains active.</p>
                        )}
                        {booking.clientRating != null && (
                          <p className="mt-2 text-xs font-medium text-amber-700">Your review: <span className="inline-flex items-center gap-0.5">{[1, 2, 3, 4, 5].map((star) => (<span key={star} style={{ color: star <= Number(booking.clientRating || 0) ? "#fbbf24" : "#d1d5db", lineHeight: 1 }}>{"★"}</span>))}</span>{booking.clientReview ? ` · ${booking.clientReview}` : ""}</p>
                        )}
                        {booking.clientReviewPhotos?.length > 0 && (
                          <div className="mt-2 flex gap-2">
                            {booking.clientReviewPhotos.map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="Review attachment" className="h-12 w-12 rounded object-cover" /></a>)}
                          </div>
                        )}
                        {booking.providerUpdates?.map((update) => (
                          <div key={update.id} className="mt-2 rounded-md border border-cyan-100 bg-cyan-50 p-2 text-xs text-cyan-950">
                            <p className="font-semibold">Provider update{update.type === "reschedule" ? " · Time change requested" : ""}</p>
                            <p className="mt-1">{update.note}</p>
                            {update.type === "reschedule" && (
                              <>
                                <p className="mt-1">Proposed: {new Date(update.proposedServiceDate).toLocaleDateString()} at {update.proposedTimeSlot}</p>
                                {update.status === "pending" && booking.status === "Confirmed" && (
                                  <div className="mt-2 flex gap-2">
                                    <button onClick={() => handleProviderUpdateResponse(booking.id, update.id, "accept")} className="rounded border border-cyan-300 bg-white px-2 py-1 font-semibold">Accept</button>
                                    <button onClick={() => handleProviderUpdateResponse(booking.id, update.id, "reject")} className="rounded border border-cyan-300 bg-white px-2 py-1 font-semibold">Keep current time</button>
                                  </div>
                                )}
                                {update.status !== "pending" && <p className="mt-1 font-medium">Request {update.status}.</p>}
                              </>
                            )}
                          </div>
                        ))}
                        <div className="mt-2 break-words text-xs text-gray-600"><AddressActions address={booking.address} /></div>
                      </div>
                      {booking.statusHistory?.length > 0 && (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => toggleHistory(booking.id)}
                            className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-left text-[11px] font-semibold text-gray-700 transition-colors duration-200 hover:bg-gray-50"
                          >
                            <span>{expandedHistoryIds[booking.id] ? "Hide activity history" : "View activity history"}</span>
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={`h-4 w-4 transition-transform duration-200 ${expandedHistoryIds[booking.id] ? "rotate-180" : ""}`}
                              aria-hidden="true"
                            >
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </button>
                          <div className={`overflow-hidden transition-all duration-200 ease-out ${expandedHistoryIds[booking.id] ? "mt-2 max-h-96 opacity-100" : "max-h-0 opacity-0"}`}>
                            <BookingHistory events={booking.statusHistory} />
                          </div>
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => navigate(`/client/messages?bookingId=${booking.id}`)}
                          className="flex-1 rounded-xl bg-primary-600 py-2.5 text-[11px] font-semibold text-white transition-all duration-200 ease-out hover:bg-primary-700 active:scale-[0.98]"
                        >
                          Chat
                        </button>
                        {canRequestCancellation(booking) ? (
                          <button
                            onClick={() => setCancelingId(booking.id)}
                            className="flex-1 rounded-xl border border-red-200 bg-red-50 py-2.5 text-[11px] font-semibold text-red-600 transition-all duration-200 ease-out hover:bg-red-100 active:scale-[0.98]"
                          >
                            Cancel
                          </button>
                        ) : getCancellationLockMessage(booking) && (
                          <button type="button" disabled title={getCancellationLockMessage(booking)} className="flex-1 cursor-not-allowed rounded-lg bg-gray-100 py-2 text-xs font-semibold text-gray-500">Cancellation locked</button>
                        )}
                        <button
                          type="button"
                          onClick={() => navigate(booking.status === "Completed" && !booking.clientRating && hasMutualSettlement(booking) ? "/bookings" : "/profile")}
                          className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-[11px] font-semibold text-gray-700 transition-all duration-200 ease-out hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98]"
                        >
                          {booking.status === "Completed" && !booking.clientRating && hasMutualSettlement(booking) ? "Rate Provider" : booking.status === "Completed" && !booking.clientRating ? "Settlement pending" : "View Profile"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>
      {cancelingId && cancelBooking && canRequestCancellation(cancelBooking) && (
        <StatusChangeConfirmation
          nextStatus="Cancelled"
          canConfirm={!cancelBookingNeedsReason || Boolean(cancellationReason.trim())}
          onConfirm={handleCancelBooking}
          onClose={() => setCancelingId(null)}
        >
          <p className="mt-2 text-sm text-gray-600">{cancelBooking.task} with {cancelBooking.worker}</p>
          {cancelBookingNeedsReason && (
            <div className="mt-4">
              <label htmlFor="dashboard-cancellation-reason" className="mb-1.5 block text-sm font-medium text-gray-700">Brief cancellation reason</label>
              <textarea id="dashboard-cancellation-reason" value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} maxLength={500} rows={3} required placeholder="Why do you need to cancel?" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30" />
              <p className="mt-1 text-xs text-gray-500">The other participant can respond before this request expires.</p>
            </div>
          )}
        </StatusChangeConfirmation>
      )}
    </div>
  );
}
