function toAmount(value, fallback = 0) {
  const amount = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) ? amount : fallback;
}

function formatPhpAmount(value) {
  const amount = toAmount(value);
  return `₱${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

export default function BookingPriceBreakdown({
  booking,
  className = "",
  taskLabel = "Task offer",
  totalLabel = "Total amount due",
}) {
  const taskOffer = toAmount(booking?.taskOffer ?? booking?.offeredPrice ?? booking?.offer ?? booking?.price);
  const travelFee = toAmount(booking?.travelFee);
  const travelFeeBeforeDiscount = toAmount(booking?.travelFeeBeforeDiscount, travelFee);
  const travelFeeDiscount = toAmount(booking?.travelFeeDiscount);
  const tipAmount = toAmount(booking?.tipAmount);
  const totalPrice = booking?.totalPrice == null
    ? taskOffer + travelFee + tipAmount
    : toAmount(booking.totalPrice, taskOffer + travelFee + tipAmount);
  const distanceText = booking?.travelDistanceKm == null
    ? "Distance not recorded"
    : `${Number(booking.travelDistanceKm).toFixed(2)} km · distance-based rate`;

  return (
    <section aria-label="Price breakdown" className={`rounded-xl border border-sky-100 bg-slate-50/80 p-4 ${className}`.trim()}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Price breakdown</h3>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">Cost summary</span>
      </div>
      <dl className="mt-3 space-y-2.5 text-xs sm:text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-slate-600">{taskLabel}</dt>
          <dd className="shrink-0 font-semibold tabular-nums text-slate-900">{formatPhpAmount(taskOffer)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-slate-600">
            Travel fare
            <span className="mt-0.5 block text-[10px] font-normal text-slate-500 sm:text-[11px]">{distanceText}</span>
          </dt>
          <dd className="shrink-0 text-right font-semibold tabular-nums text-slate-900">
            {travelFeeDiscount > 0 && <span className="mr-1.5 text-xs font-medium text-slate-400 line-through">{formatPhpAmount(travelFeeBeforeDiscount)}</span>}
            {formatPhpAmount(travelFee)}
          </dd>
        </div>
        {travelFeeDiscount > 0 && (
          <div className="flex items-start justify-between gap-3 text-emerald-800">
            <dt>Travel-fee voucher</dt>
            <dd className="shrink-0 font-semibold tabular-nums">−{formatPhpAmount(travelFeeDiscount)}</dd>
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <dt className="text-slate-600">Optional tip</dt>
          <dd className="shrink-0 font-semibold tabular-nums text-slate-900">{formatPhpAmount(tipAmount)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-dashed border-sky-200 pt-3 text-sm">
          <dt className="font-bold text-slate-800">{totalLabel}</dt>
          <dd className="shrink-0 text-base font-extrabold tabular-nums text-slate-950">{formatPhpAmount(totalPrice)}</dd>
        </div>
      </dl>
    </section>
  );
}