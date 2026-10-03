function formatPhpAmount(value) {
  const amount = Number(value);
  return `₱${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

export default function BookingPriceBreakdown({ booking, className = "" }) {
  const taskOffer = Number(booking?.taskOffer ?? booking?.offeredPrice ?? booking?.offer ?? 0);
  const travelFee = Number(booking?.travelFee ?? 0);
  const tipAmount = Number(booking?.tipAmount ?? 0);
  const totalPrice = Number(booking?.totalPrice ?? taskOffer + travelFee + tipAmount);
  const distanceText = booking?.travelDistanceKm == null
    ? "Distance not recorded"
    : `${Number(booking.travelDistanceKm).toFixed(2)} km · ₱20 first 2 km + ₱10/km after`;

  return (
    <section aria-label="Price breakdown" className={`border-t border-sky-100 pt-3 ${className}`.trim()}>
      <h3 className="dashboard-kicker">Price breakdown</h3>
      <dl className="mt-2 space-y-1.5 text-xs sm:text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-slate-600">Task offer</dt>
          <dd className="shrink-0 font-semibold tabular-nums text-slate-900">{formatPhpAmount(taskOffer)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-slate-600">
            Travel fare
            <span className="mt-0.5 block text-[10px] font-normal text-slate-500 sm:text-[11px]">{distanceText}</span>
          </dt>
          <dd className="shrink-0 font-semibold tabular-nums text-slate-900">{formatPhpAmount(travelFee)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-slate-600">Optional tip</dt>
          <dd className="shrink-0 font-semibold tabular-nums text-slate-900">{formatPhpAmount(tipAmount)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-sky-100 pt-2 text-sm">
          <dt className="font-bold text-slate-800">Total amount due</dt>
          <dd className="shrink-0 text-base font-extrabold tabular-nums text-slate-950">{formatPhpAmount(totalPrice)}</dd>
        </div>
      </dl>
    </section>
  );
}