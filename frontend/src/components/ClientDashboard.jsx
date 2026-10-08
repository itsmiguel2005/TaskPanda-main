import { apiFetch } from "../services/api.js";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useBookings } from "../context/BookingContext.jsx";
import Header from "./Header.jsx";
import BookingPriceBreakdown from "./BookingPriceBreakdown.jsx";
import BookingProgress from "./BookingProgress.jsx";
import BookingHistory from "./BookingHistory.jsx";
import BookingLocationMap from "./BookingLocationMap.jsx";
import ProviderStreak from "./ProviderStreak.jsx";
import { canRequestCancellation, getCancellationLockMessage } from "../utils/bookingCancellation.js";
import StatusChangeConfirmation from "./StatusChangeConfirmation.jsx";
import { BookingCardSkeletonList, SkeletonBlock } from "./Skeletons.jsx";
import ProviderProfileModal from "./ProviderProfileModal.jsx";
import RequestBookingModal from "./RequestBookingModal.jsx";
import UserOnlineStatus from "./UserOnlineStatus.jsx";
import { PROFESSIONS } from "../utils/professions.js";

export const categories = [
  {
    name: "All Services",
    icon: "house",
    tileClass: "from-rose-50 via-white to-orange-50 border-rose-100",
    iconClass: "bg-rose-100/80 text-rose-700",
  },
  ...PROFESSIONS.map((name) => {
    const professionStyles = {
      Electrician: ["bolt", "from-amber-50 via-white to-orange-50 border-amber-100", "bg-amber-100/80 text-amber-700"],
      Plumber: ["pipe", "from-cyan-50 via-white to-sky-50 border-cyan-100", "bg-cyan-100/80 text-cyan-700"],
      "Aircon Tech": ["snowflake", "from-sky-50 via-white to-indigo-50 border-sky-100", "bg-sky-100/80 text-sky-700"],
      Carpenter: ["hammer", "from-orange-50 via-white to-amber-50 border-orange-100", "bg-orange-100/80 text-orange-800"],
      Painter: ["paint", "from-fuchsia-50 via-white to-pink-50 border-fuchsia-100", "bg-fuchsia-100/80 text-fuchsia-700"],
      Welder: ["weld", "from-rose-50 via-white to-orange-50 border-rose-100", "bg-rose-100/80 text-rose-700"],
      "Construction Worker": ["hardhat", "from-yellow-50 via-white to-amber-50 border-yellow-100", "bg-yellow-100/80 text-yellow-800"],
      "Appliance Tech": ["appliance", "from-teal-50 via-white to-cyan-50 border-teal-100", "bg-teal-100/80 text-teal-700"],
      Housekeeper: ["broom", "from-lime-50 via-white to-emerald-50 border-lime-100", "bg-lime-100/80 text-lime-800"],
      "Home Chef": ["chef", "from-red-50 via-white to-orange-50 border-red-100", "bg-red-100/80 text-red-700"],
      Gardener: ["leaf", "from-green-50 via-white to-lime-50 border-green-100", "bg-green-100/80 text-green-700"],
      Disinfection: ["sparkles", "from-emerald-50 via-white to-teal-50 border-emerald-100", "bg-emerald-100/80 text-emerald-700"],
      "Delivery Rider": ["delivery", "from-blue-50 via-white to-cyan-50 border-blue-100", "bg-blue-100/80 text-blue-700"],
      "Transport Helper": ["transport", "from-blue-50 via-white to-sky-50 border-blue-100", "bg-blue-100/80 text-blue-700"],
      "IT Tech": ["laptop", "from-slate-100 via-white to-blue-50 border-slate-200", "bg-slate-200/80 text-slate-700"],
      "IT Repair": ["wrench", "from-stone-100 via-white to-amber-50 border-stone-200", "bg-stone-200/80 text-stone-700"],
    };
    const [icon, tileClass, iconClass] = professionStyles[name] || [
      "tools",
      "from-slate-50 via-white to-sky-50 border-slate-200",
      "bg-slate-100 text-slate-700",
    ];
    return {
      name,
      icon,
      tileClass,
      iconClass,
    };
  }),
];

