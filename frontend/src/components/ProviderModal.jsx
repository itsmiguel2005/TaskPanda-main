import { useState } from "react";

export default function ProviderModal({ provider, onClose, onBookNow }) {
  if (!provider) return null;

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
          <div className={`relative h-28 bg-gradient-to-r ${provider.banner}`}>
            <div className="absolute -bottom-10 left-6">
              <div className={`flex h-20 w-20 items-center justify-center rounded-full border-4 border-white text-2xl font-bold ${provider.color}`}>
                {provider.name.charAt(0)}
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
          <h2 className="text-xl font-bold text-gray-900">{provider.name}</h2>
          <p className="text-sm text-gray-500">{provider.trade}</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
              {provider.cred}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-yellow-500">
              <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.006z" />
            </svg>
            <span className="text-sm font-semibold text-gray-800">{provider.rating}</span>
            <span className="text-xs text-gray-400">({provider.reviews} reviews)</span>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-gray-600">{provider.bio}</p>

          <div className="mt-5 flex gap-2">
            <button
              onClick={onBookNow}
              className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Book Now
            </button>
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
