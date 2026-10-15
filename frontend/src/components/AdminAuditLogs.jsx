import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { adminRequest } from "../services/adminApi.js";

const PAGE_SIZE = 25;

const CATEGORY_TONES = {
  SECURITY: "border-rose-200 bg-rose-50 text-rose-800",
  OPERATIONS: "border-indigo-200 bg-indigo-50 text-indigo-800",
  FINANCIAL: "border-sky-200 bg-sky-50 text-sky-800",
  GOVERNANCE: "border-violet-200 bg-violet-50 text-violet-800",
};

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories", description: "Browse every admin event", dot: "bg-slate-400" },
  { value: "SECURITY", label: "Security", description: "Sign-in and account safety", dot: "bg-rose-500" },
  { value: "OPERATIONS", label: "Operations", description: "Users and service reviews", dot: "bg-indigo-500" },
  { value: "FINANCIAL", label: "Financial", description: "Refunds, payouts and fees", dot: "bg-sky-500" },
  { value: "GOVERNANCE", label: "Governance", description: "Reports and system changes", dot: "bg-violet-500" },
];

function ChevronIcon({ open = false }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 text-slate-500 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path d="m4.5 10.25 3.5 3.5 7.5-7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CategoryFilter({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const selectedIndex = CATEGORY_OPTIONS.findIndex((option) => option.value === value);
  const selectedOption = CATEGORY_OPTIONS[selectedIndex] || CATEGORY_OPTIONS[0];

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleFocusIn = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [open]);

  const focusOption = (index) => {
    const boundedIndex = (index + CATEGORY_OPTIONS.length) % CATEGORY_OPTIONS.length;
    optionRefs.current[boundedIndex]?.focus({ preventScroll: true });
  };

  const openAt = (index) => {
    setOpen(true);
    requestAnimationFrame(() => focusOption(index));
  };

  const selectOption = (option) => {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAt(Math.max(0, selectedIndex));
    } else if (event.key === "Home") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      openAt(CATEGORY_OPTIONS.length - 1);
    }
  };

  const handleOptionKeyDown = (event, index) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(CATEGORY_OPTIONS.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative z-20">
      <span id="audit-category-label" className="mb-1.5 block text-sm font-medium text-slate-700">Category</span>
      <button
        ref={triggerRef}
        type="button"
        aria-labelledby="audit-category-label"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="audit-category-options"
        onClick={() => (open ? setOpen(false) : openAt(Math.max(0, selectedIndex)))}
        onKeyDown={handleTriggerKeyDown}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 text-left text-sm text-slate-900 outline-none transition duration-150 focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ${
          open
            ? "border-indigo-400 shadow-[0_0_0_3px_rgba(99,102,241,0.1)]"
            : "border-slate-300 hover:border-slate-400"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${selectedOption.dot}`} />
          <span className="truncate font-medium">{selectedOption.label}</span>
        </span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div
          id="audit-category-options"
          role="listbox"
          aria-labelledby="audit-category-label"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_14px_32px_rgba(15,23,42,0.14)] ring-1 ring-slate-950/[0.03]"
        >
          {CATEGORY_OPTIONS.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value || "all"}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onClick={() => selectOption(option)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
                  isSelected ? "bg-indigo-50" : "hover:bg-slate-50"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${option.dot}`} />
                  <span className="min-w-0">
                    <span className={`block text-sm font-medium ${isSelected ? "text-indigo-900" : "text-slate-800"}`}>
                      {option.label}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{option.description}</span>
                  </span>
                </span>
                {isSelected && <span className="shrink-0 text-indigo-700"><CheckIcon /></span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function actionTone(action, category) {
  if (action === "ADMIN_LOGOUT") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }
  if (action === "ADMIN_LOGIN") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }
  if (
    ["USER_SUSPENDED", "PROVIDER_SUSPENDED", "FAILED_LOGIN_ATTEMPT", "REVIEW_REMOVED"].includes(action)
    || /(?:DELETE|SUSPEND|REMOVE)/.test(action)
  ) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (
    ["ROLE_MODIFIED", "SYSTEM_SETTING_TOGGLED", "PLATFORM_FEE_MODIFIED", "USER_UNSUSPENDED", "REFUND_ISSUED"].includes(action)
    || /(?:OVERRIDE|MODIFIED|TOGGLED|UNSUSPEND)/.test(action)
  ) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (action === "VERIFICATION_APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (action === "VERIFICATION_REJECTED") return "border-amber-200 bg-amber-50 text-amber-800";
  return CATEGORY_TONES[category] || "border-slate-200 bg-slate-50 text-slate-700";
}

function formatAction(action) {
  return String(action || "").replaceAll("_", " ").toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTimestamp(value) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function formatExactTimestamp(value) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? String(value || "Unknown time") : timestamp.toISOString();
}

function formatTarget(log) {
  if (!log.targetResource && !log.targetId) return "";
  const resource = log.targetResource || "Target";
  if (!log.targetId) return resource;
  const id = String(log.targetId);
  const shortId = id.length > 10 ? `${id.slice(0, 4)}...${id.slice(-3)}` : id;
  return `${resource} #${shortId}`;
}

function fullTarget(log) {
  return [log.targetResource, log.targetId].filter(Boolean).join(" · ");
}

function formatUserAgent(value) {
  if (!value) return "Unknown client";
  const browser = /(?:Edg|Edge|EdgiOS|EdgA)\//i.test(value)
    ? "Edge"
    : /OPR\//i.test(value)
      ? "Opera"
      : /(?:Firefox|FxiOS)\//i.test(value)
        ? "Firefox"
        : /(?:Chrome|CriOS)\//i.test(value)
          ? "Chrome"
          : /Safari\//i.test(value)
            ? "Safari"
            : /(?:MSIE|Trident\/)/i.test(value)
              ? "Internet Explorer"
              : "Unknown browser";
  const os = /Android/i.test(value)
    ? "Android"
    : /(?:iPhone|iPad|iPod|CPU iPhone)/i.test(value)
      ? "iOS"
      : /Windows NT/i.test(value)
        ? "Windows"
        : /Mac OS X/i.test(value)
          ? "macOS"
          : /CrOS/i.test(value)
            ? "ChromeOS"
            : /Linux/i.test(value)
              ? "Linux"
              : "Unknown OS";
  return `${browser} on ${os}`;
}

function formatIpAddress(value) {
  if (value === "::1" || value === "::ffff:127.0.0.1") return "127.0.0.1 (Localhost)";
  return value || "—";
}

function AuditDetail({ log, id }) {
  const timestamp = new Date(log.createdAt);
  const validTimestamp = !Number.isNaN(timestamp.getTime());
  return (
    <section id={id} aria-label="Audit log details" className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Target</h3>
          <p className="mt-1 break-words font-medium text-slate-900">{fullTarget(log) || "No target recorded"}</p>
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exact timestamp (UTC)</h3>
          {validTimestamp
            ? <time dateTime={timestamp.toISOString()} className="mt-1 block break-all font-mono text-xs text-slate-800">{timestamp.toISOString()}</time>
            : <p className="mt-1 break-all font-mono text-xs text-slate-800">{formatExactTimestamp(log.createdAt)}</p>}
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Full user agent</h3>
          <p className="mt-1 break-all text-xs leading-5 text-slate-700">{log.userAgent || "Unknown client"}</p>
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">IP address</h3>
          <p className="mt-1 break-all text-xs text-slate-700">{log.ipAddress || "Unknown"}</p>
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Full log payload</h3>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-800">{JSON.stringify(log, null, 2)}</pre>
      </div>
    </section>
  );
}

function AuditEntry({ log, isOpen, onToggle }) {
  const detailId = `audit-detail-${log._id}`;
  const target = formatTarget(log);
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={detailId}
        onClick={onToggle}
        className="dashboard-focus block w-full space-y-3 p-4 text-left"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${actionTone(log.action, log.category)}`}>
            {formatAction(log.action)}
          </span>
          <time className="text-xs tabular-nums text-slate-500">{formatTimestamp(log.createdAt)}</time>
        </div>
        <p className="line-clamp-2 text-sm leading-6 text-slate-800">{log.details}</p>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className={`font-semibold ${CATEGORY_TONES[log.category] || ""}`}>{log.category}</span>
          <span className="max-w-full truncate">{log.adminName}</span>
          {target && <span className="max-w-full truncate" title={fullTarget(log)}>{target}</span>}
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-slate-500">
          <span className="min-w-0 truncate">{formatIpAddress(log.ipAddress)} <span aria-hidden="true">·</span> {formatUserAgent(log.userAgent)}</span>
          <span className="shrink-0 font-semibold text-indigo-700">{isOpen ? "Hide details" : "View details"}</span>
        </div>
      </button>
      {isOpen && <div className="border-t border-slate-200 p-3"><AuditDetail log={log} id={detailId} /></div>}
    </article>
  );
}

export default function AdminAuditLogs() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [category, setCategory] = useState("");
  const [adminName, setAdminName] = useState("");
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedLogId, setExpandedLogId] = useState(null);

  useEffect(() => {
    if (!token) {
      logout();
      navigate("/login", { replace: true });
      return undefined;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (category) params.set("category", category);
    if (adminName.trim()) params.set("adminName", adminName.trim());
    setIsLoading(true);
    setError("");
    adminRequest(`/api/admin/audit-logs?${params}`, token, { signal: controller.signal })
      .then((result) => {
        setLogs(Array.isArray(result.logs) ? result.logs : []);
        setPagination(result.pagination || { page, pages: 1, total: 0 });
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        if (requestError.status === 401) {
          logout();
          navigate("/login", { replace: true });
          return;
        }
        setError(requestError.message || "Could not load system audit logs.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [adminName, category, logout, navigate, page, token]);

  const updateCategory = (value) => {
    setCategory(value);
    setPage(1);
  };
  const updateAdminName = (value) => {
    setAdminName(value);
    setPage(1);
  };

  return (
    <section aria-labelledby="audit-logs-title" className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative z-20 border-b border-slate-200 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-1">
          <h2 id="audit-logs-title" className="text-lg font-semibold text-slate-950">System Logs</h2>
          <p className="text-sm text-slate-600">Review administrative security, operations, finance, and governance activity.</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(14rem,1.4fr)]">
          <CategoryFilter value={category} onChange={updateCategory} />
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Admin name
            <input
              type="search"
              value={adminName}
              onChange={(event) => updateAdminName(event.target.value)}
              placeholder="Search by admin name"
              maxLength={100}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-500 transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </label>
        </div>
      </div>

      {error && (
        <div role="alert" className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:mx-6">
          {error}
        </div>
      )}

      {isLoading ? (
        <div role="status" aria-label="Loading audit logs" aria-busy="true" className="min-h-[20rem] space-y-3 p-4 sm:p-6">
          <span className="sr-only">Loading audit logs</span>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="flex min-h-[20rem] flex-col items-center justify-center px-5 py-14 text-center">
          <h3 className="text-sm font-semibold text-slate-900">No audit entries found</h3>
          <p className="mt-1 text-sm text-slate-600">Try a different category or admin name.</p>
        </div>
      ) : (
        <>
          <div className="min-h-[20rem] space-y-3 p-4 md:hidden">
            {logs.map((log) => (
              <AuditEntry
                key={log._id}
                log={log}
                isOpen={expandedLogId === log._id}
                onToggle={() => setExpandedLogId((current) => current === log._id ? null : log._id)}
              />
            ))}
          </div>
          <div className="hidden min-h-[20rem] overflow-x-auto md:block">
            <table className="w-full min-w-[1420px] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[170px]" />
                <col className="w-[180px]" />
                <col className="w-[130px]" />
                <col className="w-[200px]" />
                <col className="w-[180px]" />
                <col className="w-[165px]" />
                <col className="w-[175px]" />
                <col className="w-[220px]" />
              </colgroup>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Time</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Action</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Category</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Admin</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Target</th>
                  <th scope="col" className="px-4 py-3 font-semibold">IP address</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Client</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const isOpen = expandedLogId === log._id;
                  const detailId = `audit-detail-${log._id}`;
                  const target = formatTarget(log);
                  return (
                  <Fragment key={log._id}>
                  <tr
                    onClick={() => setExpandedLogId((current) => current === log._id ? null : log._id)}
                    className={`cursor-pointer align-top transition-colors hover:bg-slate-50/70 ${isOpen ? "bg-slate-50" : ""}`}
                  >
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatTimestamp(log.createdAt)}</td>
                    <td className="overflow-hidden px-4 py-4">
                      <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${actionTone(log.action, log.category)}`}>
                        {formatAction(log.action)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${CATEGORY_TONES[log.category] || "border-slate-200 bg-slate-50 text-slate-700"}`}>
                        {log.category}
                      </span>
                    </td>
                    <td className="overflow-hidden px-4 py-4 font-medium text-slate-800">
                      <span className="block truncate whitespace-nowrap" title={log.adminName}>{log.adminName}</span>
                    </td>
                    <td className="overflow-hidden px-4 py-4 text-slate-600">
                      <span className="block truncate whitespace-nowrap" title={fullTarget(log) || undefined}>{target || "—"}</span>
                    </td>
                    <td className="overflow-hidden whitespace-nowrap px-4 py-4 text-slate-600">
                      <span className="block truncate" title={log.ipAddress || "Unknown"}>{formatIpAddress(log.ipAddress)}</span>
                    </td>
                    <td className="overflow-hidden px-4 py-4 text-slate-600" title={log.userAgent || "Unknown client"}>
                      <span className="block truncate whitespace-nowrap">{formatUserAgent(log.userAgent)}</span>
                    </td>
                    <td className="overflow-hidden px-5 py-4 leading-6 text-slate-700">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 min-w-0">{log.details}</p>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={detailId}
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedLogId((current) => current === log._id ? null : log._id);
                          }}
                          className="dashboard-focus shrink-0 rounded px-1 py-0.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                        >
                          {isOpen ? "Hide" : "View"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${log._id}-details`}>
                      <td colSpan={8} className="px-4 py-4">
                        <AuditDetail log={log} id={detailId} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );})}
              </tbody>
            </table>
          </div>
          <footer className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>Showing {Math.min((page - 1) * PAGE_SIZE + 1, pagination.total)}–{Math.min(page * PAGE_SIZE, pagination.total)} of {pagination.total} entries</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || isLoading}
                className="min-h-10 rounded-lg border border-slate-300 px-3 font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span aria-live="polite" className="min-w-20 text-center">Page {page} of {pagination.pages || 1}</span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pagination.pages || 1, current + 1))}
                disabled={page >= (pagination.pages || 1) || isLoading}
                className="min-h-10 rounded-lg border border-slate-300 px-3 font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}
