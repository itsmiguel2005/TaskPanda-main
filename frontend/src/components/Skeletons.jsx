const DEFAULT_ROW_WIDTHS = ["w-2/3", "w-1/2", "w-3/4", "w-5/12"];

export function SkeletonBlock({ className = "", style }) {
  return <span aria-hidden="true" className={`skeleton-block ${className}`} style={style} />;
}

export function BookingCardSkeletonList({ count = 3, label = "Loading items" }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="space-y-4">
      {Array.from({ length: count }, (_, index) => (
        <article
          key={index}
          aria-hidden="true"
          className="rounded-xl border border-sky-100 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.035)] sm:p-6"
        >
          <div className="flex items-start gap-4">
            <SkeletonBlock className="h-12 w-12 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-3 pt-1">
              <SkeletonBlock className="h-4 w-1/3 max-w-48" />
              <SkeletonBlock className="h-3 w-1/2 max-w-64" />
            </div>
            <SkeletonBlock className="h-6 w-20 shrink-0 rounded-full" />
          </div>
          <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
            <SkeletonBlock className="h-4 w-2/5 max-w-72" />
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-3 w-4/5" />
          </div>
          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <SkeletonBlock className="h-9 w-24 rounded-lg" />
            <SkeletonBlock className="h-9 w-20 rounded-lg" />
          </div>
        </article>
      ))}
    </div>
  );
}

export function SkeletonProviderGrid({ count = 6, label = "Loading professionals" }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <article
          key={index}
          aria-hidden="true"
          className="overflow-hidden rounded-xl border border-sky-100 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.035)]"
        >
          <SkeletonBlock className="h-40 w-full rounded-none" />
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-2/3" />
            <SkeletonBlock className="h-3 w-1/2" />
            <SkeletonBlock className="h-3 w-full" />
            <div className="grid grid-cols-2 gap-2 pt-2">
              <SkeletonBlock className="h-9 rounded-lg" />
              <SkeletonBlock className="h-9 rounded-lg" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function MessageSkeletonList({ count = 5 }) {
  return (
    <div role="status" aria-label="Loading messages" aria-busy="true" className="space-y-4 py-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} aria-hidden="true" className={`flex ${index % 2 ? "justify-end" : "justify-start"}`}>
          <div className="w-3/4 max-w-sm space-y-2 rounded-2xl border border-slate-100 bg-white p-3">
            <SkeletonBlock className="h-3 w-4/5" />
            {index % 2 === 0 && <SkeletonBlock className="h-3 w-3/5" />}
            <SkeletonBlock className="h-2 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConversationSkeletonList({ count = 5, label = "Loading conversations" }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="space-y-1 p-2.5">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} aria-hidden="true" className="flex items-center gap-3 rounded-xl px-3 py-3.5">
          <SkeletonBlock className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-3.5 w-2/3" />
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTableRows({ rows = 5, columns = 6 }) {
  return Array.from({ length: rows }, (_, rowIndex) => (
    <tr key={rowIndex} aria-hidden="true" className="border-b border-slate-100 last:border-b-0">
      {Array.from({ length: columns }, (_, columnIndex) => (
        <td key={columnIndex} className="px-4 py-4">
          <SkeletonBlock className={`h-4 ${DEFAULT_ROW_WIDTHS[(rowIndex + columnIndex) % DEFAULT_ROW_WIDTHS.length]}`} />
        </td>
      ))}
    </tr>
  ));
}
