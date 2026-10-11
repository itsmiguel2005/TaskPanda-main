import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { adminRequest } from "../services/adminApi.js";
import { SkeletonBlock } from "./Skeletons.jsx";

const dateTime = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : dateTime.format(date);
}

function formatServiceDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });
}

function reviewLabel(status) {
  if (status === "responded") return "Provider responded";
  if (status === "confirmed") return "Confirmed";
  if (status === "dismissed") return "Dismissed";
  return "Awaiting provider response";
}

function reviewTone(status) {
  if (status === "confirmed") return "border-rose-200 bg-rose-50 text-rose-900";
  if (status === "dismissed") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "responded") return "border-blue-200 bg-blue-50 text-blue-900";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

export default function AdminProviderNoShowReports({ demoReport = null, onDemoReview }) {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("needs_review");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState("");
  const [notes, setNotes] = useState({});
  const [activeActionId, setActiveActionId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (demoReport) {
      setData({
        reports: [demoReport],
        pagination: { page: 1, pageSize: 25, total: 1, pages: 1 },
      });
      setIsLoading(false);
      setError("");
      return undefined;
    }
    if (!token) {
      logout();
      navigate("/login", { replace: true });
      return undefined;
    }
    const controller = new AbortController();
    const query = new URLSearchParams({ status, page: String(page) });
    setIsLoading(true);
    setError("");
    adminRequest(`/api/admin/provider-no-show-reports?${query}`, token, { signal: controller.signal })
      .then(setData)
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        if (requestError.status === 401) {
          logout();
          navigate("/login", { replace: true });
          return;
        }
        setError(requestError.message || "Could not load provider no-show reports.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [demoReport, logout, navigate, page, refreshKey, status, token]);

  useEffect(() => {
    if (demoReport) return undefined;
    const intervalId = window.setInterval(() => {
      if (!document.hidden) setRefreshKey((value) => value + 1);
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, [demoReport]);

  async function reviewReport(report, action) {
    const actionId = `${report.id}:${action}`;
    setActiveActionId(actionId);
    setError("");
    setNotice("");
    try {
      if (demoReport) {
        const nextStatus = action === "confirm" ? "confirmed" : "dismissed";
        const reviewNote = notes[report.id] || "";
        setData((current) => ({
          ...current,
          reports: current.reports.map((item) => item.id === report.id
            ? { ...item, reviewStatus: nextStatus, adminNotes: reviewNote, reviewedAt: new Date().toISOString(), reviewedBy: "Admin reviewer" }
            : item),
        }));
        setNotice(action === "confirm"
          ? "Demo: the report is confirmed and the reliability flag is added."
          : "Demo: the report is dismissed and no reliability flag is added.");
        onDemoReview?.(action, reviewNote);
        return;
      }
      const result = await adminRequest(`/api/admin/provider-no-show-reports/${encodeURIComponent(report.id)}`, token, {
        method: "PATCH",
        body: JSON.stringify({ action, notes: notes[report.id] || "" }),
      });
      setNotice(result.message || "No-show report reviewed.");
      setExpandedId("");
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      if (requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(requestError.message || "Could not save the no-show review.");
    } finally {
      setActiveActionId("");
    }
  }

  const reports = data?.reports || [];

  return (
    <section aria-labelledby="provider-no-show-reports-title" className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="provider-no-show-reports-title" className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Provider no-show reports</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">Review the client’s report alongside the provider’s response. Reports are not counted as confirmed reliability issues until reviewed.</p>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={isLoading} className="dashboard-focus min-h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50">
          {isLoading ? "Refreshing…" : "Refresh reports"}
        </button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-800">
          Review status
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); setExpandedId(""); }} className="dashboard-focus h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
            <option value="needs_review">Needs review</option>
            <option value="reviewed">Reviewed</option>
            <option value="all">All reports</option>
          </select>
        </label>
        <p className="text-xs text-slate-600">{data ? `${data.pagination.total.toLocaleString()} reports` : "Loading report count"}</p>
      </div>

      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{notice}</p>}
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="dashboard-focus rounded-lg px-2 py-1 font-semibold underline underline-offset-2">Retry</button>
        </div>
      )}

      {isLoading && !data ? (
        <div role="status" aria-label="Loading provider no-show reports" className="space-y-3">
          <SkeletonBlock className="h-36 w-full rounded-2xl" />
          <SkeletonBlock className="h-36 w-full rounded-2xl" />
          <span className="sr-only">Loading provider no-show reports</span>
        </div>
      ) : reports.length ? (
        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {reports.map((report) => {
            const isExpanded = expandedId === report.id;
            const isReviewed = ["confirmed", "dismissed"].includes(report.reviewStatus);
            const isSaving = activeActionId.startsWith(`${report.id}:`);
            return (
              <article key={report.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-950">{report.task}</h2>
                    <p className="mt-1 text-sm text-slate-700">{report.client} reported that {report.provider} did not arrive.</p>
                    <p className="mt-1 text-xs text-slate-600">Appointment: {formatServiceDate(report.serviceDate)}{report.timeSlot ? ` · ${report.timeSlot}` : ""}</p>
                    <p className="mt-1 text-xs text-slate-600">Reported: {formatDate(report.reportedAt)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${reviewTone(report.reviewStatus)}`}>{reviewLabel(report.reviewStatus)}</span>
                </div>

                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => { setExpandedId(isExpanded ? "" : report.id); setNotice(""); }}
                  className="dashboard-focus mt-3 rounded-lg px-2 py-1 text-sm font-semibold text-blue-800 underline underline-offset-2"
                >
                  {isExpanded ? "Hide report details" : "Review details"}
                </button>

                {isExpanded && (
                  <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <section>
                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Client report</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-800">The client reported that the provider did not arrive within the scheduled arrival window. The booking has already been cancelled.</p>
                      </section>
                      <section>
                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Provider response</h3>
                        {report.providerResponse ? (
                          <>
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{report.providerResponse}</p>
                            <p className="mt-1 text-xs text-slate-600">Submitted {formatDate(report.providerRespondedAt)}</p>
                          </>
                        ) : <p className="mt-1 text-sm text-slate-700">The provider has not submitted a response.</p>}
                      </section>
                    </div>
                    <section className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Booking check-in</h3>
                      <p className="mt-1 text-sm text-slate-800">
                        {report.checkInSentAt
                          ? `PandaBot check-in sent ${formatDate(report.checkInSentAt)}.`
                          : "No PandaBot check-in was sent before this report."}
                      </p>
                      {report.lateNotice && (
                        <p className="mt-1 text-xs text-slate-700">
                          Provider delay notice: {report.lateNotice.status || "sent"} · Updated ETA {formatDate(report.lateNotice.eta)}.
                        </p>
                      )}
                    </section>

                    {report.adminNotes && (
                      <section>
                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Previous admin note</h3>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-800">{report.adminNotes}</p>
                      </section>
                    )}

                    {isReviewed ? (
                      <p className={`rounded-lg border px-3 py-2 text-sm font-medium ${reviewTone(report.reviewStatus)}`}>
                        Reviewed {formatDate(report.reviewedAt)}{report.reviewedBy ? ` by ${report.reviewedBy}` : ""}.
                      </p>
                    ) : (
                      <>
                        <label htmlFor={`no-show-admin-note-${report.id}`} className="block text-sm font-semibold text-slate-900">Admin review note <span className="font-normal text-slate-600">(optional)</span></label>
                        <textarea
                          id={`no-show-admin-note-${report.id}`}
                          value={notes[report.id] || ""}
                          onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))}
                          maxLength={2000}
                          rows={3}
                          placeholder="Record a short explanation that the provider can see."
                          className="dashboard-focus w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-5 text-slate-900 placeholder:text-slate-500"
                        />
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="button" onClick={() => void reviewReport(report, "dismiss")} disabled={isSaving} className="dashboard-focus min-h-10 rounded-lg border border-emerald-300 bg-white px-3.5 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-50">{isSaving && activeActionId.endsWith(":dismiss") ? "Saving…" : "Dismiss report"}</button>
                          <button type="button" onClick={() => void reviewReport(report, "confirm")} disabled={isSaving} className="dashboard-focus min-h-10 rounded-lg bg-rose-700 px-3.5 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-wait disabled:opacity-50">{isSaving && activeActionId.endsWith(":confirm") ? "Saving…" : "Confirm no-show"}</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center">
          <h2 className="text-base font-bold text-slate-950">{status === "all" ? "No provider no-show reports" : status === "reviewed" ? "No reviewed no-show reports" : "No no-show reports need review"}</h2>
          <p className="mt-2 text-sm text-slate-600">Client-reported provider no-shows will appear here automatically. The booking can be cancelled while the report waits for review.</p>
        </div>
      )}

      {data && data.pagination.pages > 1 && (
        <nav aria-label="Provider no-show report pages" className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || isLoading} className="dashboard-focus min-h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 disabled:opacity-50">Previous</button>
          <p className="text-sm text-slate-600">Page {page} of {data.pagination.pages}</p>
          <button type="button" onClick={() => setPage((value) => Math.min(data.pagination.pages, value + 1))} disabled={page >= data.pagination.pages || isLoading} className="dashboard-focus min-h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 disabled:opacity-50">Next</button>
        </nav>
      )}
    </section>
  );
}
