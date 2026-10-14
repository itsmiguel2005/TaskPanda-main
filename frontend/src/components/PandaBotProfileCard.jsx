import { useState } from "react";

const verificationPresentation = {
  VERIFICATION_APPROVED: {
    label: "Verified Provider",
    className: "border-emerald-200 bg-emerald-100 text-emerald-900",
  },
  VERIFICATION_PENDING: {
    label: "Under Review",
    className: "border-amber-200 bg-amber-100 text-amber-900",
  },
  VERIFICATION_REJECTED: {
    label: "Verification not approved",
    className: "border-rose-200 bg-rose-100 text-rose-900",
  },
  VERIFICATION_UNVERIFIED: {
    label: "Not Verified",
    className: "border-slate-200 bg-white/80 text-slate-700",
  },
};

function getInitials(name) {
  return String(name || "Provider")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "P";
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="m5 10 3.2 3.2L15.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-amber-500" aria-hidden="true">
      <path d="m10 1.8 2.5 5.1 5.6.8-4.1 4 .97 5.6L10 14.65l-5.01 2.64.96-5.6-4.07-3.98 5.63-.82L10 1.8Z" />
    </svg>
  );
}

export default function PandaBotProfileCard({ profile }) {
  const [imageFailed, setImageFailed] = useState(false);
  const name = typeof profile?.name === "string" && profile.name.trim()
    ? profile.name.trim()
    : "TaskPanda Provider";
  const profession = typeof profile?.profession === "string" && profile.profession.trim()
    ? profile.profession.trim()
    : "Service provider";
  const ratingValue = Number(profile?.rating);
  const rating = Number.isFinite(ratingValue) ? Math.max(0, Math.min(5, ratingValue)) : 0;
  const reviewsValue = Number(profile?.reviewCount);
  const reviewCount = Number.isFinite(reviewsValue) ? Math.max(0, Math.floor(reviewsValue)) : 0;
  const verification = verificationPresentation[profile?.verificationStatus] ||
    verificationPresentation.VERIFICATION_UNVERIFIED;
  const profileImage = typeof profile?.profileImage === "string" ? profile.profileImage.trim() : "";

  return (
    <article className="w-full rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 shadow-sm">
      <header className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-200 bg-emerald-100 text-sm font-bold text-emerald-900">
          {profileImage && !imageFailed ? (
            <img
              src={profileImage}
              alt={`${name} profile`}
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span aria-label={`${name} initials`}>{getInitials(name)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold leading-5 text-slate-950">{name}</h3>
          <p className="mt-1 inline-flex max-w-full truncate rounded-full border border-emerald-200 bg-white/80 px-2 py-0.5 text-[11px] font-semibold leading-4 text-emerald-900">
            {profession}
          </p>
        </div>
      </header>

      <div className="mt-3 grid grid-cols-2 divide-x divide-emerald-200/80 rounded-lg border border-emerald-100 bg-white/75 py-2.5">
        <div className="px-3">
          <p className="flex items-center gap-1.5 text-sm font-bold tabular-nums text-slate-950">
            <StarIcon />
            {rating.toFixed(1)}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">Average rating</p>
        </div>
        <div className="px-3">
          <p className="text-sm font-bold tabular-nums text-slate-950">{reviewCount}</p>
          <p className="mt-0.5 text-xs text-slate-600">{reviewCount === 1 ? "review" : "reviews"}</p>
        </div>
      </div>

      <div className="mt-3">
        <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${verification.className}`}>
          {profile?.verificationStatus === "VERIFICATION_APPROVED" && <CheckIcon />}
          <span className="truncate">{verification.label}</span>
        </span>
      </div>
    </article>
  );
}
