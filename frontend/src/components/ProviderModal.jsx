export default function ProviderModal({ provider, onClose }) {
  if (!provider) return null;
  const name = provider.fullName || provider.username || "Provider";
  const location = [provider.barangay, provider.city, provider.province].filter(Boolean).join(", ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <div className="relative h-28 bg-gradient-to-r from-teal-700 to-emerald-600">
            <div className="absolute -bottom-10 left-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-teal-100 text-2xl font-bold text-teal-800">
                {name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-gray-500 transition hover:bg-white hover:text-gray-700"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L13.06 12l-5.47 5.47a.75.75 0 01-1.06 0L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="px-6 pt-12 pb-6">
          <h2 className="text-xl font-bold text-gray-900">{name}</h2>
          <p className="text-sm text-gray-500">{provider.professions?.join(" · ") || "Service provider"}</p>
          {location && <p className="mt-2 text-sm text-gray-600">{location} · {provider.distanceKm} km away</p>}
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{provider.bio || "This provider has not added an introduction yet."}</p>

          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">TESDA certification</h3>
            {provider.tesdaCertificates?.length ? (
              <ul className="mt-2 space-y-1 text-sm text-gray-700">
                {provider.tesdaCertificates.map((certificate) => <li key={certificate.trade}>Approved TESDA certificate · {certificate.trade}</li>)}
              </ul>
            ) : <p className="mt-2 text-sm text-gray-500">No approved TESDA certificates listed.</p>}
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={onClose}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
