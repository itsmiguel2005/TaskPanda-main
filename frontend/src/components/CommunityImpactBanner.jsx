export default function CommunityImpactBanner() {
  return (
    <aside aria-label="TaskPanda community impact" className="border-y border-emerald-100 bg-emerald-50/70">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-700" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="m8.5 12.5 2.1 2.1a2 2 0 0 0 2.8 0l3.1-3.1" />
            <path d="m3 9 3-3 4 1 2 2-2.1 2.1a1.8 1.8 0 0 0 0 2.5 1.8 1.8 0 0 0 2.5 0l1-1" />
            <path d="m21 9-3-3-4 1-2 2 2 2" />
            <path d="m3 9 3 3m15-3-3 3" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-950">Local work builds stronger communities.</p>
          <p className="mt-0.5 text-xs leading-relaxed text-emerald-900/75">
            Supporting local trade professionals promotes sustainable economic growth and decent work.
          </p>
        </div>
        <span className="hidden shrink-0 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 sm:inline-flex">
          SDG 8 · Decent Work
        </span>
      </div>
    </aside>
  );
}
