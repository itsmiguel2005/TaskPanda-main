import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ProviderStreak from "./ProviderStreak.jsx";

function StarRating({ rating }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4 text-amber-500">
        <path d="m10 1.7 2.55 5.17 5.7.83-4.13 4.03.98 5.68L10 14.73l-5.1 2.68.97-5.68L1.75 7.7l5.7-.83L10 1.7Z" />
      </svg>
      {rating.toFixed(1)}
    </span>
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
        <path fillRule="evenodd" d="M10 1.667a2.5 2.5 0 0 1 2.357 1.666h1.81a2.5 2.5 0 0 1 2.5 2.5v1.81a2.5 2.5 0 0 1 0 4.714v1.81a2.5 2.5 0 0 1-2.5 2.5h-1.81a2.5 2.5 0 0 1-4.714 0h-1.81a2.5 2.5 0 0 1-2.5-2.5v-1.81a2.5 2.5 0 0 1 0-4.714v-1.81a2.5 2.5 0 0 1 2.5-2.5h1.81A2.5 2.5 0 0 1 10 1.667Zm3.09 6.75a.75.75 0 0 0-1.18-.92l-2.74 3.52-1.08-1.08a.75.75 0 0 0-1.06 1.06l1.68 1.68a.75.75 0 0 0 1.12-.07l3.26-4.19Z" clipRule="evenodd" />
      </svg>
      ID verified
    </span>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function formatReviewDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
}

function getBioPreview(value) {
  const bio = String(value || "").trim();
  if (!bio) return "This provider has not added a professional introduction yet.";
  const sentences = bio.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return sentences ? sentences.slice(0, 3).join(" ").trim() : bio;
}

