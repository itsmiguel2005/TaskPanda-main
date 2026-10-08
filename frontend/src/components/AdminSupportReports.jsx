import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { SkeletonBlock } from "./Skeletons.jsx";
import { adminRequest } from "../services/adminApi.js";

const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" });
const timeOnly = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" });

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : dateTime.format(date);
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : timeOnly.format(date);
}

function StatusBadge({ status }) {
  const resolved = status === "resolved";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${resolved ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${resolved ? "bg-emerald-500" : "bg-amber-500"}`} />
      {resolved ? "Resolved" : "Open"}
    </span>
  );
}

function ActionButton({ children, onClick, disabled = false, tone = "neutral", type = "button" }) {
  const tones = {
    neutral: "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
    amber: "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
    rose: "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`dashboard-focus inline-flex min-h-10 items-center justify-center rounded-xl border px-3.5 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-50 ${tones[tone]}`}>
      {children}
    </button>
  );
}

export default function AdminSupportReports() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeReportId, setActiveReportId] = useState("");
  const [reportDetails, setReportDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [moderationTarget, setModerationTarget] = useState(null);
  const [moderationReason, setModerationReason] = useState("");
  const [activeActionId, setActiveActionId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const reportDialogRef = useRef(null);
  const moderationDialogRef = useRef(null);

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

  useEffect(() => {
    if (activeReportId && data && !data.reports.some((report) => report.id === activeReportId)) {
      setActiveReportId("");
    }
  }, [activeReportId, data]);

  useEffect(() => {
    if (!activeReportId || !token) {
      setReportDetails(null);
      setAdminNotes("");
      return undefined;
    }

    const report = data?.reports?.find((item) => item.id === activeReportId);
    if (!report) return undefined;
    const controller = new AbortController();
    setDetailsLoading(true);
    setDetailsError("");
    setReportDetails(null);
    setAdminNotes("");
    adminRequest(
      `/api/admin/support-reports/${encodeURIComponent(report.conversationId)}/${encodeURIComponent(report.id)}`,
      token,
      { signal: controller.signal },
    )
      .then((details) => {
        setReportDetails(details);
        setAdminNotes(details.adminNotes || "");
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        if (requestError.status === 401) {
          logout();
          navigate("/login", { replace: true });
          return;
        }
        setDetailsError(requestError.message || "Could not load report context.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailsLoading(false);
      });
    return () => controller.abort();
  }, [activeReportId, data, logout, navigate, refreshKey, token]);

  useEffect(() => {
    const dialog = reportDialogRef.current;
    if (activeReportId && dialog && !dialog.open) dialog.showModal();
    if (!activeReportId && dialog?.open) dialog.close();
  }, [activeReportId]);

  useEffect(() => {
    const dialog = moderationDialogRef.current;
    if (moderationTarget && dialog && !dialog.open) dialog.showModal();
    if (!moderationTarget && dialog?.open) dialog.close();
  }, [moderationTarget]);

  async function updateReport(report, action, payload = {}) {
    const actionId = `${report.id}:${action}`;
    setActiveActionId(actionId);
    setError("");
    setNotice("");
    try {
      const result = await adminRequest(
        `/api/admin/support-reports/${encodeURIComponent(report.conversationId)}/${encodeURIComponent(report.id)}`,
        token,
        { method: "PATCH", body: JSON.stringify({ action, ...payload }) },
      );
      if (result.message) setNotice(result.message);
      setRefreshKey((value) => value + 1);
      return true;
    } catch (requestError) {
      if (requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return false;
      }
      setError(requestError.message || "Could not update the support report.");
      return false;
    } finally {
      setActiveActionId("");
    }
  }

  async function submitModerationAction(event) {
    event.preventDefault();
    if (!moderationTarget) return;
    const { report, action } = moderationTarget;
    const succeeded = await updateReport(report, action, { reason: moderationReason.trim() });
    if (succeeded) {
      setModerationTarget(null);
      setModerationReason("");
    }
  }

  async function saveNotes(report, action = "save_notes") {
    await updateReport(report, action, { notes: adminNotes });
  }

  const expandedReport = data?.reports?.find((report) => report.id === activeReportId);
  const isSavingReport = Boolean(activeReportId && activeActionId.startsWith(`${activeReportId}:`));
  const moderationIsSuspension = moderationTarget?.action === "suspend";
  const validModerationReason = moderationReason.trim().length >= 5 && moderationReason.trim().length <= 500;

  return (
    <section aria-labelledby="admin-support-reports-title" className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="admin-support-reports-title" className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Support reports</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">Review conversation reports, examine recent context, and record account actions.</p>
        </div>
        <ActionButton onClick={() => setRefreshKey((value) => value + 1)} disabled={isLoading}>
          {isLoading ? "Refreshing…" : "Refresh reports"}
        </ActionButton>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-800">
          Report status
          <select value={status} onChange={(event) => { setPage(1); setActiveReportId(""); setStatus(event.target.value); }} className="dashboard-focus h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
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
        <div role="status" aria-label="Loading support reports" className="space-y-3">
          <SkeletonBlock className="h-36 w-full rounded-2xl" />
          <SkeletonBlock className="h-36 w-full rounded-2xl" />
          <span className="sr-only">Loading support reports</span>
        </div>
      ) : data?.reports?.length ? (
        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {data.reports.map((report) => {
            return (
              <article key={report.id} className="bg-white">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setActiveReportId(report.id)}
                  className="dashboard-focus flex w-full items-start justify-between gap-4 p-4 text-left transition-colors hover:bg-sky-50/60 sm:p-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-950">Reported by {report.reporter}</span>
                      <StatusBadge status={report.status} />
                    </span>
                    <span className="mt-1 block text-xs text-slate-600">{report.reporterRole} · {formatDate(report.createdAt)}</span>
                    <span className="mt-2 block truncate text-sm leading-5 text-slate-700">{report.details}</span>
                  </span>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="mt-1 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true">
                    <path d="M4.5 10h11m-4.5-4.5L15.5 10 11 14.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center">
          <h2 className="text-base font-bold text-slate-950">No {status === "all" ? "" : `${status} `}reports found</h2>
          <p className="mt-2 text-sm text-slate-600">Reports submitted from booking conversations will appear here.</p>
        </div>
      )}

      <dialog
        ref={reportDialogRef}
        aria-labelledby="support-report-dialog-title"
        onCancel={(event) => { event.preventDefault(); setActiveReportId(""); }}
        className="m-auto max-h-[calc(100dvh-1rem)] w-[min(58rem,calc(100%-1rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-[0_24px_72px_rgba(15,23,42,0.28)] backdrop:bg-slate-950/45 sm:max-h-[calc(100dvh-2rem)] sm:w-[min(58rem,calc(100%-2rem))]"
      >
        <div className="flex max-h-[calc(100dvh-1rem)] flex-col sm:max-h-[calc(100dvh-2rem)]">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="support-report-dialog-title" className="text-base font-bold text-slate-950 sm:text-lg">
                  {expandedReport ? `Report from ${expandedReport.reporter}` : "Support report"}
                </h2>
                {(reportDetails || expandedReport) && <StatusBadge status={reportDetails?.status || expandedReport?.status} />}
              </div>
              <p className="mt-1 text-xs text-slate-600">{formatDate(reportDetails?.createdAt || expandedReport?.createdAt)}</p>
            </div>
            <button type="button" onClick={() => setActiveReportId("")} aria-label="Close report details" className="dashboard-focus inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
            {detailsLoading ? (
              <div role="status" aria-label="Loading report context" className="space-y-3">
                <SkeletonBlock className="h-24 w-full rounded-xl" />
                <SkeletonBlock className="h-40 w-full rounded-xl" />
                <span className="sr-only">Loading report details</span>
              </div>
            ) : detailsError ? (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                <span>{detailsError}</span>
                <ActionButton onClick={() => setRefreshKey((value) => value + 1)}>Retry details</ActionButton>
              </div>
            ) : reportDetails && expandedReport ? (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reporter</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">{reportDetails.reporter.name}</p>
                    <p className="text-xs capitalize text-slate-500">{reportDetails.reporter.role}</p>
                    {reportDetails.reporter.email && <p className="mt-1 break-all text-xs text-slate-600">{reportDetails.reporter.email}</p>}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reported user</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">{reportDetails.reportedUser.name}</p>
                    <p className="text-xs capitalize text-slate-500">{reportDetails.reportedUser.role}{reportDetails.reportedUser.isSuspended ? " · suspended" : ""}</p>
                    {reportDetails.reportedUser.email && <p className="mt-1 break-all text-xs text-slate-600">{reportDetails.reportedUser.email}</p>}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Submitted</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{formatDate(reportDetails.createdAt)}</p>
                    <p className="text-xs text-slate-500">Report timestamp</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Account flags</p>
                      <p className="mt-1 text-xs text-slate-600">Reports naming this user</p>
                    </div>
                    <span className={`inline-flex min-w-9 items-center justify-center rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${reportDetails.risk.reportCount >= 3 ? "bg-rose-100 text-rose-900" : reportDetails.risk.reportCount ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>
                      {reportDetails.risk.reportCount}
                    </span>
                  </div>
                </div>

                <section aria-labelledby={`report-detail-heading-${expandedReport.id}`} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 id={`report-detail-heading-${expandedReport.id}`} className="text-sm font-bold text-slate-950">Report details</h3>
                    <StatusBadge status={reportDetails.status} />
                  </div>
                  <p className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800">{reportDetails.details}</p>
                  <dl className="grid gap-3 pt-1 text-xs sm:grid-cols-3">
                    <div><dt className="font-semibold text-slate-500">Client</dt><dd className="mt-1 text-slate-800">{expandedReport.client}</dd></div>
                    <div><dt className="font-semibold text-slate-500">Provider</dt><dd className="mt-1 text-slate-800">{expandedReport.provider}</dd></div>
                    <div><dt className="font-semibold text-slate-500">Booking</dt><dd className="mt-1 text-slate-800">{reportDetails.booking.task || "Booking unavailable"}{reportDetails.booking.status ? ` · ${reportDetails.booking.status}` : ""}</dd></div>
                  </dl>
                </section>

                <section aria-labelledby={`report-transcript-${expandedReport.id}`}>
                  <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                    <h3 id={`report-transcript-${expandedReport.id}`} className="text-sm font-bold text-slate-950">Recent chat context</h3>
                    <p className="text-xs text-slate-500">Up to 20 messages before report submission</p>
                  </div>
                  <div role="region" aria-label="Chat context transcript" tabIndex={0} className="max-h-72 space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">
                    {reportDetails.transcript.length ? reportDetails.transcript.map((message) => (
                      <article key={message.id} className={`max-w-[92%] rounded-xl px-3 py-2 ${message.senderRole === "client" ? "mr-auto bg-sky-50" : message.senderRole === "provider" ? "ml-auto bg-emerald-50" : "mx-auto bg-slate-100"}`}>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[11px] font-bold capitalize text-slate-600">{message.senderRole === "system" ? "TaskPanda" : message.senderRole}</span>
                          <time className="text-[10px] tabular-nums text-slate-500" dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-800">{message.text || (message.eventType ? message.eventType.replaceAll("_", " ") : "Attachment or booking event")}</p>
                      </article>
                    )) : (
                      <p className="py-7 text-center text-sm text-slate-500">No chat messages were sent before this report.</p>
                    )}
                  </div>
                </section>

                <section aria-labelledby={`admin-notes-${expandedReport.id}`} className="space-y-2">
                  <label id={`admin-notes-${expandedReport.id}`} htmlFor={`report-notes-${expandedReport.id}`} className="block text-sm font-bold text-slate-950">Admin notes</label>
                  <textarea
                    id={`report-notes-${expandedReport.id}`}
                    value={adminNotes}
                    onChange={(event) => setAdminNotes(event.target.value)}
                    maxLength={2000}
                    rows={3}
                    placeholder="Log findings, follow-up, or resolution details for other admins."
                    className="dashboard-focus w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-5 text-slate-900 placeholder:text-slate-500"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">{adminNotes.length}/2000 characters{reportDetails.resolvedAt ? ` · resolved ${formatDate(reportDetails.resolvedAt)}` : ""}</p>
                    <ActionButton onClick={() => saveNotes(expandedReport)} disabled={isSavingReport} tone="emerald">
                      {activeActionId === `${expandedReport.id}:save_notes` ? "Saving notes…" : "Save notes"}
                    </ActionButton>
                  </div>
                </section>

                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                  <ActionButton
                    onClick={() => saveNotes(expandedReport, reportDetails.status === "open" ? "resolve" : "reopen")}
                    disabled={isSavingReport}
                    tone={reportDetails.status === "open" ? "emerald" : "neutral"}
                  >
                    {activeActionId === `${expandedReport.id}:resolve` ? "Resolving…" : activeActionId === `${expandedReport.id}:reopen` ? "Reopening…" : reportDetails.status === "open" ? "Mark resolved" : "Reopen report"}
                  </ActionButton>
                  {reportDetails.reportedUser.isSuspended ? (
                    <span className="inline-flex min-h-10 items-center rounded-xl bg-slate-100 px-3.5 text-sm font-semibold text-slate-600">Account suspended</span>
                  ) : (
                    <ActionButton onClick={() => { setModerationReason(""); setModerationTarget({ report: expandedReport, action: "suspend" }); }} disabled={isSavingReport} tone="rose">
                      Suspend account
                    </ActionButton>
                  )}
                  <ActionButton onClick={() => { setModerationReason(""); setModerationTarget({ report: expandedReport, action: "send_warning" }); }} disabled={isSavingReport} tone="amber">
                    Send warning
                  </ActionButton>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </dialog>

      {data && data.pagination.pages > 1 && (
        <nav aria-label="Support report pages" className="flex items-center justify-between gap-3">
          <ActionButton onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || isLoading}>Previous</ActionButton>
          <p className="text-sm text-slate-600">Page {page} of {data.pagination.pages}</p>
          <ActionButton onClick={() => setPage((value) => Math.min(data.pagination.pages, value + 1))} disabled={page >= data.pagination.pages || isLoading}>Next</ActionButton>
        </nav>
      )}

      <dialog
        ref={moderationDialogRef}
        aria-labelledby="moderation-confirm-title"
        onCancel={(event) => { event.preventDefault(); setModerationTarget(null); }}
        className="m-auto w-[min(30rem,calc(100%-2rem))] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-[0_24px_72px_rgba(15,23,42,0.28)] backdrop:bg-slate-950/40"
      >
        {moderationTarget && (
          <form onSubmit={submitModerationAction} className="space-y-4 p-5 sm:p-6">
            <div>
              <h2 id="moderation-confirm-title" className="text-lg font-bold text-slate-950">
                {moderationIsSuspension ? "Suspend reported account?" : "Send account warning?"}
              </h2>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                {moderationIsSuspension
                  ? `This will suspend ${reportDetails?.reportedUser.name || "the reported user"} and revoke active sessions.`
                  : `This warning will be saved to ${reportDetails?.reportedUser.name || "the reported user"}’s in-app notifications.`}
              </p>
            </div>
            <label htmlFor="moderation-reason" className="block text-sm font-semibold text-slate-800">
              {moderationIsSuspension ? "Suspension reason" : "Warning message"}
              <textarea
                id="moderation-reason"
                autoFocus
                required
                minLength={5}
                maxLength={500}
                rows={4}
                value={moderationReason}
                onChange={(event) => setModerationReason(event.target.value)}
                placeholder={moderationIsSuspension ? "Explain the policy reason for this suspension." : "Write a clear, respectful warning to the account holder."}
                className="dashboard-focus mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal leading-5 text-slate-900 placeholder:text-slate-500"
              />
            </label>
            <p className="text-xs text-slate-500">{moderationReason.trim().length}/500 characters · At least 5 characters required.</p>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <ActionButton onClick={() => setModerationTarget(null)} disabled={Boolean(activeActionId)}>Cancel</ActionButton>
              <ActionButton type="submit" tone={moderationIsSuspension ? "rose" : "amber"} disabled={!validModerationReason || Boolean(activeActionId)}>
                {activeActionId === `${moderationTarget.report.id}:${moderationTarget.action}`
                  ? moderationIsSuspension ? "Suspending…" : "Sending…"
                  : moderationIsSuspension ? "Confirm suspension" : "Send warning"}
              </ActionButton>
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
}