function ProfessionIcon({ name }) {
  const paths = {
    house: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z" /><path d="M2 10h20" /></>,
    bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" />,
    pipe: <><path d="M4 3v5a4 4 0 0 0 4 4h8a4 4 0 0 1 4 4v5" /><path d="M2 3h4M18 21h4M14 10h4v4" /></>,
    snowflake: <><path d="M12 2v20M4 6l16 12M20 6 4 18" /><path d="m9 5 3-3 3 3M9 19l3 3 3-3M4 10 4 6l4-1M16 19l4-1v-4M16 5l4 1v4M8 19l-4-1v-4" /></>,
    hammer: <><path d="m14 5 5 5M12 7l5-5 5 5-5 5M3 21l10-10" /><path d="m2 18 4 4" /></>,
    paint: <><path d="M4 4h16v9H4zM8 13v5a2 2 0 0 0 4 0v-2a2 2 0 0 1 4 0" /><path d="M7 7h.01M11 7h.01M15 7h.01" /></>,
    weld: <><path d="m12 3 1.5 5.5L19 7l-3.5 4 3.5 4-5.5-1.5L12 19l-1.5-5.5L5 15l3.5-4L5 7l5.5 1.5L12 3Z" /><path d="M4 3v2M20 18v3M3 16v2" /></>,
    hardhat: <><path d="M3 14a9 9 0 0 1 18 0v2H3v-2ZM2 18h20M12 5v8" /><path d="M5 9 3 14M19 9l2 5" /></>,
    appliance: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M5 8h14M8 5h.01M11 5h.01M9 12h6v6H9z" /></>,
    broom: <><path d="m15 3 6 6M13 5l6 6M4 20l10-10M3 21l-1-1 5-5 3 3-5 5-2-2Z" /><path d="m13 5 6 6" /></>,
    chef: <><path d="M6 11a4 4 0 1 1 2-7 4 4 0 1 1 8 0 4 4 0 1 1 2 7v9H6v-9Z" /><path d="M6 15h12" /></>,
    leaf: <><path d="M20 4c-8 0-14 2-14 9a6 6 0 0 0 6 6c7 0 8-7 8-15Z" /><path d="M3 21c3-6 7-9 13-12" /></>,
    sparkles: <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15ZM5 2l.7 2.3L8 5l-2.3.7L5 8l-.7-2.3L2 5l2.3-.7L5 2Z" /></>,
    delivery: <><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="19" r="2" /><circle cx="18" cy="19" r="2" /><path d="M5 9h5" /></>,
    transport: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 9h10M7 15h.01M12 15h.01M17 15h.01" /></>,
    laptop: <><rect x="5" y="3" width="14" height="13" rx="1" /><path d="M2 20h20l-2-4H4l-2 4Z" /><path d="M10 18h4" /></>,
    wrench: <><path d="M14.5 6.5a5 5 0 0 0-6.8 6.8L3 18l3 3 4.7-4.7a5 5 0 0 0 6.8-6.8l-3 3-3-3 3-3Z" /></>,
    tools: <><path d="m14 7 3-3 4 4-3 3M3 21l11-11M5 4l4 4M3 6l4-4 4 4-4 4M14 14l6 6" /></>,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-6 w-6"
    >
      {paths[name] || paths.tools}
    </svg>
  );
}

function hasMutualSettlement(booking) {
  return Boolean((booking?.clientConfirmedCash || booking?.cashPaidConfirmedAt) && (booking?.providerConfirmedCash || booking?.cashReceivedConfirmedAt));
}

