import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const refundReasons = [
  ["INCOMPLETE_WORK", "Incomplete work"],
  ["POOR_QUALITY", "Poor quality"],
  ["OVERCHARGED", "Overcharged"],
  ["OTHER", "Other"],
];

export default function RefundRequestModal({ booking, onSubmit, onClose }) {
  const cashPaid = !booking.cashPaidAutoConfirmed && Boolean(booking.cashPaidConfirmedAt || booking.clientConfirmedCash);
  const hasVoucher = Boolean(booking.voucherId && Number(booking.travelFeeDiscount || 0) > 0);
  const maxAmount = Number(booking.totalPrice ?? booking.offeredPrice ?? 0);
  const [reason, setReason] = useState("INCOMPLETE_WORK");
  const [requestedAmount, setRequestedAmount] = useState(cashPaid ? "" : "0");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoPreviews, setPhotoPreviews] = useState([]);

  useEffect(() => {
    const previews = photos.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPhotoPreviews(previews);
    return () => previews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [photos]);

  function updatePhotos(event) {
    const selectedPhotos = Array.from(event.target.files || []);
    setPhotos((currentPhotos) => [...currentPhotos, ...selectedPhotos].slice(0, 5));
    event.target.value = "";
  }

  function removePhoto(photoToRemove) {
    setPhotos((currentPhotos) => currentPhotos.filter((photo) => photo !== photoToRemove));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    const amount = Number(requestedAmount);
    if (!Number.isFinite(amount) || amount < 0 || amount > maxAmount) {
      setError(`Enter a cash amount between ₱0 and ₱${maxAmount.toLocaleString("en-PH", { maximumFractionDigits: 2 })}.`);
      return;
    }
    if (!cashPaid && amount > 0) {
      setError("Cash was not confirmed as paid. Only a used travel voucher can be restored.");
      return;
    }
    if (amount === 0 && !hasVoucher) {
      setError("Enter a cash amount greater than zero unless this booking used a travel-fee voucher.");
      return;
    }
    if (!description.trim()) {
      setError("Describe the issue so the admin can review the request.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(reason, amount, description.trim(), photos);
    } catch (submitError) {
      setError(submitError.message || "Could not submit the refund request.");
      setIsSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/50 p-4" onClick={() => !isSubmitting && onClose()}>
      <form role="dialog" aria-modal="true" aria-labelledby="refund-request-title" onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="p-6">
          <h2 id="refund-request-title" className="text-lg font-bold text-slate-900">Request a refund review</h2>
          <p className="mt-1 text-sm text-slate-600">{booking.task} with {booking.worker}</p>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            {cashPaid
              ? "Cash is paid directly to your provider. If approved, the provider must return the agreed cash amount directly to you; TaskPanda cannot reverse cash."
              : hasVoucher
                ? "Cash payment has not been confirmed. Any approved refund can restore the used travel-fee voucher, but cannot include a physical cash repayment."
                : "Cash payment has not been confirmed for this booking."}
          </div>

          <label htmlFor="refund-reason" className="mt-4 block text-sm font-semibold text-slate-800">Reason</label>
          <select id="refund-reason" value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {refundReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>

          <label htmlFor="refund-amount" className="mt-4 block text-sm font-semibold text-slate-800">Requested cash amount (PHP)</label>
          <input id="refund-amount" type="number" min="0" max={maxAmount} step="0.01" required value={requestedAmount} onChange={(event) => setRequestedAmount(event.target.value)} disabled={!cashPaid} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
          <p className="mt-1 text-xs text-slate-500">
            {cashPaid
              ? `Cannot exceed the booking total of ₱${maxAmount.toLocaleString("en-PH", { maximumFractionDigits: 2 })}.`
              : "No cash was confirmed as paid, so this request is voucher-only."}
          </p>

          <label htmlFor="refund-description" className="mt-4 block text-sm font-semibold text-slate-800">Description</label>
          <textarea id="refund-description" required maxLength={2000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Explain what happened and what you want reviewed." />

          <label htmlFor="refund-photos" className="mt-4 block text-sm font-semibold text-slate-800">Photo proof (optional, up to 5)</label>
          <input
            id="refund-photos"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            onChange={updatePhotos}
            disabled={isSubmitting || photos.length >= 5}
            className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold disabled:opacity-60"
          />
          <p className="mt-1 text-xs text-slate-500">
            {photos.length} of 5 photos selected. You can add more or remove any before submitting.
          </p>
          {photoPreviews.length > 0 && (
            <ul aria-label="Selected photo proof" className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {photoPreviews.map(({ file, url }) => (
                <li key={`${file.name}-${file.lastModified}-${file.size}`} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <img src={url} alt={`Selected proof: ${file.name}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => removePhoto(file)}
                    aria-label={`Remove ${file.name}`}
                    className="absolute right-1 top-1 rounded-md bg-slate-950/80 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-slate-950 disabled:opacity-50"
                  >
                    Remove
                  </button>
                  <p title={file.name} className="absolute inset-x-0 bottom-0 truncate bg-slate-950/70 px-1.5 py-1 text-[10px] text-white">{file.name}</p>
                </li>
              ))}
            </ul>
          )}

          {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>}
          <div className="mt-6 flex gap-3">
            <button type="button" disabled={isSubmitting} onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 rounded-lg bg-blue-800 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isSubmitting ? "Submitting…" : "Submit request"}</button>
          </div>
        </div>
      </form>
    </div>,
    document.body
  );
}
