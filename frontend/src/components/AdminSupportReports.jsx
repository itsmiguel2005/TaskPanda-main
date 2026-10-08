import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { SkeletonBlock } from "./Skeletons.jsx";
import { adminRequest } from "../services/adminApi.js";

const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" });

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : dateTime.format(date);
}

export default function AdminSupportReports() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeReportId, setActiveReportId] = useState("");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!token) {
      logout();
      navigate("/login", { replace: true });
      return undefined;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({ status, page: String(page) });
    setIsLoading(true);
    setError("");
    adminRequest(`/api/admin/support-reports?${query}`, token, { signal: controller.signal })
      .then(setData)
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        if (requestError.status === 401) {
          logout();
          navigate("/login", { replace: true });
          return;
        }
        setError(requestError.message || "Could not load support reports.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [logout, navigate, page, refreshKey, status, token]);

  async function updateReport(report, action) {
    setActiveReportId(report.id);
    setError("");
    try {
      await adminRequest(
        `/api/admin/support-reports/${encodeURIComponent(report.conversationId)}/${encodeURIComponent(report.id)}`,
        token,
        { method: "PATCH", body: JSON.stringify({ action }) },
      );
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      if (requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(requestError.message || "Could not update the support report.");
    } finally {
      setActiveReportId("");
    }
  }

  return (
    <section aria-labelledby="admin-support-reports-title" className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="admin-support-reports-title" className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Support reports</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">Review reports submitted from client-provider booking conversations and track their resolution.</p>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={isLoading} className="dashboard-focus inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-blue-950 shadow-sm transition hover:bg-sky-50 disabled:cursor-wait disabled:opacity-50">
          {isLoading ? "Refreshing…" : "Refresh reports"}
        </button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-800">
          Report status
          <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} className="dashboard-focus h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All reports</option>
          </select>
        </label>
        <p className="text-xs text-slate-600">{data ? `${data.pagination.total.toLocaleString()} reports` : "Loading report count"}</p>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="dashboard-focus rounded-lg px-2 py-1 font-semibold underline underline-offset-2">Retry</button>
        </div>
      )}

      {isLoading && !data ? (
        <div role="status" aria-label="Loading support reports" className="space-y-3">
          <SkeletonBlock className="h-36 w-full rounded-2xl" />
          <SkeletonBlock className="h-36 w-full rounded-2xl" />
          <span className="sr-only">Loading support reports</span>
        </div>
      ) : data?.reports?.length ? (
        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {data.reports.map((report) => (
            <article key={report.id} className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-950">Reported by {report.reporter}</h2>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${report.status === "open" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                      {report.status === "open" ? "Open" : "Resolved"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{report.reporterRole} · {formatDate(report.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateReport(report, report.status === "open" ? "resolve" : "reopen")}
                  disabled={activeReportId === report.id || isLoading}
                  className="dashboard-focus min-h-10 rounded-xl border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-950 transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-50"
                >
                  {activeReportId === report.id ? "Saving…" : report.status === "open" ? "Mark resolved" : "Reopen report"}
                </button>
              </div>
              <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800">{report.details}</p>
              <dl className="grid gap-3 text-xs sm:grid-cols-3">
                <div><dt className="font-semibold text-slate-500">Client</dt><dd className="mt-1 text-slate-800">{report.client}</dd></div>
                <div><dt className="font-semibold text-slate-500">Provider</dt><dd className="mt-1 text-slate-800">{report.provider}</dd></div>
                <div><dt className="font-semibold text-slate-500">Booking</dt><dd className="mt-1 text-slate-800">{report.bookingTask || "Booking unavailable"}{report.bookingStatus ? ` · ${report.bookingStatus}` : ""}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center">
          <h2 className="text-base font-bold text-slate-950">No {status === "all" ? "" : `${status} `}reports found</h2>
          <p className="mt-2 text-sm text-slate-600">Reports submitted from booking conversations will appear here.</p>
        </div>
      )}

      {data && data.pagination.pages > 1 && (
        <nav aria-label="Support report pages" className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || isLoading} className="dashboard-focus min-h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-50">Previous</button>
          <p className="text-sm text-slate-600">Page {page} of {data.pagination.pages}</p>
          <button type="button" onClick={() => setPage((value) => Math.min(data.pagination.pages, value + 1))} disabled={page >= data.pagination.pages || isLoading} className="dashboard-focus min-h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-50">Next</button>
        </nav>
      )}
    </section>
  );
}