function formatPhpAmount(value) {
  const amount = Number(value);
  return `₱${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

function VerifiedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700" aria-label="Verified provider">
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3 w-3">
        <path fillRule="evenodd" d="M10 1.667a2.5 2.5 0 0 1 2.357 1.666h1.81a2.5 2.5 0 0 1 2.5 2.5v1.81a2.5 2.5 0 0 1 0 4.714v1.81a2.5 2.5 0 0 1-2.5 2.5h-1.81a2.5 2.5 0 0 1-4.714 0h-1.81a2.5 2.5 0 0 1-2.5-2.5v-1.81a2.5 2.5 0 0 1 0-4.714v-1.81a2.5 2.5 0 0 1 2.5-2.5h1.81A2.5 2.5 0 0 1 10 1.667Zm3.09 6.75a.75.75 0 0 0-1.18-.92l-2.74 3.52-1.08-1.08a.75.75 0 0 0-1.06 1.06l1.68 1.68a.75.75 0 0 0 1.12-.07l3.26-4.19Z" clipRule="evenodd" />
      </svg>
      Verified
    </span>
  );
}

function TesdaBadges({ certificates = [] }) {
  const approvedCertificates = certificates.filter(
    (certificate) => String(certificate.status || "").toLowerCase() === "approved"
  );
  const firstCertificate = approvedCertificates[0];
  if (!firstCertificate) return null;

  return (
    <>
      <span
        className="inline-flex max-w-full items-center rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[9px] font-semibold text-green-800"
        aria-label={`TESDA certified: ${firstCertificate.trade}`}
        title={`TESDA · ${firstCertificate.trade}`}
      >
        <span className="truncate">TESDA · {firstCertificate.trade}</span>
      </span>
      {approvedCertificates.length > 1 && (
        <span className="inline-flex items-center rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[9px] font-semibold text-green-800">
          +{approvedCertificates.length - 1}
        </span>
      )}
    </>
  );
}

function DashboardProviderCard({
  name,
  profession,
  profileImage,
  lastActive,
  isOnline,
  rating,
  reviews,
  category,
  professions = [],
  onTimeStreak,
  tesdaCertificates,
  isVerified,
  isFavorite,
  onToggleFavorite,
  onBook,
  onViewProfile,
}) {
  const hasRatings = Number(rating) > 0 && Number(reviews) > 0;

  return (
    <article className="group relative flex h-60 w-65 shrink-0 flex-col rounded-xl border border-sky-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_14px_32px_rgba(15,23,42,0.07)]">
      <div className="flex h-7 shrink-0 items-center justify-end">
        <ProviderStreak streak={onTimeStreak} className="max-w-full" />
      </div>

      <div className="flex h-11 shrink-0 items-center gap-2">
        <div className="relative h-11 w-11 shrink-0">
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-slate-900 text-sm font-bold text-white">
            {profileImage ? <img src={profileImage} alt={`${name} profile`} className="h-full w-full object-cover" /> : name.charAt(0)}
          </div>
          <UserOnlineStatus lastActive={lastActive} isOnline={isOnline} className="absolute -bottom-0.5 -right-0.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{name}</p>
          <p className="truncate text-xs text-slate-600">{profession}</p>
        </div>
        {onToggleFavorite && (
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={isFavorite}
            className={`dashboard-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${isFavorite ? "border-rose-200 bg-rose-100 text-rose-600" : "border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-600"}`}
          >
            <svg viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
              <path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 0 1 6.5 4c1.74 0 3.41.81 4.5 2.09A6.12 6.12 0 0 1 15.5 4 4.5 4.5 0 0 1 20 8.5c0 3.78-3.4 6.86-8.55 11.5L12 21.35Z" />
            </svg>
          </button>
        )}
      </div>

      <div className="mt-2 flex h-5 shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-amber-500" aria-label={hasRatings ? `${Number(rating).toFixed(1)} out of 5 stars` : "No ratings yet"}>
          {[1, 2, 3, 4, 5].map((star) => (
            <span key={star} className={hasRatings && star <= Math.round(Number(rating)) ? "text-amber-500" : "text-slate-300"} aria-hidden="true">★</span>
          ))}
          <span className="text-sm font-semibold text-slate-900">{hasRatings ? Number(rating).toFixed(1) : "New"}</span>
        </div>
        <span className="truncate text-[10px] font-medium text-slate-500">{hasRatings ? `${reviews} reviews` : "No ratings yet"}</span>
      </div>

      <div className="mt-2 flex h-12 shrink-0 flex-col gap-1 overflow-hidden">
        <div className="flex h-5 shrink-0 gap-1 overflow-hidden">
          {(professions.length ? professions : [category]).slice(0, 3).map((item) => (
            <span key={item} className="inline-flex max-w-[30%] min-w-0 shrink items-center rounded-full border border-sky-100 bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-950">
              <span className="truncate">{item}</span>
            </span>
          ))}
          {professions.length > 3 && (
            <span className="inline-flex shrink-0 items-center rounded-full border border-sky-100 bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-950">
              +{professions.length - 3}
            </span>
          )}
        </div>
        <div className="flex h-5 shrink-0 gap-1 overflow-hidden">
          {isVerified && <VerifiedBadge />}
          <TesdaBadges certificates={tesdaCertificates} />
        </div>
      </div>

      <div className="mt-auto flex h-8 shrink-0 gap-2">
        <button type="button" onClick={onBook} className="dashboard-primary-button dashboard-focus flex-1 px-3 py-1.5 text-xs">
          Book now
        </button>
        <button type="button" onClick={onViewProfile} className="dashboard-secondary-button dashboard-focus flex-1 px-3 py-1.5 text-xs">
          View profile
        </button>
      </div>
    </article>
  );
}

function StatusBadge({ status }) {
  const colors = {
    "Pending Request": "bg-amber-100 text-amber-700 border-amber-200",
    Confirmed: "bg-green-100 text-green-700 border-green-200",
    "On the Way": "bg-cyan-100 text-cyan-800 border-cyan-200",
    "In Progress": "bg-blue-100 text-blue-700 border-blue-200",
    Completed: "bg-blue-100 text-blue-700 border-blue-200",
    Settled: "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Cancellation Requested": "bg-amber-100 text-amber-700 border-amber-200",
    Cancelled: "bg-red-100 text-red-700 border-red-200",
    "Declined by Provider": "bg-rose-100 text-rose-800 border-rose-200",
    Expired: "bg-slate-100 text-slate-700 border-slate-200",
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

function normalizeDashboardLocality(value) {
  return String(value || "")
    .trim()
    .replace(/^(city|municipality)\s+of\s+(.+)$/i, "$2 $1");
}

function getDashboardServiceArea(user) {
  const profileCity = user?.city || user?.municipality || user?.town;
  if (typeof profileCity === "string" && profileCity.trim()) {
    return normalizeDashboardLocality(profileCity);
  }

  const address = user?.serviceArea?.address
    || user?.searchLocation?.address
    || user?.address
    || "";
  const addressParts = String(address).split(",").map((part) => part.trim()).filter(Boolean);
  const namedCity = addressParts.find((part) => /\b(?:city|municipality)$/i.test(part));
  if (namedCity) return normalizeDashboardLocality(namedCity);

  const provinceIndex = addressParts.findIndex((part) => /^Pangasinan$/i.test(part));
  if (provinceIndex > 0) return normalizeDashboardLocality(addressParts[provinceIndex - 1]);

  return "Dagupan & Urdaneta";
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLoggedIn, user, token } = useAuth();
  const serviceArea = getDashboardServiceArea(user);
  const { bookings: bookingList, dismissedBookingIds, isLoading, error, dismissDashboardBooking, restoreDashboardBookings, requestCancellation, respondToProviderUpdate, createBooking } = useBookings();
  const isInitialBookingsLoading = isLoading && bookingList.length === 0;
  const [bannerVisible, setBannerVisible] = useState(true);
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");
  const [bookingSearchQuery, setBookingSearchQuery] = useState("");
  const [cancelingId, setCancelingId] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [expandedHistoryIds, setExpandedHistoryIds] = useState({});
  const [favoriteProviderIds, setFavoriteProviderIds] = useState(new Set());
  const [favoriteProviders, setFavoriteProviders] = useState([]);
  const [topRatedProviders, setTopRatedProviders] = useState([]);
  const [viewingProfileProvider, setViewingProfileProvider] = useState(null);
  const [bookingProvider, setBookingProvider] = useState(null);
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

  const tabs = ["All", "Pending", "Active", "Completed", "Cancelled", "Declined", "Expired"];
  const dashboardDismissableStatuses = new Set(["Completed", "Settled", "Cancelled", "Declined by Provider"]);
  const nonDismissedBookingList = bookingList;

  const canDismissBookingFromDashboard = (booking) => dashboardDismissableStatuses.has(String(booking?.status || ""));

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
    Expired: nonDismissedBookingList.filter((b) => b.status === "Expired").length,
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
    if (activeTab === "Expired") return booking.status === "Expired";
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
        const response = await apiFetch("/api/client/favorites", {
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
    const presenceRefreshInterval = window.setInterval(() => {
      void refreshFavoriteProviders();
    }, 15_000);
    return () => {
      active = false;
      window.clearInterval(presenceRefreshInterval);
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
        const response = await apiFetch("/api/client/favorites", {
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
        ? await apiFetch(`/api/client/favorites/${normalizedProviderId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          })
        : await apiFetch("/api/client/favorites", {
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
      maxKm: "10",
      limit: "50",
    });

    try {
      const response = await apiFetch(`/api/providers?${params.toString()}`, { signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load nearby providers.");

      const providers = Array.isArray(data.providers) ? data.providers : [];
      const nextProviders = providers.map((provider) => {
        const professions = Array.isArray(provider.professions) ? provider.professions : [];
        const category = professions[0] || "Local Service";
        const backendRating = Number(provider?.averageRating ?? 0);
        const backendReviews = Number(provider?.totalReviews ?? 0);
        const rating = Number.isFinite(backendRating) ? backendRating : 0;
        const reviews = Number.isFinite(backendReviews) ? backendReviews : 0;

        return {
          ...provider,
          _id: provider._id,
          id: provider.id || provider._id,
          name: provider.fullName || provider.username || "Local pro",
          cred: professions.join(" · ") || "Local service provider",
          profileImage: provider.profileImage || "",
          isVerified: provider.isVerified === true || provider.verificationStatus === "verified",
          rating,
          reviews,
          category,
          tesdaCertificates: (provider.tesdaCertificates || [])
            .filter((certificate) => String(certificate.status || "").toLowerCase() === "approved"),
          onTimeStreak: provider.onTimeStreak,
        };
      })
        .sort((first, second) => (
          second.rating - first.rating
          || second.reviews - first.reviews
          || first.name.localeCompare(second.name)
        ))
        .slice(0, 3);

      setTopRatedProviders((current) => {
        const sameSnapshot = current.length === nextProviders.length && current.every((provider, index) => (
          provider.name === nextProviders[index].name &&
          provider.category === nextProviders[index].category &&
          provider.professions?.join("|") === nextProviders[index].professions?.join("|") &&
          provider.rating === nextProviders[index].rating &&
          provider.reviews === nextProviders[index].reviews &&
          provider.isVerified === nextProviders[index].isVerified &&
          provider.tesdaCertificates?.map((certificate) => certificate.trade).join("|") ===
            nextProviders[index].tesdaCertificates.map((certificate) => certificate.trade).join("|") &&
          provider.onTimeStreak?.count === nextProviders[index].onTimeStreak?.count &&
          provider.onTimeStreak?.milestone === nextProviders[index].onTimeStreak?.milestone
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
  }, [locationKey]);

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
    const presenceRefreshInterval = window.setInterval(() => {
      void loadTopRatedProviders();
    }, 15_000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(presenceRefreshInterval);
      if (requestRef.current) {
        requestRef.current.abort();
        requestRef.current = null;
      }
      window.removeEventListener("taskpanda:data-sync", handleDataSync);
    };
  }, [locationKey, loadTopRatedProviders]);

  const handleDismissBooking = async (bookingId) => {
    const booking = bookingList.find((item) => item.id === bookingId);
    if (!booking || !canDismissBookingFromDashboard(booking)) {
      return;
    }

    await dismissDashboardBooking(bookingId);
  };

  const handleRestoreDismissedBookings = async () => {
    await restoreDashboardBookings();
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
    <div className="dashboard-page">
      <Header showNav activeTab="Home" />

      {enRouteBooking && (
        <div role="status" className="border-b border-cyan-200 bg-cyan-50 px-4 py-3 text-cyan-950 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-400 items-center justify-between gap-4">
            <p className="text-sm font-semibold">{enRouteBooking.worker} is on the way for {enRouteBooking.task}.</p>
            <button onClick={() => navigate("/bookings")} className="shrink-0 text-sm font-semibold underline underline-offset-2">View booking</button>
          </div>
        </div>
      )}

      <div className="dashboard-shell grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-8">
          <div className="dashboard-panel grid gap-5 p-5 sm:p-8">
            <div className="grid min-w-0 items-center gap-x-6 gap-y-5 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,19rem)]">
              <div className="min-w-0 max-w-2xl">
                <p className="dashboard-kicker">Your home service dashboard</p>
                <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">
                  Find trusted local <span className="text-blue-600">pros for your home</span>
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
                  TaskPanda connects with certified tradespeople and trusted
                  independent local specialists.
                </p>
              </div>
              <div className="flex min-w-0 items-center justify-end gap-3">
                <p className="relative min-w-0 max-w-xs flex-1 rounded-2xl border border-sky-100 bg-white px-3.5 py-3 text-xs font-medium leading-snug text-slate-700 shadow-md after:absolute after:right-[-0.4rem] after:top-1/2 after:h-3 after:w-3 after:-translate-y-1/2 after:rotate-45 after:border-r after:border-t after:border-sky-100 after:bg-white sm:px-4 sm:text-sm">
                  Need help around the house? Find trusted local pros in {serviceArea} instantly!
                </p>
                <img
                  src="/assets/Panda Cropped.png"
                  alt="TaskPanda panda mascot"
                  className="dashboard-mascot-float h-28 w-24 shrink-0 object-contain object-bottom sm:h-36 sm:w-28"
                />
              </div>
            </div>
            <div className="flex min-w-0 items-center overflow-hidden rounded-xl border border-sky-100 bg-sky-50/60 p-1.5 shadow-sm transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/30">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search for carpentry, plumbing, cleaning, or electrical services..."
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-slate-800 placeholder-slate-500 outline-none"
              />
              <button type="button" className="dashboard-primary-button dashboard-focus shrink-0 px-5 py-3 text-sm">
                Search
              </button>
            </div>
          </div>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Explore Categories</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => scrollCategories("left")}
                  className="dashboard-secondary-button dashboard-focus rounded-full p-1.5 text-slate-500 hover:text-slate-800"
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
                  className="dashboard-secondary-button dashboard-focus rounded-full p-1.5 text-slate-500 hover:text-slate-800"
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
                  className="text-sm font-semibold text-blue-700 underline-offset-4 hover:text-blue-800 hover:underline"
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
                  className={`flex w-30 shrink-0 cursor-pointer flex-col items-center gap-2 rounded-xl border bg-linear-to-br px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.07)] ${cat.tileClass}`}
                >
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${cat.iconClass}`}>
                    <ProfessionIcon name={cat.icon} />
                  </span>
                  <span className="whitespace-nowrap text-xs font-medium text-gray-700">
                    {cat.name}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="min-w-0" style={{ contain: "layout paint" }}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="dashboard-kicker">Trusted picks</p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Top Rated Local Pros</h2>
              </div>
              <button
                type="button"
                onClick={() => navigate("/explore")}
                className="dashboard-secondary-button dashboard-focus px-3 py-1.5 text-xs"
              >
                Explore all
              </button>
            </div>

            {topRatedProvidersError && (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{topRatedProvidersError}</p>
            )}

            <div className="flex min-h-55 gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin", contain: "layout paint" }}>
              {topRatedProvidersLoading && visibleTopRatedProviders.length === 0 ? (
                <div role="status" aria-label="Loading nearby top-rated professionals" aria-busy="true" className="flex min-w-max gap-3">
                  {Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="h-60 w-65 shrink-0 rounded-xl border border-sky-100 bg-white p-4">
                      <SkeletonBlock className="h-7 w-1/3" />
                      <SkeletonBlock className="mt-1 h-11 w-full" />
                      <SkeletonBlock className="mt-2 h-5 w-full" />
                      <SkeletonBlock className="mt-2 h-12 w-full" />
                      <SkeletonBlock className="mt-3 h-8 w-full" />
                    </div>
                  ))}
                </div>
              ) : visibleTopRatedProviders.length > 0 ? (
                visibleTopRatedProviders.map((pro) => {
                  const isVerified = pro.isVerified || favoriteProviders.some(
                    (provider) => String(provider?._id || provider?.id) === String(pro._id || pro.id)
                      && (provider.isVerified === true || provider.verificationStatus === "verified")
                  );

                  return (
                    <DashboardProviderCard
                      key={String(pro._id || pro.id || pro.name)}
                      name={pro.name}
                      profession={pro.cred}
                      profileImage={pro.profileImage}
                      lastActive={pro.lastActive}
                      isOnline={pro.isOnline}
                      rating={pro.rating}
                      reviews={pro.reviews}
                      category={pro.category}
                      professions={pro.professions}
                      onTimeStreak={pro.onTimeStreak}
                      tesdaCertificates={pro.tesdaCertificates}
                      isVerified={isVerified}
                      isFavorite={favoriteProviderIds.has(String(pro._id || pro.id || pro.name))}
                      onToggleFavorite={token ? () => toggleFavorite(pro._id || pro.id || pro.name) : undefined}
                      onBook={() => setBookingProvider(pro)}
                      onViewProfile={() => setViewingProfileProvider(pro)}
                    />
                  );
                })
              ) : (
                <div className="flex min-h-50 w-full items-center justify-center rounded-xl border border-dashed border-sky-200 bg-sky-50/50 px-4 text-center">
                  <div>
                    <p className="text-base font-semibold text-gray-700">No nearby providers yet</p>
                    <p className="mt-1 text-sm text-gray-500">Trusted local pros will appear here once they are available.</p>
                  </div>
                </div>
              )}
            </div>

          </section>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Your favourites</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => scroll("left")}
                  className="dashboard-secondary-button dashboard-focus rounded-full p-1.5 text-slate-500 hover:text-slate-800"
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
                  className="dashboard-secondary-button dashboard-focus rounded-full p-1.5 text-slate-500 hover:text-slate-800"
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
                  className="text-sm font-semibold text-blue-700 underline-offset-4 hover:text-blue-800 hover:underline"
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

                  return (
                    <DashboardProviderCard
                      key={normalizedId}
                      name={providerName}
                      profession={professions.join(" · ") || "Service provider"}
                      profileImage={provider.profileImage}
                      lastActive={provider.lastActive}
                      isOnline={provider.isOnline}
                      rating={rating}
                      reviews={reviews}
                      category={category}
                      professions={professions}
                      onTimeStreak={provider.onTimeStreak}
                      tesdaCertificates={provider.tesdaCertificates}
                      isVerified={provider.isVerified === true || provider.verificationStatus === "verified"}
                      isFavorite
                      onToggleFavorite={() => toggleFavorite(normalizedId)}
                      onBook={() => setBookingProvider(provider)}
                      onViewProfile={() => setViewingProfileProvider(provider)}
                    />
                  );
                })
              ) : (
                <div className="flex min-w-full items-center justify-center rounded-xl border border-dashed border-sky-200 bg-sky-50/50 px-6 py-10 text-center text-sm text-blue-950">
                  Save a provider as a favorite to see them here.
                </div>
              )}
            </div>
          </section>
      </div>

      <aside className="w-full shrink-0 lg:w-105">
          <div className="sticky top-20 min-w-0 border-y border-sky-100 bg-white/80">
            {/* Summary */}
            <div className="grid grid-cols-2 divide-x divide-sky-100 border-b border-sky-100">
              {[
                { label: "Active", value: tabCounts.Active, color: "bg-white" },
                { label: "Completed", value: tabCounts.Completed, color: "bg-white" },
              ].map((s) => (
                <div key={s.label} className="px-4 py-3 text-center">
                  <p className="text-2xl font-extrabold tabular-nums text-slate-900">{s.value}</p>
                  <p className="dashboard-kicker mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-b border-sky-100 px-5 py-4">
              <h2 className="text-base font-bold tracking-tight text-slate-900">
                Active Bookings
              </h2>
              <div className="flex items-center gap-3">
                {dismissedBookingIds.length > 0 && (
                  <button type="button" onClick={handleRestoreDismissedBookings} className="text-xs font-semibold text-blue-700 underline-offset-4 hover:text-blue-800 hover:underline">
                    Restore hidden
                  </button>
                )}
                <button
                  onClick={() => navigate("/bookings")}
                  className="text-sm font-semibold text-blue-700 underline-offset-4 hover:text-blue-800 hover:underline"
                >
                  See All &gt;
                </button>
              </div>
            </div>
            {error && <p role="alert" className="border-b border-red-100 px-5 py-3 text-xs text-red-700">{error}</p>}
            <div className="flex w-full min-w-0 gap-1 overflow-x-auto border-b border-sky-100 px-5 py-3">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    activeTab === tab
                      ? "bg-slate-900 text-white"
                      : "bg-sky-50 text-blue-950 hover:bg-sky-100"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {tab}
                    <span
                      className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                        activeTab === tab
                          ? "bg-white/20 text-white"
                          : "bg-white text-slate-500"
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
              <input type="search" value={bookingSearchQuery} onChange={(event) => setBookingSearchQuery(event.target.value)} placeholder="Search provider or repair" className="w-full rounded-lg border border-sky-100 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20" />
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-7 top-4.5 h-4 w-4 text-gray-400"><circle cx="10.8" cy="10.8" r="6.3" /><path strokeLinecap="round" d="m16 16 4.2 4.2" /></svg>
            </label>
            <div className="max-h-130 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
              {isInitialBookingsLoading ? (
                <BookingCardSkeletonList count={2} label="Loading bookings" />
              ) : filteredBookings.length === 0 ? (
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
                          Expired: "No expired requests.",
                        }[activeTab] || "No bookings in this view."}
                  </p>
                </div>
              ) : (
                filteredBookings.map((booking) => {
                  const canDismissBooking = canDismissBookingFromDashboard(booking);

                  return (
                    <div
                      key={booking.id}
                      className="content-arrive mb-3 min-w-0 rounded-xl border border-sky-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.035)] transition-[border-color,box-shadow] duration-200 ease-out hover:border-blue-200 hover:shadow-[0_14px_32px_rgba(15,23,42,0.07)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <StatusBadge status={booking.status} />
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold tabular-nums text-blue-950 ring-1 ring-inset ring-sky-100">
                            {formatPhpAmount(booking.totalPrice ?? booking.offeredPrice ?? booking.offer)}
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
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sky-100 bg-sky-50 text-xs font-bold text-blue-950">
                            {booking.workerProfileImage ? <img src={booking.workerProfileImage} alt={`${booking.worker} profile`} className="h-full w-full object-cover" /> : booking.worker.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {booking.worker}
                          </p>
                          <p className="truncate text-xs text-gray-500">{booking.cred}</p>
                        </div>
                      </div>
                      <div className="mt-3 border-t border-sky-100 pt-2.5">
                        <p className="wrap-break-word text-sm font-medium leading-relaxed text-gray-800">
                          {booking.task}
                        </p>
                        <p className="mt-1 wrap-break-word text-xs text-gray-500">{booking.date}</p>
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
                        <div className="mt-2"><BookingLocationMap address={booking.address} serviceGeoLocation={booking.serviceGeoLocation} /></div>
                      </div>
                      <BookingPriceBreakdown booking={booking} className="mt-3" />
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
                          className="dashboard-primary-button dashboard-focus flex-1 py-2.5 text-[11px]"
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
                          {booking.status === "Pending Request" ? "Negotiate" : booking.status === "Completed" && !booking.clientRating && hasMutualSettlement(booking) ? "Rate Provider" : booking.status === "Completed" && !booking.clientRating ? "Settlement pending" : "View Profile"}
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
      <ProviderProfileModal
        provider={viewingProfileProvider}
        onClose={() => setViewingProfileProvider(null)}
        isFavorite={viewingProfileProvider
          ? favoriteProviderIds.has(String(viewingProfileProvider._id || viewingProfileProvider.id || ""))
          : false}
        onToggleFavorite={token && viewingProfileProvider?._id
          ? () => toggleFavorite(viewingProfileProvider._id)
          : undefined}
        onBook={(selectedProvider) => {
          setBookingProvider({
            ...selectedProvider,
            _id: selectedProvider?._id || selectedProvider?.id,
            fullName: selectedProvider?.fullName || selectedProvider?.name,
            professions: selectedProvider?.professions || viewingProfileProvider?.professions || [],
          });
          setViewingProfileProvider(null);
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
