export default function BookingHistory({ events = [] }) {
  if (!events.length) return null;

  return (
    <details className="mt-3 rounded-xl border border-sky-100 bg-white">
      <summary className="dashboard-focus cursor-pointer rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700">
        View activity history <span className="ml-1 font-medium text-slate-500">({events.length})</span>
      </summary>
      <ol className="space-y-2 border-t border-sky-100 px-3 py-3">
        {events.map((event, index) => (
          <li key={`${event.status}-${event.at}-${index}`} className="flex items-start justify-between gap-3 text-xs">
            <span className="font-medium text-slate-700">{event.status}</span>
            <time className="shrink-0 text-slate-500" dateTime={new Date(event.at).toISOString()}>
              {new Date(event.at).toLocaleString()}
            </time>
          </li>
        ))}
      </ol>
    </details>
  );
}
