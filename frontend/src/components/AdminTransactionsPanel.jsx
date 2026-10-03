import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { adminRequest } from "../services/adminApi.js";

const currency = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateTime = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
});

const summaryLabels = [
  ["grossTaskValue", "Gross task value"],
  ["providerLaborEarnings", "Provider labor"],
  ["travelFees", "Travel fees"],
  ["voucherDeductions", "Voucher deductions"],
  ["tips", "Tips"],
  ["clientPaidTotal", "Client paid"],
];

function amount(value) {
  return currency.format(Number(value || 0));
}

function AdminTransactionsPanel() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({ q: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!token) {
      logout();
      navigate("/login", { replace: true });
      return undefined;
    }
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page) });
    if (filters.q) query.set("q", filters.q);
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    setIsLoading(true);
    setError("");
    setData(null);

    adminRequest(`/api/admin/transactions?${query}`, token, { signal: controller.signal })
      .then(setData)
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        if (requestError.status === 401) {
          logout();
          navigate("/login", { replace: true });
          return;
        }
        setError(requestError.message || "Could not load the transaction ledger.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [filters, logout, navigate, page, refreshKey, token]);

  const applyFilters = (event) => {
    event.preventDefault();
    if (filters.from && filters.to && filters.from > filters.to) {
      setError("Choose a start date on or before the end date.");
      return;
    }
    setPage(1);
    setFilters({ q: searchInput.trim(), from: filters.from, to: filters.to });
  };

  return (
    <section aria-labelledby="admin-transactions-title" className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="admin-transactions-title" className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Transaction ledger</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">Completed tasks with labor, travel, voucher, and tip amounts shown separately.</p>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={isLoading} className="dashboard-focus inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-blue-950 shadow-sm transition hover:bg-sky-50 disabled:cursor-wait disabled:opacity-50">
          {isLoading ? "Refreshing…" : "Refresh ledger"}
        </button>
      </header>

      {data?.summary && (
        <dl className="grid grid-cols-2 divide-x divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white sm:grid-cols-3 sm:divide-y-0 xl:grid-cols-6">
          {summaryLabels.map(([key, label]) => (
            <div key={key} className="min-w-0 px-4 py-3.5">
              <dt className="truncate text-xs font-medium text-slate-500">{label}</dt>
              <dd className={`mt-1 truncate text-lg font-bold tabular-nums ${key === "voucherDeductions" ? "text-amber-800" : "text-slate-950"}`}>{amount(data.summary[key])}</dd>
            </div>
          ))}
        </dl>
      )}

      <form onSubmit={applyFilters} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_10rem_10rem_auto] xl:items-end">
        <label className="block text-xs font-semibold text-slate-700 sm:col-span-2 xl:col-span-1">
          Search task, client, provider, or booking ID
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={100} className="dashboard-focus mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 placeholder:text-slate-500" placeholder="e.g. plumbing repair or name" />
        </label>
        <label className="block text-xs font-semibold text-slate-700">
          Completed from
          <input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="dashboard-focus mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900" />
        </label>
        <label className="block text-xs font-semibold text-slate-700">
          Completed to
          <input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="dashboard-focus mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900" />
        </label>
        <button type="submit" className="dashboard-focus h-10 rounded-xl bg-blue-800 px-4 text-sm font-semibold text-white transition hover:bg-blue-900 active:scale-[0.98]">Apply filters</button>
      </form>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="dashboard-focus rounded-lg px-2 py-1 font-semibold underline underline-offset-2">Retry</button>
        </div>
      )}

      <section aria-label="Completed task transactions" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-sm font-bold text-slate-950">Completed tasks</h2>
            <p className="mt-0.5 text-xs text-slate-500">{data ? `${data.pagination.total.toLocaleString()} matching transactions` : "Loading transaction count"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-xs text-slate-600">Voucher discounts reduce travel fees only, never provider labor.</p>
            <p id="ledger-scroll-hint" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-900">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M4 10h12M8 6l-4 4 4 4M12 6l4 4-4 4" />
              </svg>
              Scroll to see all columns
            </p>
          </div>
        </div>

        <div
          className="admin-ledger-scroll overflow-x-scroll"
          role="region"
          aria-label="Scrollable transaction table"
          aria-describedby="ledger-scroll-hint"
          tabIndex={0}
        >
          <table className="w-full min-w-[1120px] border-collapse text-left">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Completed</th>
                <th scope="col" className="px-4 py-3">Task & parties</th>
                <th scope="col" className="px-4 py-3 text-right">Task / labor</th>
                <th scope="col" className="px-4 py-3 text-right">Travel fee</th>
                <th scope="col" className="px-4 py-3 text-right">Voucher</th>
                <th scope="col" className="px-4 py-3 text-right">Tip</th>
                <th scope="col" className="px-4 py-3 text-right">Client paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {isLoading && !data && Array.from({ length: 5 }, (_, index) => (
                <tr key={index} aria-hidden="true">
                  {Array.from({ length: 7 }, (_, column) => <td key={column} className="px-4 py-4"><span className="block h-4 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" /></td>)}
                </tr>
              ))}
              {!isLoading && data?.transactions?.map((row) => (
                <tr key={row.id} className="align-top transition hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">{row.completedAt ? dateTime.format(new Date(row.completedAt)) : "Date unavailable"}<span title={`Booking ID ${row.id}`} className="mt-1 block font-mono text-[10px] text-slate-500">#{row.id}</span></td>
                  <td className="max-w-72 px-4 py-4">
                    <p className="truncate font-semibold text-slate-900" title={row.task}>{row.task}</p>
                    <p className="mt-1 truncate text-xs text-slate-600">Client: {row.client}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-600">Provider: {row.provider}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums"><span className="block font-semibold text-slate-900">{amount(row.grossTaskValue)}</span><span className="mt-1 block text-xs text-slate-600">labor</span></td>
                  <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums"><span className="block font-semibold text-slate-900">{amount(row.travelFee)}</span><span className="mt-1 block text-xs text-slate-600">{row.distanceKm.toFixed(2)} km</span></td>
                  <td className="whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums text-amber-800">−{amount(row.voucherDeduction)}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums text-emerald-800">{amount(row.tip)}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-right font-bold tabular-nums text-slate-950">{amount(row.clientPaidTotal)}</td>
                </tr>
              ))}
              {!isLoading && !error && !data?.transactions?.length && (
                <tr><td colSpan="7" className="px-4 py-12 text-center">
                  <p className="text-sm font-semibold text-slate-800">No matching completed transactions</p>
                  <p className="mt-1 text-xs text-slate-600">Try a different search term or date range.</p>
                </td></tr>
              )}
              {isLoading && data?.transactions?.map((row) => (
                <tr key={row.id} aria-hidden="true"><td colSpan="7" className="px-4 py-3"><span className="block h-4 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" /></td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-600">{data?.pagination.pages ? `Page ${page} of ${data.pagination.pages}` : "Page 1 of 1"} · {data?.pagination.pageSize || 25} per page</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || isLoading} className="dashboard-focus h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
            <button type="button" onClick={() => setPage((current) => Math.min(data?.pagination.pages || 1, current + 1))} disabled={page >= (data?.pagination.pages || 1) || isLoading} className="dashboard-focus h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
          </div>
        </div>
      </section>
    </section>
  );
}

export default AdminTransactionsPanel;
