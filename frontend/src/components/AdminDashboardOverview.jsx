import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });

function formatStatus(status) {
  return String(status || "pending")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function StatusPill({ status }) {
  const normalized = String(status || "").toLowerCase();
  const tone = ["complete", "completed", "settled", "approved", "confirmed"].includes(normalized)
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : ["in_progress", "en_route", "on the way"].includes(normalized)
    ? "border-sky-200 bg-sky-50 text-sky-800"
    : ["canceled", "cancelled", "declined"].includes(normalized)
    ? "border-rose-200 bg-rose-50 text-rose-800"
    : "border-amber-200 bg-amber-50 text-amber-800";
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>{formatStatus(status)}</span>;
}

function MetricCard({ label, value, detail, accent }) {
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <span className={`h-2 w-2 shrink-0 rounded-full ${accent}`} aria-hidden="true" />
      </div>
      <p className="mt-3 truncate text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 min-h-8 text-xs leading-4 text-slate-500">{detail}</p>
    </article>
  );
}

function ChartEmpty({ children }) {
  return <div className="flex h-full min-h-48 items-center justify-center rounded-md border border-dashed border-slate-200 text-sm text-slate-500">{children}</div>;
}

export default function AdminDashboardOverview() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    if (!token) {
      setData(null);
      logout();
      navigate("/login", { replace: true });
      return undefined;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError("");
    fetch("/api/admin/analytics", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) {
          setData(null);
          logout();
          navigate("/login", { replace: true });
          return;
        }
        if (!response.ok) throw new Error(result.message || "Could not load admin analytics.");
        setData(result);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message || "Could not load admin analytics.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [token, refreshVersion, logout, navigate]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setRefreshVersion((value) => value + 1), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let frameId = 0;
    const updateViewportWidth = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => setViewportWidth(window.innerWidth));
    };
    window.addEventListener("resize", updateViewportWidth);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateViewportWidth);
    };
  }, []);

  const summary = data?.summary;
  const cards = [
    {
      label: "Total users",
      value: summary ? summary.totalUsers.toLocaleString() : "—",
      detail: summary ? `${summary.clients.toLocaleString()} clients · ${summary.providers.toLocaleString()} providers` : "Live account totals",
      accent: "bg-sky-500",
    },
    {
      label: "Pending verifications",
      value: summary ? summary.pendingVerifications.toLocaleString() : "—",
      detail: "Registered providers awaiting review",
      accent: "bg-amber-500",
    },
    {
      label: "Active bookings",
      value: summary ? summary.activeBookings.toLocaleString() : "—",
      detail: summary ? `${summary.pendingBookings} pending · ${summary.inProgressBookings} underway` : "Current booking statuses",
      accent: "bg-teal-600",
    },
    {
      label: "Completed value",
      value: summary ? currency.format(summary.completedValue) : "—",
      detail: summary ? `${summary.completedBookings.toLocaleString()} completed bookings` : "Total completed booking value",
      accent: "bg-emerald-500",
    },
  ];

  return (
    <section aria-labelledby="admin-overview-title" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="admin-overview-title" className="text-2xl font-bold text-slate-900">Admin dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Platform activity and service health</p>
        </div>
        <div className="flex items-center gap-3">
          {data?.system?.checkedAt && <span className="text-xs text-slate-500">Updated {new Date(data.system.checkedAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</span>}
          <button
            type="button"
            onClick={() => setRefreshVersion((value) => value + 1)}
            disabled={isLoading}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/30 disabled:cursor-wait disabled:opacity-50"
            aria-label="Refresh dashboard"
            title="Refresh dashboard"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true">
              <path d="M20 7v5h-5M4 17v-5h5" />
              <path d="M5.6 9a7 7 0 0 1 11.8-2L20 12M4 12l2.6 5a7 7 0 0 0 11.8-2" />
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={() => setRefreshVersion((value) => value + 1)} className="font-semibold underline underline-offset-2">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <MetricCard key={card.label} {...card} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
        <section aria-labelledby="booking-trend-title" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 id="booking-trend-title" className="text-sm font-semibold text-slate-900">Booking volume</h2>
              <p className="mt-1 text-xs text-slate-500">Requests created over the last 30 days</p>
            </div>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">30 days</span>
          </div>
          <div className="admin-chart-container h-64 min-w-0 w-full">
            {data?.bookingTrend?.length ? (
              <ResponsiveContainer key={`booking-trend-${viewportWidth}`} width="100%" height="100%">
                <AreaChart data={data.bookingTrend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bookingVolumeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f766e" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(date) => dateFormatter.format(new Date(`${date}T00:00:00Z`))} tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip labelFormatter={(date) => dateFormatter.format(new Date(`${date}T00:00:00Z`))} contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="bookings" name="Bookings" stroke="#0f766e" strokeWidth={2.5} fill="url(#bookingVolumeFill)" activeDot={{ r: 4, fill: "#0f766e", stroke: "#fff", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <ChartEmpty>{isLoading ? "Loading booking activity…" : "No bookings recorded in this period"}</ChartEmpty>}
          </div>
        </section>

        <section aria-labelledby="service-category-title" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <h2 id="service-category-title" className="text-sm font-semibold text-slate-900">Top service categories</h2>
            <p className="mt-1 text-xs text-slate-500">Bookings grouped by provider&apos;s first listed trade · 30 days</p>
          </div>
          <div className="admin-chart-container h-64 min-w-0 w-full">
            {data?.topCategories?.length ? (
              <ResponsiveContainer key={`service-categories-${viewportWidth}`} width="100%" height="100%">
                <BarChart data={data.topCategories} layout="vertical" margin={{ top: 0, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 5" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="category" width={112} tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="bookings" name="Bookings" fill="#4f89a7" radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartEmpty>{isLoading ? "Loading service demand…" : "No categorized bookings yet"}</ChartEmpty>}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="recent-bookings-title" className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5">
            <div>
              <h2 id="recent-bookings-title" className="text-sm font-semibold text-slate-900">Recent bookings</h2>
              <p className="mt-0.5 text-xs text-slate-500">Latest requests across the platform</p>
            </div>
            <span className="text-xs tabular-nums text-slate-500">{data?.recentBookings?.length || 0} shown</span>
          </div>
          {data?.recentBookings?.length ? (
            <div className="divide-y divide-slate-100">
              {data.recentBookings.map((booking) => (
                <article key={booking.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{booking.task}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{booking.client} <span aria-hidden="true">→</span> {booking.provider}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs font-semibold tabular-nums text-slate-700">{currency.format(booking.offeredPrice)}</span>
                    <StatusPill status={booking.status} />
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="px-5 py-8 text-center text-sm text-slate-500">{isLoading ? "Loading recent bookings…" : "No bookings yet"}</div>}
        </section>

        <section aria-labelledby="system-health-title" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="system-health-title" className="text-sm font-semibold text-slate-900">System health</h2>
              <p className="mt-1 text-xs text-slate-500">Current application status</p>
            </div>
            <span className={`mt-1 h-2.5 w-2.5 rounded-full ${data?.system?.database === "connected" ? "bg-emerald-500" : "bg-rose-500"}`} aria-hidden="true" />
          </div>
          <dl className="mt-5 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">API</dt><dd className="font-medium text-emerald-700">{data ? "Operational" : isLoading ? "Checking…" : "Unavailable"}</dd></div>
            <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Database</dt><dd className={`font-medium ${data?.system?.database === "connected" ? "text-emerald-700" : "text-rose-700"}`}>{data?.system?.database || (isLoading ? "Checking…" : "Unknown")}</dd></div>
            <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Process uptime</dt><dd className="font-medium tabular-nums text-slate-800">{Number.isFinite(data?.system?.uptimeSeconds) ? `${Math.floor(data.system.uptimeSeconds / 3600)}h ${Math.floor((data.system.uptimeSeconds % 3600) / 60)}m` : "—"}</dd></div>
          </dl>
          <p className="mt-5 border-t border-slate-100 pt-3 text-[11px] text-slate-400">Metrics refresh when this page opens or when refreshed.</p>
        </section>
      </div>
    </section>
  );
}
