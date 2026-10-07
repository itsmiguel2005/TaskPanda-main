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
import { SkeletonBlock } from "./Skeletons.jsx";

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
    : normalized.includes("canceled") || normalized.includes("cancelled") || normalized.includes("declined")
    ? "border-rose-200 bg-rose-50 text-rose-800"
    : normalized.includes("expired")
    ? "border-slate-200 bg-slate-100 text-slate-700"
    : "border-amber-200 bg-amber-50 text-amber-800";
  const dot = tone.includes("emerald")
    ? "bg-emerald-500"
    : tone.includes("sky")
    ? "bg-sky-500"
    : tone.includes("rose")
    ? "bg-rose-500"
    : tone.includes("slate")
    ? "bg-slate-500"
    : "bg-amber-500";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {formatStatus(status)}
    </span>
  );
}

function MetricIcon({ name }) {
  const paths = {
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    verification: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    bookings: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M8 15h3" /></>,
    value: <><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function MetricCard({ label, value, detail, accent, icon, iconTone }) {
  return (
    <article className="group relative isolate min-w-0 overflow-hidden rounded-2xl border border-white/80 bg-white/80 p-5 shadow-[0_12px_34px_rgba(15,23,42,0.055)] backdrop-blur-xl transition duration-300 ease-out hover:-translate-y-1 hover:scale-[1.015] hover:border-sky-200 hover:shadow-[0_20px_42px_rgba(37,99,235,0.12)] motion-reduce:transform-none motion-reduce:transition-none">
      <span aria-hidden="true" className={`pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-[0.08] blur-2xl transition-opacity duration-300 group-hover:opacity-20 ${accent}`} />
      <div className="relative flex items-start justify-between gap-3">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset ring-white/80 ${iconTone}`}>
          <MetricIcon name={icon} />
        </span>
        <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white ${accent}`} />
      </div>
      <p className="relative mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="relative mt-2 truncate text-[1.75rem] font-extrabold tracking-tight tabular-nums text-slate-950">{value}</p>
      <p className="relative mt-1.5 min-h-8 text-xs leading-5 text-slate-600">{detail}</p>
    </article>
  );
}

function ChartEmpty({ children }) {
  return <div className="flex h-full min-h-48 items-center justify-center rounded-xl border border-dashed border-sky-200 bg-sky-50/40 px-4 text-center text-sm text-slate-600">{children}</div>;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const labelText = /^\d{4}-\d{2}-\d{2}$/.test(String(label))
    ? dateFormatter.format(new Date(`${label}T00:00:00Z`))
    : label;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3.5 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.14)] backdrop-blur">
      <p className="text-xs font-medium text-slate-500">{labelText}</p>
      <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
        {payload[0].name}: {Number(payload[0].value || 0).toLocaleString()}
      </p>
    </div>
  );
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
      iconTone: "bg-sky-50 text-sky-700",
      icon: "users",
    },
    {
      label: "Pending verifications",
      value: summary ? summary.pendingVerifications.toLocaleString() : "—",
      detail: "Registered providers awaiting review",
      accent: "bg-amber-500",
      iconTone: "bg-amber-50 text-amber-700",
      icon: "verification",
    },
    {
      label: "Active bookings",
      value: summary ? summary.activeBookings.toLocaleString() : "—",
      detail: summary ? `${summary.pendingBookings} pending · ${summary.inProgressBookings} underway` : "Current booking statuses",
      accent: "bg-teal-600",
      iconTone: "bg-teal-50 text-teal-700",
      icon: "bookings",
    },
    {
      label: "Completed value",
      value: summary ? currency.format(summary.completedValue) : "—",
      detail: summary ? `${summary.completedBookings.toLocaleString()} completed bookings` : "Total completed booking value",
      accent: "bg-emerald-500",
      iconTone: "bg-emerald-50 text-emerald-700",
      icon: "value",
    },
  ];
  const databaseConnected = data?.system?.database === "connected";
  const apiOperational = Boolean(data) && !error;
  const refreshDashboard = () => setRefreshVersion((value) => value + 1);

  return (
    <section aria-labelledby="admin-overview-title" className="space-y-6 sm:space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-white/80 bg-white/65 px-5 py-5 shadow-[0_12px_34px_rgba(15,23,42,0.045)] backdrop-blur-lg sm:px-6">
        <div>
          <h1 id="admin-overview-title" className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Admin dashboard</h1>
          <p className="mt-1.5 text-sm text-slate-600">Platform activity and service health</p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${databaseConnected && apiOperational ? "border-emerald-200 bg-emerald-50 text-emerald-900" : error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            <span className="relative flex h-2.5 w-2.5">
              {databaseConnected && apiOperational && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50 motion-reduce:animate-none" />}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${databaseConnected && apiOperational ? "bg-emerald-500 ring-4 ring-emerald-100" : error ? "bg-rose-500 ring-4 ring-rose-100" : "bg-amber-500 ring-4 ring-amber-100"}`} />
            </span>
            {databaseConnected && apiOperational ? "All systems operational" : error ? "Health check needs attention" : "Checking system"}
          </span>
          {data?.system?.checkedAt && <span className="text-xs tabular-nums text-slate-500">Updated {new Date(data.system.checkedAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</span>}
          <button
            type="button"
            onClick={refreshDashboard}
            disabled={isLoading}
            className="dashboard-focus inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-blue-950 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 active:scale-[0.98] disabled:cursor-wait disabled:opacity-50"
            aria-label="Refresh dashboard"
            title="Refresh dashboard"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true">
              <path d="M20 7v5h-5M4 17v-5h5" />
              <path d="M5.6 9a7 7 0 0 1 11.8-2L20 12M4 12l2.6 5a7 7 0 0 0 11.8-2" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={refreshDashboard} className="dashboard-focus rounded-lg px-2 py-1 font-semibold underline underline-offset-2 hover:bg-rose-100">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <MetricCard key={card.label} {...card} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,1fr)]">
        <section aria-labelledby="booking-trend-title" className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)] sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 id="booking-trend-title" className="text-sm font-bold text-slate-950">Booking volume</h2>
              <p className="mt-1 text-xs text-slate-500">Requests created over the last 30 days</p>
            </div>
            <span className="rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-blue-950">30 days</span>
          </div>
          <div className="admin-chart-container h-64 min-w-0 w-full">
            {data?.bookingTrend?.length ? (
              <ResponsiveContainer key={`booking-trend-${viewportWidth}`} width="100%" height="100%">
                <AreaChart data={data.bookingTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bookingVolumeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#dbeafe" strokeDasharray="4 6" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(date) => dateFormatter.format(new Date(`${date}T00:00:00Z`))} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis allowDecimals={false} width={30} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip labelFormatter={(date) => dateFormatter.format(new Date(`${date}T00:00:00Z`))} content={<ChartTooltip />} cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="bookings" name="Bookings" stroke="#2563eb" strokeWidth={2.5} fill="url(#bookingVolumeFill)" activeDot={{ r: 5, fill: "#2563eb", stroke: "#fff", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : isLoading ? (
              <div role="status" aria-label="Loading booking activity" aria-busy="true" className="flex h-full items-end gap-3 px-8 pb-5 pt-8">
                {[46, 72, 58, 88, 64, 76, 52, 94].map((height, index) => (
                  <SkeletonBlock key={index} className="min-w-2 flex-1 rounded-t-sm rounded-b-none" style={{ height: `${height}%` }} />
                ))}
              </div>
            ) : <ChartEmpty>No bookings recorded in this period</ChartEmpty>}
          </div>
        </section>

        <section aria-labelledby="service-category-title" className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)] sm:p-5">
          <div className="mb-4">
            <h2 id="service-category-title" className="text-sm font-bold text-slate-950">Top service categories</h2>
            <p className="mt-1 text-xs text-slate-500">Bookings grouped by provider&apos;s first listed trade · 30 days</p>
          </div>
          <div className="admin-chart-container h-64 min-w-0 w-full">
            {data?.topCategories?.length ? (
              <ResponsiveContainer key={`service-categories-${viewportWidth}`} width="100%" height="100%">
                <BarChart data={data.topCategories} layout="vertical" margin={{ top: 0, right: 8, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="categoryBarFill" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#2563eb" />
                      <stop offset="100%" stopColor="#38bdf8" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#dbeafe" strokeDasharray="4 6" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="category" width={viewportWidth < 640 ? 88 : 132} tickFormatter={(category) => String(category).length > (viewportWidth < 640 ? 12 : 19) ? `${String(category).slice(0, viewportWidth < 640 ? 11 : 18)}…` : category} tick={{ fill: "#334155", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "#eff6ff" }} content={<ChartTooltip />} />
                  <Bar dataKey="bookings" name="Bookings" fill="url(#categoryBarFill)" radius={[0, 6, 6, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            ) : isLoading ? (
              <div role="status" aria-label="Loading service demand" aria-busy="true" className="flex h-full flex-col justify-center gap-4 px-3">
                {[0, 1, 2, 3, 4].map((index) => (
                  <div key={index} className="flex items-center gap-3">
                    <SkeletonBlock className="h-3 w-16 shrink-0" />
                    <SkeletonBlock className={`h-4 rounded-sm rounded-l-none ${["w-4/5", "w-3/5", "w-2/3", "w-1/2", "w-3/4"][index]}`} />
                  </div>
                ))}
              </div>
            ) : <ChartEmpty>No categorized bookings yet</ChartEmpty>}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section aria-labelledby="recent-bookings-title" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
            <div>
              <h2 id="recent-bookings-title" className="text-sm font-bold text-slate-950">Recent bookings</h2>
              <p className="mt-0.5 text-xs text-slate-500">Latest requests across the platform</p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-700">{data?.recentBookings?.length || 0} shown</span>
          </div>
          {data?.recentBookings?.length ? (
            <div className="divide-y divide-slate-100">
              {data.recentBookings.map((booking) => (
                <article key={booking.id} className="content-arrive flex flex-col items-start justify-between gap-2.5 px-4 py-3.5 transition-colors hover:bg-sky-50/60 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{booking.task}</p>
                    <p className="mt-1 truncate text-xs text-slate-600">{booking.client} <span className="px-1 text-slate-400" aria-hidden="true">→</span> {booking.provider}</p>
                    {booking.serviceDate && <p className="mt-1 text-[11px] tabular-nums text-slate-500">{dateFormatter.format(new Date(booking.serviceDate))}</p>}
                  </div>
                  <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:justify-end">
                    <span className="text-sm font-bold tabular-nums text-slate-900">{currency.format(booking.offeredPrice)}</span>
                    <StatusPill status={booking.status} />
                  </div>
                </article>
              ))}
            </div>
          ) : isLoading ? (
            <div role="status" aria-label="Loading recent bookings" aria-busy="true" className="divide-y divide-slate-100 px-4 sm:px-5">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonBlock className="h-4 w-2/3" />
                    <SkeletonBlock className="h-3 w-1/2" />
                  </div>
                  <SkeletonBlock className="h-6 w-20 shrink-0 rounded-full" />
                </div>
              ))}
            </div>
          ) : <div className="px-5 py-8 text-center text-sm text-slate-500">No bookings yet</div>}
        </section>

        <section aria-labelledby="system-health-title" className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)] sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="system-health-title" className="text-sm font-bold text-slate-950">System health</h2>
              <p className="mt-1 text-xs text-slate-500">Current application status</p>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-bold ${databaseConnected && apiOperational ? "bg-emerald-50 text-emerald-800" : error ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"}`}>
              <span className={`h-2 w-2 rounded-full ring-4 ${databaseConnected && apiOperational ? "bg-emerald-500 ring-emerald-100" : error ? "bg-rose-500 ring-rose-100" : "bg-amber-500 ring-amber-100"}`} />
              {databaseConnected && apiOperational ? "Healthy" : error ? "Attention" : "Checking"}
            </span>
          </div>
          <dl className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/70 px-3">
            <div className="flex items-center justify-between gap-3 py-3 text-xs">
              <dt className="text-slate-600">API</dt>
              <dd className={`inline-flex items-center gap-2 font-semibold ${apiOperational ? "text-emerald-800" : error ? "text-rose-800" : "text-amber-800"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${apiOperational ? "bg-emerald-500" : error ? "bg-rose-500" : "bg-amber-500"}`} />
                {apiOperational ? "Operational" : isLoading ? "Checking…" : "Unavailable"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3 text-xs">
              <dt className="text-slate-600">Database</dt>
              <dd className={`inline-flex items-center gap-2 font-semibold ${databaseConnected ? "text-emerald-800" : error ? "text-rose-800" : "text-amber-800"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${databaseConnected ? "bg-emerald-500" : error ? "bg-rose-500" : "bg-amber-500"}`} />
                {data?.system?.database || (isLoading ? "Checking…" : "Unknown")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3 text-xs">
              <dt className="text-slate-600">Process uptime</dt>
              <dd className="font-semibold tabular-nums text-slate-800">{Number.isFinite(data?.system?.uptimeSeconds) ? `${Math.floor(data.system.uptimeSeconds / 3600)}h ${Math.floor((data.system.uptimeSeconds % 3600) / 60)}m` : "—"}</dd>
            </div>
          </dl>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[11px] leading-4 text-slate-500">
              {data?.system?.checkedAt ? `Checked ${new Date(data.system.checkedAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}` : "Diagnostics update with dashboard data."}
            </p>
            <button type="button" onClick={refreshDashboard} disabled={isLoading} className="dashboard-focus inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-blue-950 transition hover:border-sky-300 hover:bg-sky-100 active:scale-[0.98] disabled:cursor-wait disabled:opacity-50">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true">
                <path d="M20 7v5h-5M4 17v-5h5M5.6 9a7 7 0 0 1 11.8-2L20 12M4 12l2.6 5a7 7 0 0 0 11.8-2" />
              </svg>
              {isLoading ? "Checking" : "Refresh checks"}
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
