import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { adminRequest } from "../services/adminApi.js";

const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const reasonLabels = {
  INCOMPLETE_WORK: "Incomplete work",
  POOR_QUALITY: "Poor quality",
  OVERCHARGED: "Overcharged",
  OTHER: "Other",
};
const filters = [
  ["PENDING", "Pending"],
  ["APPROVED", "Approved"],
  ["REJECTED", "Rejected"],
  ["ALL", "All requests"],
];

function dateTime(value) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : parsed.toLocaleString("en-PH");
}

function RefundReviewCard({ refund, token, onResolved, density, isExpanded, onToggle }) {
  const [cashAmount, setCashAmount] = useState(String(refund.requestedCashAmount));
  const [adminNotes, setAdminNotes] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [repaymentReviewNotes, setRepaymentReviewNotes] = useState("");
  const requestedAmount = Number(refund.requestedCashAmount || 0);
  const amount = Number(cashAmount);
  const booking = refund.booking || {};
  const isPending = refund.status === "PENDING";
  const isCompact = density === "compact";

  async function resolve(action) {
    setBusyAction(action);
    setError("");
    try {
      await adminRequest(`/api/admin/refunds/${refund.id}/resolve`, token, {
        method: "POST",
        body: JSON.stringify({
          action,
          approvedCashAmount: action === "REJECT" ? 0 : action === "APPROVE_FULL" ? requestedAmount : amount,
          adminNotes: adminNotes.trim(),
        }),
      });
      onResolved();
    } catch (requestError) {
      setError(requestError.message || "Could not resolve this refund.");
      setBusyAction("");
    }
  }

  async function resolveRepayment(action) {
    setBusyAction(action);
    setError("");
    try {
      await adminRequest(`/api/admin/refunds/${refund.id}/repayment-review`, token, {
        method: "POST",
        body: JSON.stringify({ action, notes: repaymentReviewNotes.trim() }),
      });
      await onResolved();
      setRepaymentReviewNotes("");
      setBusyAction("");
    } catch (requestError) {
      setError(requestError.message || "Could not resolve the repayment review.");
      setBusyAction("");
    }
  }

  return (
    <article className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${isCompact ? "p-3 sm:p-4" : "p-5 sm:p-6"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-800">{reasonLabels[refund.reason] || refund.reason}</p>
          <h2 className={`${isCompact ? "mt-0.5 text-base" : "mt-1 text-lg"} font-bold text-slate-950`}>{booking.task || "Service booking"}</h2>
          <p className="mt-1 text-sm text-slate-600">{isCompact ? dateTime(refund.createdAt) : `Submitted ${dateTime(refund.createdAt)} · ${refund.status}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${refund.status === "PENDING" ? "bg-amber-100 text-amber-900" : refund.status === "APPROVED" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>{refund.status}</span>
          {isCompact && (
            <button type="button" onClick={onToggle} aria-expanded={isExpanded} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              {isExpanded ? "Hide details" : "Review"}
            </button>
          )}
        </div>
      </div>

      {isCompact && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          <span>Client: <strong className="font-semibold text-slate-800">{refund.client?.name}</strong></span>
          <span>Provider: <strong className="font-semibold text-slate-800">{refund.provider?.name}</strong></span>
          <span>Requested: <strong className="font-semibold tabular-nums text-slate-900">{currency.format(requestedAmount)}</strong></span>
        </div>
      )}

      {(!isCompact || isExpanded) && (
        <div className={isCompact ? "mt-4 border-t border-slate-100 pt-4" : ""}>
      <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800">{refund.description}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Client</dt><dd className="font-semibold text-slate-900">{refund.client?.name} <span className="font-normal text-slate-500">{refund.client?.email}</span></dd></div>
        <div><dt className="text-slate-500">Provider</dt><dd className="font-semibold text-slate-900">{refund.provider?.name} <span className="font-normal text-slate-500">{refund.provider?.email}</span></dd></div>
        <div><dt className="text-slate-500">Requested cash</dt><dd className="font-semibold tabular-nums text-slate-900">{currency.format(requestedAmount)}</dd></div>
        <div><dt className="text-slate-500">Booking total</dt><dd className="font-semibold tabular-nums text-slate-900">{currency.format(booking.total || 0)}</dd></div>
        <div><dt className="text-slate-500">Cash paid confirmed</dt><dd className="font-semibold text-slate-900">{refund.cashPaidConfirmedAtRequest ? "Yes" : "No"}</dd></div>
        <div><dt className="text-slate-500">Travel voucher used</dt><dd className="font-semibold text-slate-900">{booking.voucherId && booking.travelFeeDiscount > 0 ? `${currency.format(booking.travelFeeDiscount)} discount` : "No"}</dd></div>
        <div><dt className="text-slate-500">Work completed</dt><dd className="text-slate-800">{dateTime(booking.workCompletedAt)}</dd></div>
        <div><dt className="text-slate-500">Current booking status</dt><dd className="text-slate-800">{booking.status || "Not available"}</dd></div>
      </dl>

      {booking.completionNote && (
        <section className="mt-4 rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-900">Provider completion note</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{booking.completionNote}</p>
        </section>
      )}

      {refund.proofPhotos?.length > 0 && (
        <section className="mt-4">
          <h3 className="text-sm font-bold text-slate-900">Client proof photos</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {refund.proofPhotos.map((photo) => (
              <a key={photo} href={photo} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-slate-200">
                <img src={photo} alt="Refund request evidence" loading="lazy" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </section>
      )}

      {!isPending ? (
        <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="font-semibold text-slate-900">
            {refund.resolutionAction} · Agreed cash repayment: {currency.format(refund.approvedCashAmount)}
          </p>
          <p className="mt-1 text-slate-600">
            {refund.voucherRestored ? "Travel-fee voucher restored." : "No voucher restoration recorded."}
            {refund.cashRepaymentStatus === "due_provider_to_client"
              ? ` Provider owes direct cash repayment by ${dateTime(refund.providerRepaymentDueAt)}.`
              : refund.cashRepaymentStatus === "provider_marked_sent"
                ? ` Provider marked the repayment sent. Client response due ${dateTime(refund.clientResponseDueAt)}.`
                : refund.cashRepaymentStatus === "client_reported_missing"
                  ? " Client reports that the repayment was not received; admin review is required."
                  : refund.cashRepaymentStatus === "repayment_overdue"
                    ? " Provider missed the repayment deadline and was suspended pending admin review."
                    : refund.cashRepaymentStatus === "confirmed_received"
                      ? " Client confirmed receipt of the direct repayment."
                      : refund.cashRepaymentStatus === "auto_confirmed"
                        ? " Automatically closed after the client response window expired."
                        : " No physical cash repayment is due."}
          </p>
          {refund.clientReportNote && (
            <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-950">
              <strong>Client report ({dateTime(refund.clientReportedAt)}):</strong> {refund.clientReportNote}
            </p>
          )}
          {(["client_reported_missing", "repayment_overdue"].includes(refund.cashRepaymentStatus)
            || (refund.cashRepaymentStatus === "confirmed_received" && refund.providerSuspensionAppliedAt)) && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="text-sm font-semibold text-slate-900">
                {refund.cashRepaymentStatus === "confirmed_received" ? "Provider suspension review" : "Review the repayment case"}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {refund.cashRepaymentStatus === "confirmed_received"
                  ? "The client confirmed receipt after the provider missed the repayment deadline. Review the account and lift the refund-related suspension if appropriate."
                  : "Confirm receipt only after checking with both parties. Reopening gives the provider a fresh 48-hour window and lifts any suspension applied by this repayment case."}
              </p>
              <label htmlFor={`repayment-review-notes-${refund.id}`} className="mt-3 block text-sm font-semibold text-slate-800">Admin review notes</label>
              <textarea
                id={`repayment-review-notes-${refund.id}`}
                value={repaymentReviewNotes}
                onChange={(event) => setRepaymentReviewNotes(event.target.value)}
                minLength={5}
                maxLength={2000}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Record who you contacted and the outcome."
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(busyAction) || repaymentReviewNotes.trim().length < 5}
                  onClick={() => resolveRepayment(refund.cashRepaymentStatus === "confirmed_received" ? "LIFT_SUSPENSION" : "CONFIRM_RECEIVED")}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {busyAction === "CONFIRM_RECEIVED" || busyAction === "LIFT_SUSPENSION"
                    ? "Saving…"
                    : refund.cashRepaymentStatus === "confirmed_received" ? "Lift provider suspension" : "Confirm repayment resolved"}
                </button>
                {refund.cashRepaymentStatus !== "confirmed_received" && <button
                  type="button"
                  disabled={Boolean(busyAction) || repaymentReviewNotes.trim().length < 5}
                  onClick={() => resolveRepayment("REOPEN_WINDOW")}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-50 disabled:opacity-50"
                >
                  {busyAction === "REOPEN_WINDOW" ? "Saving…" : "Reopen 48-hour window"}
                </button>}
              </div>
              {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>}
              {refund.repaymentReviewNotes && <p className="mt-3 text-xs text-slate-700">Previous review: {refund.repaymentReviewNotes}</p>}
            </div>
          )}
          {refund.adminNotes && <p className="mt-2 whitespace-pre-wrap text-slate-700">Admin note: {refund.adminNotes}</p>}
          <p className="mt-1 text-xs text-slate-500">Resolved {dateTime(refund.resolvedAt)} by {refund.resolvedBy || "admin"}</p>
        </section>
      ) : (
        <section className="mt-5 border-t border-slate-200 pt-5">
          <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950">
            Any approved cash amount must be returned physically by the provider to the client. TaskPanda does not collect, transfer, deduct, or reverse cash.
            {!refund.cashPaidConfirmedAtRequest && " Cash was not confirmed as paid, so only a used travel voucher can be restored."}
          </p>
          <label htmlFor={`refund-partial-amount-${refund.id}`} className="mt-4 block text-sm font-semibold text-slate-800">Partial cash repayment amount (PHP)</label>
          <input
            id={`refund-partial-amount-${refund.id}`}
            type="number"
            min="0"
            max={requestedAmount}
            step="0.01"
            value={cashAmount}
            onChange={(event) => setCashAmount(event.target.value)}
            disabled={!refund.cashPaidConfirmedAtRequest}
            className="mt-1 w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          />
          <label htmlFor={`refund-admin-notes-${refund.id}`} className="mt-4 block text-sm font-semibold text-slate-800">Admin notes / rejection justification</label>
          <textarea id={`refund-admin-notes-${refund.id}`} value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} maxLength={2000} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Record the decision context and any repayment agreement." />
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(busyAction) || !refund.cashPaidConfirmedAtRequest && !(booking.voucherId && booking.travelFeeDiscount > 0)} onClick={() => resolve("APPROVE_FULL")} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busyAction === "APPROVE_FULL" ? "Saving…" : "Approve full"}
            </button>
            <button type="button" disabled={Boolean(busyAction) || !refund.cashPaidConfirmedAtRequest || !Number.isFinite(amount) || amount < 0 || amount >= requestedAmount} onClick={() => resolve("APPROVE_PARTIAL")} className="rounded-lg border border-emerald-700 px-4 py-2.5 text-sm font-semibold text-emerald-900 disabled:opacity-50">
              {busyAction === "APPROVE_PARTIAL" ? "Saving…" : "Approve partial"}
            </button>
            <button type="button" disabled={Boolean(busyAction) || adminNotes.trim().length < 5} onClick={() => resolve("REJECT")} className="rounded-lg border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-800 disabled:opacity-50">
              {busyAction === "REJECT" ? "Saving…" : "Reject"}
            </button>
          </div>
        </section>
      )}
        </div>
      )}
    </article>
  );
}

export default function AdminRefundManagement() {
  const { token } = useAuth();
  const [filter, setFilter] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [density, setDensity] = useState(() => {
    try {
      return window.localStorage.getItem("taskpanda-admin-refunds-density") === "compact" ? "compact" : "comfortable";
    } catch {
      return "comfortable";
    }
  });
  const [expandedRefundId, setExpandedRefundId] = useState(null);

  function changeDensity(value) {
    setDensity(value);
    setExpandedRefundId(null);
    try {
      window.localStorage.setItem("taskpanda-admin-refunds-density", value);
    } catch (storageError) {
      console.warn("Could not save the admin refund display preference:", storageError);
    }
  }

  const loadRefunds = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await adminRequest(`/api/admin/refunds?status=${filter}&page=${page}`, token);
      if (!Array.isArray(result.refunds) || !result.pagination) throw new Error("The server returned an invalid refund list.");
      setData(result);
    } catch (loadError) {
      setError(loadError.message || "Could not load refund requests.");
    } finally {
      setIsLoading(false);
    }
  }, [filter, page, token]);

  useEffect(() => {
    loadRefunds();
  }, [loadRefunds]);

  return (
    <section aria-labelledby="admin-refunds-title" className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">Cash-aware review</p>
          <h1 id="admin-refunds-title" className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">Refunds &amp; disputes</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Record decisions and agreed provider-to-client cash repayments. Cash is exchanged directly by the parties; TaskPanda does not process or reverse it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Refund display density" className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            {["comfortable", "compact"].map((value) => (
              <button key={value} type="button" aria-pressed={density === value} onClick={() => changeDensity(value)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${density === value ? "bg-blue-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
                {value === "comfortable" ? (
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                    <rect x="2.5" y="2.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="11.5" y="2.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="2.5" y="11.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="11.5" y="11.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                    <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                )}
                <span className="capitalize">{value}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={loadRefunds} disabled={isLoading} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50">Refresh</button>
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="group" aria-label="Filter refund requests by status">
        {filters.map(([value, label]) => (
          <button key={value} type="button" onClick={() => { setFilter(value); setPage(1); }} aria-pressed={filter === value} className={`dashboard-focus shrink-0 border-b-2 px-3 py-2.5 text-xs font-semibold transition ${filter === value ? "border-blue-800 text-blue-950" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"}`}>{label}</button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{error}</p>}
      {isLoading && !data && <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading refund requests…</p>}
      {!isLoading && !error && data?.refunds.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-bold text-slate-900">No refund requests found</h2>
          <p className="mt-1 text-sm text-slate-600">{filter === "PENDING" ? "New client requests will appear here for review." : "There are no requests in this view."}</p>
        </div>
      )}
      <div className="space-y-4">
        {data?.refunds.map((refund) => (
          <RefundReviewCard
            key={refund.id}
            refund={refund}
            token={token}
            onResolved={loadRefunds}
            density={density}
            isExpanded={expandedRefundId === refund.id}
            onToggle={() => setExpandedRefundId((current) => current === refund.id ? null : refund.id)}
          />
        ))}
      </div>
      {data?.pagination && data.pagination.pages > 1 && (
        <nav aria-label="Refund request pages" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm text-slate-600">Page {page} of {data.pagination.pages} · {data.pagination.total} requests</p>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || isLoading} onClick={() => setPage((current) => current - 1)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">Previous</button>
            <button type="button" disabled={page >= data.pagination.pages || isLoading} onClick={() => setPage((current) => current + 1)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">Next</button>
          </div>
        </nav>
      )}
    </section>
  );
}
