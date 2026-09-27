export default function BookingHistory({ events = [] }) {
  if (!events.length) return null;

  return (
    <details className="mt-3 rounded-lg border border-gray-200 bg-white">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-gray-700">View Activity History</summary>
      <ol className="space-y-2 border-t border-gray-100 px-3 py-3">
        {events.map((event, index) => (
          <li key={`${event.status}-${event.at}-${index}`} className="flex items-start justify-between gap-3 text-xs">
            <span className="font-medium text-gray-700">{event.status}</span>
            <time className="shrink-0 text-gray-500" dateTime={new Date(event.at).toISOString()}>
              {new Date(event.at).toLocaleString()}
            </time>
          </li>
        ))}
      </ol>
    </details>
  );
}
