import ProviderStreak from "./ProviderStreak.jsx";

export default function ProviderModal({ provider, onClose, onBook, isFavorite = false, onToggleFavorite }) {
  if (!provider) return null;
  const name = provider.fullName || provider.username || "Provider";
  const location = [provider.barangay, provider.city, provider.province].filter(Boolean).join(", ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="dashboard-panel max-h-[90vh] w-full max-w-lg overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-sky-100 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sky-100 bg-sky-50 text-lg font-bold text-blue-950">
              {provider.profileImage ? (
                <img src={provider.profileImage} alt={`${name} profile`} className="h-full w-full object-cover" />
              ) : (
                name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold tracking-tight text-slate-900">{name}</h2>
              <p className="truncate text-sm text-slate-600">{provider.professions?.join(" · ") || "Service provider"}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="dashboard-focus flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-blue-900 transition hover:bg-sky-50 hover:text-blue-950"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L13.06 12l-5.47 5.47a.75.75 0 01-1.06 0L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {location && <p className="text-sm font-medium text-slate-700">{location} · {Number(provider.distanceKm).toFixed(2)} km away</p>}
            {onToggleFavorite && (
              <button type="button" onClick={onToggleFavorite} aria-pressed={isFavorite} aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"} className={`dashboard-focus inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${isFavorite ? "border-rose-200 bg-rose-50 text-rose-700" : "border-sky-100 bg-white text-blue-950 hover:bg-sky-50"}`}>
                <svg viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 0 1 6.5 4c1.74 0 3.41.81 4.5 2.09A6.12 6.12 0 0 1 15.5 4 4.5 4.5 0 0 1 20 8.5c0 3.78-3.4 6.86-8.55 11.5L12 21.35Z" /></svg>
                {isFavorite ? "Saved" : "Save provider"}
              </button>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{provider.bio || "This provider has not added an introduction yet."}</p>
          <ProviderStreak streak={provider.onTimeStreak} variant="profile" />

          <div className="border-t border-sky-100 pt-4">
            <h3 className="dashboard-kicker">TESDA certification</h3>
            {provider.tesdaCertificates?.length ? (
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {provider.tesdaCertificates.map((certificate) => <li key={certificate.trade}>Approved TESDA certificate · {certificate.trade}</li>)}
              </ul>
            ) : <p className="mt-2 text-sm text-slate-500">No approved TESDA certificates listed.</p>}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-sky-100 pt-4 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="dashboard-secondary-button dashboard-focus flex-1 py-2.5 text-sm"
            >
              Close
            </button>
            <button type="button" onClick={onBook} className="dashboard-primary-button dashboard-focus flex-1 py-2.5 text-sm">Book this professional</button>
          </div>
        </div>
      </div>
    </div>
  );
}