export default function ProviderProfileModal({
  provider,
  onClose,
  onBook,
  isFavorite = false,
  onToggleFavorite,
}) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const reviewsScrollerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const providerId = provider?._id || provider?.id;
  const isOpen = Boolean(provider);
  const name = profile?.name || provider?.name || provider?.fullName || provider?.username || "Local provider";
  const professions = profile?.professions || provider?.professions || [provider?.category].filter(Boolean);
  const image = profile?.profileImage || provider?.profileImage || "";
  const rating = Number(profile?.averageRating ?? provider?.rating ?? provider?.averageRating ?? 0);
  const reviewsCount = Number(profile?.totalReviews ?? provider?.reviews ?? provider?.totalReviews ?? 0);
  const certificates = profile?.tesdaCertificates || provider?.tesdaCertificates || [];
  const verified = profile?.verified ?? (provider?.isVerified === true || provider?.verificationStatus === "verified");
  const reviews = profile?.reviews || [];
  const areas = profile?.serviceAreas || [ [provider?.city, provider?.province].filter(Boolean).join(", ") ].filter(Boolean);
  onCloseRef.current = onClose;

  const scrollReviews = (direction) => {
    reviewsScrollerRef.current?.scrollBy({
      left: direction * Math.round(reviewsScrollerRef.current.clientWidth * 0.82),
      behavior: "smooth",
    });
  };

  useEffect(() => {
    if (!providerId) return undefined;
    const controller = new AbortController();
    setProfile(null);
    setError("");
    fetch(`/api/providers/${encodeURIComponent(providerId)}/profile`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Could not load this provider's profile.");
        if (!data.provider || !Array.isArray(data.provider.reviews)) {
          throw new Error("The server returned an incomplete provider profile. Refresh and try again.");
        }
        setProfile(data.provider);
      })
      .catch((requestError) => {
        if (requestError.name !== "AbortError") setError(requestError.message || "Could not load this provider's profile.");
      });
    return () => controller.abort();
  }, [providerId, retry]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll("button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [isOpen]);

  if (!provider || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="provider-profile-title"
        className="dashboard-panel flex max-h-[min(90dvh,820px)] w-full max-w-2xl flex-col overflow-hidden shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
      >
        <header className="flex shrink-0 items-start gap-4 border-b border-sky-100 px-5 py-5 sm:px-7">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sky-100 bg-sky-50 text-lg font-bold text-blue-950 sm:h-[4.5rem] sm:w-[4.5rem]">
            {image ? <img src={image} alt={`${name} profile`} className="h-full w-full object-cover" /> : name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h2 id="provider-profile-title" className="truncate text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{name}</h2>
            <p className="mt-1 truncate text-sm font-medium text-slate-600">{professions.join(" · ") || "Local service provider"}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {verified && <VerifiedBadge />}
              {certificates.map((certificate) => (
                <span key={certificate.trade || "tesda"} className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-800">
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
                    <path fillRule="evenodd" d="M10 1.667a2.5 2.5 0 0 1 2.357 1.666h1.81a2.5 2.5 0 0 1 2.5 2.5v1.81a2.5 2.5 0 0 1 0 4.714v1.81a2.5 2.5 0 0 1-2.5 2.5h-1.81a2.5 2.5 0 0 1-4.714 0h-1.81a2.5 2.5 0 0 1-2.5-2.5v-1.81a2.5 2.5 0 0 1 0-4.714v-1.81a2.5 2.5 0 0 1 2.5-2.5h1.81A2.5 2.5 0 0 1 10 1.667Z" clipRule="evenodd" />
                    <path d="m7.4 10.2 1.7 1.7 3.5-3.6" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                  </svg>
                  TESDA{certificate.trade ? ` · ${certificate.trade}` : " certified"}
                </span>
              ))}
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={onToggleFavorite}
                  aria-pressed={isFavorite}
                  aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                  className={`dashboard-focus inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition ${
                    isFavorite
                      ? "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                      : "border-sky-100 bg-white text-blue-950 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill={isFavorite ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                  >
                    <path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 0 1 6.5 4c1.74 0 3.41.81 4.5 2.09A6.12 6.12 0 0 1 15.5 4 4.5 4.5 0 0 1 20 8.5c0 3.78-3.4 6.86-8.55 11.5L12 21.35Z" />
                  </svg>
                  {isFavorite ? "Saved" : "Save"}
                </button>
              )}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close provider profile"
            className="dashboard-focus flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-blue-950 transition hover:bg-sky-50 hover:text-blue-950"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid grid-cols-3 divide-x divide-sky-100 rounded-xl border border-sky-100 bg-sky-50/50 py-3">
            <div className="px-3 text-center">
              {rating > 0 ? <StarRating rating={rating} /> : <span className="text-sm font-semibold text-slate-700">New</span>}
              <p className="mt-1 text-[11px] leading-4 text-slate-600">{reviewsCount} {reviewsCount === 1 ? "review" : "reviews"}</p>
            </div>
            <div className="px-3 text-center">
              <p className="text-base font-bold tabular-nums text-slate-900">{profile ? Number(profile.completedJobs || 0).toLocaleString() : "—"}</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-600">Jobs completed</p>
            </div>
            <div className="px-3 text-center">
              <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900">{areas.join(", ") || "Not listed"}</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-600">Service area</p>
            </div>
          </div>

          <section aria-labelledby="provider-about-heading">
            <h3 id="provider-about-heading" className="text-sm font-bold text-slate-900">About</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
              {getBioPreview(profile?.bio || provider?.bio)}
            </p>
          </section>

          <ProviderStreak streak={provider?.onTimeStreak} variant="profile" />

          <section aria-labelledby="provider-reviews-heading">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="provider-reviews-heading" className="text-sm font-bold text-slate-900">Recent client reviews</h3>
                <span className="text-xs text-slate-500">Latest 3</span>
              </div>
              {profile && reviews.length > 1 && (
                <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                  <button
                    type="button"
                    onClick={() => scrollReviews(-1)}
                    aria-label="Scroll reviews left"
                    className="dashboard-secondary-button dashboard-focus flex h-8 w-8 items-center justify-center rounded-full p-0"
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="h-4 w-4">
                      <path d="m12.5 4.5-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollReviews(1)}
                    aria-label="Scroll reviews right"
                    className="dashboard-secondary-button dashboard-focus flex h-8 w-8 items-center justify-center rounded-full p-0"
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="h-4 w-4">
                      <path d="m7.5 4.5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            {error ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p role="alert" className="text-sm font-medium text-rose-800">{error}</p>
                <button type="button" onClick={() => setRetry((value) => value + 1)} className="dashboard-focus mt-2 text-sm font-semibold text-rose-800 underline underline-offset-2">
                  Try again
                </button>
              </div>
            ) : !profile ? (
              <div className="mt-3 space-y-3" aria-label="Loading reviews">
                {[0, 1].map((item) => <div key={item} className="h-[4.5rem] animate-pulse rounded-xl bg-slate-100" />)}
              </div>
            ) : reviews.length ? (
              <ul
                ref={reviewsScrollerRef}
                className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
                style={{ scrollbarWidth: "thin" }}
              >
                {reviews.slice(0, 3).map((review) => (
                  <li key={review.id} className="w-[min(82vw,19rem)] shrink-0 snap-start rounded-xl border border-sky-100 bg-white p-3">
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-50 text-xs font-bold text-blue-950">
                        {review.reviewerProfileImage ? (
                          <img src={review.reviewerProfileImage} alt="" className="h-full w-full object-cover" />
                        ) : (
                          review.reviewer.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">{review.reviewer}</p>
                          <StarRating rating={Number(review.rating || 0)} />
                        </div>
                        {formatReviewDate(review.reviewedAt) && <time className="text-[11px] text-slate-500">{formatReviewDate(review.reviewedAt)}</time>}
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-600">{review.comment}</p>
                    {review.photos?.length > 0 && (
                      <div className="mt-2 flex gap-2">
                        {review.photos.slice(0, 3).map((photo, index) => (
                          <a
                            key={`${review.id}-${photo}`}
                            href={photo}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open review photo ${index + 1} from ${review.reviewer}`}
                            className="dashboard-focus block h-14 w-16 shrink-0 overflow-hidden rounded-md border border-sky-100 bg-slate-50"
                          >
                            <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-600">No written reviews yet.</p>
            )}
          </section>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-sky-100 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
          <button type="button" onClick={onClose} className="dashboard-secondary-button dashboard-focus px-5 py-2.5 text-sm">Close</button>
          <button
            type="button"
            onClick={() => onBook({ ...provider, ...profile, _id: provider?._id || provider?.id || profile?.id })}
            className="dashboard-primary-button dashboard-focus px-6 py-2.5 text-sm"
          >
            Book now
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
