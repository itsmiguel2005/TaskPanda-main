import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { adminRequest } from "../services/adminApi.js";
import { SkeletonBlock } from "./Skeletons.jsx";

const integer = new Intl.NumberFormat("en-PH");

const metricDefinitions = [
  ["referralUses", "Referral sign-ups", "text-blue-950"],
  ["referralCodeOwners", "Referral code owners", "text-blue-950"],
  ["activeVouchers", "Active vouchers", "text-emerald-800"],
  ["activeStampRewards", "Active 5-stamp rewards", "text-emerald-800"],
  ["stampsInProgress", "Stamp cards in progress", "text-blue-950"],
  ["redemptionRate", "Redemption rate", "text-blue-950", true],
  ["expiredPerks", "Expired perks", "text-amber-800"],
];

const originLabels = {
  referral: "Referral rewards",
  "stamp-card": "5-booking stamp card",
  promotion: "Promotional vouchers",
};

function AdminRewardsAnalytics() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
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
    setIsLoading(true);
    setError("");
    adminRequest("/api/admin/rewards/analytics", token, { signal: controller.signal })
      .then(setData)
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        if (requestError.status === 401) {
          logout();
          navigate("/login", { replace: true });
          return;
        }
        setError(requestError.message || "Could not load voucher analytics.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [logout, navigate, refreshKey, token]);

  return (
    <section aria-labelledby="admin-rewards-title" className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="admin-rewards-title" className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Voucher & promo analytics</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">Referral activity, five-booking stamp rewards, redemptions, and expired perks across client accounts.</p>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={isLoading} className="dashboard-focus inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-blue-950 shadow-sm transition hover:bg-sky-50 disabled:cursor-wait disabled:opacity-50">{isLoading ? "Refreshing…" : "Refresh analytics"}</button>
      </header>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="dashboard-focus rounded-lg px-2 py-1 font-semibold underline underline-offset-2">Retry</button>
        </div>
      )}

      <dl className="grid grid-cols-2 divide-x divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white sm:grid-cols-3 sm:divide-y-0 xl:grid-cols-4">
        {metricDefinitions.map(([key, label, tone, isPercent]) => (
          <div key={key} className="min-w-0 px-4 py-4">
            <dt className="text-xs font-medium leading-5 text-slate-600">{label}</dt>
            <dd className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{data ? `${integer.format(data.summary[key] || 0)}${isPercent ? "%" : ""}` : isLoading ? "—" : "0"}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
        <section aria-labelledby="voucher-breakdown-title" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3.5 sm:px-5">
            <h2 id="voucher-breakdown-title" className="text-sm font-bold text-slate-950">Voucher lifecycle</h2>
            <p className="mt-0.5 text-xs text-slate-600">Redemption rate is redeemed vouchers divided by all issued perks.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <tr><th scope="col" className="px-4 py-3">Reward source</th><th scope="col" className="px-4 py-3 text-right">Issued</th><th scope="col" className="px-4 py-3 text-right">Active</th><th scope="col" className="px-4 py-3 text-right">Redeemed</th><th scope="col" className="px-4 py-3 text-right">Expired</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.voucherBreakdown.map((row) => (
                  <tr key={row.origin}>
                    <th scope="row" className="px-4 py-3.5 font-semibold text-slate-800">{originLabels[row.origin] || row.origin}</th>
                    <td className="px-4 py-3.5 text-right tabular-nums text-slate-700">{integer.format(row.issued)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-emerald-800">{integer.format(row.active)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-slate-700">{integer.format(row.redeemed)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-amber-800">{integer.format(row.expired)}</td>
                  </tr>
                ))}
                {!data && !isLoading && <tr><td colSpan="5" className="px-4 py-10 text-center text-sm text-slate-600">No voucher analytics are available.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="stamp-progress-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 id="stamp-progress-title" className="text-sm font-bold text-slate-950">Five-booking stamp cards</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">Clients with an active stamp card toward their next ₱50 travel voucher.</p>
          <div className="mt-4 space-y-3">
            {data?.stampProgressDistribution.map((row) => {
              const maxCount = Math.max(1, ...data.stampProgressDistribution.map((item) => item.clients));
              const width = Math.round((row.clients / maxCount) * 100);
              return (
                <div key={row.stamps}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{row.stamps} of 5 stamps</span>
                    <span className="tabular-nums text-slate-600">{integer.format(row.clients)} clients</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-700 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
            {!data && isLoading && <div role="status" aria-label="Loading stamp card analytics" aria-busy="true" className="space-y-4">{[0, 1, 2, 3].map((item) => <div key={item}><SkeletonBlock className="h-3 w-36" /><SkeletonBlock className="mt-2 h-2 w-full rounded-full" /></div>)}</div>}
          </div>
        </section>
      </div>

      <section aria-labelledby="referral-ranking-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3.5 sm:px-5">
          <h2 id="referral-ranking-title" className="text-sm font-bold text-slate-950">Most-used referral codes</h2>
          <p className="mt-0.5 text-xs text-slate-600">{integer.format(data?.summary.referralUses || 0)} referred client sign-ups in total.</p>
        </div>
        {data?.topReferralCodes.length ? (
          <ol className="divide-y divide-slate-100">
            {data.topReferralCodes.map((row, index) => (
              <li key={`${row.code}-${index}`} className="content-arrive flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold tabular-nums text-slate-700">{index + 1}</span>
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{row.code}</p><p className="truncate text-xs text-slate-600">{row.referrer}</p></div>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">{integer.format(row.uses)} <span className="font-normal text-slate-600">uses</span></p>
              </li>
            ))}
          </ol>
        ) : (
          isLoading ? (
            <div role="status" aria-label="Loading referral usage" aria-busy="true" className="space-y-4 px-5 py-5">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonBlock className="h-4 w-40 max-w-full" />
                    <SkeletonBlock className="h-3 w-28 max-w-full" />
                  </div>
                  <SkeletonBlock className="h-4 w-16 shrink-0" />
                </div>
              ))}
            </div>
          ) : <p className="px-4 py-9 text-center text-sm text-slate-600">Referral code usage will appear here when clients join.</p>
        )}
      </section>
    </section>
  );
}

export default AdminRewardsAnalytics;
