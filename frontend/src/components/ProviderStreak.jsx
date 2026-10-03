export default function ProviderStreak({ streak, variant = "compact", className = "" }) {
  const count = Math.max(0, Number(streak?.count) || 0);
  const milestone = Number(streak?.milestone) || 0;
  const nextMilestone = Number(streak?.nextMilestone) || 0;
  const isProfile = variant === "profile";
  if (!count && !isProfile) return null;

  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50/80 ${isProfile ? "p-4" : "inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1.5"} ${className}`}
      aria-label={count ? `${count} consecutive on-time bookings` : "No active on-time booking streak"}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-amber-950">
        <span aria-hidden="true">🔥</span>
        <span>{count ? `${count} on-time booking${count === 1 ? "" : "s"} in a row` : "No active on-time streak"}</span>
        {milestone > 0 && (
          <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold">
            {milestone}-booking milestone
          </span>
        )}
        {nextMilestone > 0 && (
          <span className="text-[10px] font-medium text-amber-800">
            Next milestone: {nextMilestone}
          </span>
        )}
      </div>
      {isProfile && (
        <p className="mt-1.5 text-xs leading-5 text-amber-900">
          Counts scheduled bookings completed on their service day. Days without scheduled work do not break the streak; a late or incomplete booking does.
        </p>
      )}
    </div>
  );
}
