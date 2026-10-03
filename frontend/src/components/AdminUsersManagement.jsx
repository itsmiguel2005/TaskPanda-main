import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "clients", label: "Clients" },
  { id: "providers", label: "Providers" },
  { id: "suspended", label: "Suspended" },
  { id: "archived", label: "Archived" },
];

const STATUS_STYLES = {
  Active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Pending: "border-amber-200 bg-amber-50 text-amber-800",
  Suspended: "border-rose-200 bg-rose-50 text-rose-800",
  Archived: "border-slate-200 bg-slate-100 text-slate-700",
};

const dateFormatter = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function formatDate(value, formatter = dateFormatter) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : formatter.format(date);
}

async function readApiResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const responseText = await response.text();
    if (responseText.trimStart().startsWith("<!DOCTYPE html") || responseText.trimStart().startsWith("<html")) {
      throw new Error("The server returned the app page instead of API data. Restart the backend server, then retry.");
    }
    throw new Error("The server returned an unexpected response. Please retry.");
  }
  return response.json();
}

function Icon({ name, className = "h-4 w-4" }) {
  const shapes = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="M9 12h6" /></>,
    archive: <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11h14V8m-8 4h2" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.2-8.2 2 2-2 2 2 2-3 3-2-2-2 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {shapes[name]}
    </svg>
  );
}

function Avatar({ user, size = "h-10 w-10" }) {
  const initial = user?.name?.trim()?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "?";
  return (
    <span className={`relative inline-flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-sm font-bold text-sky-800 ring-1 ring-inset ring-sky-200`}>
      {user?.profileImage ? (
        <img src={user.profileImage} alt="" className="h-full w-full object-cover" />
      ) : initial}
    </span>
  );
}

function StatusPill({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.Active;
  const dot = status === "Active" ? "bg-emerald-500" : status === "Pending" ? "bg-amber-500" : status === "Suspended" ? "bg-rose-500" : "bg-slate-500";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${style}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

function SectionHeading({ icon, children }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
      <span className="text-sky-700"><Icon name={icon} /></span>
      {children}
    </h3>
  );
}

function DetailValue({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value === null || value === undefined || value === "" ? "—" : value}</p>
    </div>
  );
}

function AccountActionModal({ action, busy, error, onClose, onConfirm }) {
  if (!action) return null;
  const copy = {
    suspend: {
      title: "Suspend this account?",
      message: `${action.target.name} will be signed out immediately and won't be able to sign in. Provider profiles are also removed from discovery until access is restored.`,
      button: "Suspend account",
      tone: "bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500",
      icon: "shield",
    },
    unsuspend: {
      title: "Restore account access?",
      message: `${action.target.name} will be able to sign in again. If the account is archived, restore it separately first.`,
      button: "Restore access",
      tone: "bg-sky-700 hover:bg-sky-800 focus-visible:ring-sky-500",
      icon: "shield",
    },
    archive: {
      title: "Archive this account?",
      message: `${action.target.name} will be signed out and hidden from provider discovery. Booking history and account activity are retained; you can restore this account later.`,
      button: "Archive account",
      tone: "bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500",
      icon: "archive",
    },
    restore: {
      title: "Restore archived account?",
      message: `This account will return to the active roster. Any existing suspension remains in place, so a separately suspended account will still be blocked from signing in.`,
      button: "Restore account",
      tone: "bg-sky-700 hover:bg-sky-800 focus-visible:ring-sky-500",
      icon: "archive",
    },
    reset: {
      title: "Send a password reset email?",
      message: `A single-use reset code will be sent to ${action.target.email}. The code expires after 10 minutes; the current password won't change until the user completes the reset.`,
      button: "Send reset email",
      tone: "bg-sky-700 hover:bg-sky-800 focus-visible:ring-sky-500",
      icon: "key",
    },
  }[action.type];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[3px]" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="account-action-title" className="w-full max-w-md rounded-2xl border border-white/80 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.24)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${action.type === "suspend" || action.type === "archive" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-800"}`}>
            <Icon name={copy.icon} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="account-action-title" className="text-lg font-bold tracking-tight text-slate-950">{copy.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{copy.message}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close confirmation" className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:opacity-50">
            <Icon name="close" />
          </button>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-800">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:cursor-not-allowed disabled:opacity-60">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${copy.tone}`}>
            {busy ? "Working…" : copy.button}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function AdminUsersManagement() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [counts, setCounts] = useState({ all: 0, suspended: 0, archived: 0 });
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(searchParams.get("userId"));
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const requestedUserId = searchParams.get("userId");
    if (requestedUserId !== selectedUserId) setSelectedUserId(requestedUserId);
  }, [searchParams, selectedUserId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 220);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch]);

  const loadUsers = useCallback(async (signal) => {
    if (!token) {
      setError("Your admin session is missing. Sign in again to manage users.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ filter, page: String(page) });
    if (debouncedSearch) params.set("q", debouncedSearch);
    try {
      const response = await fetch(`/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      const data = await readApiResponse(response);
      if (response.status === 401) {
        logout();
        navigate("/login");
        return;
      }
      if (!response.ok) throw new Error(data.message || "Could not load user accounts.");
      setUsers(data.users || []);
      setCounts(data.counts || { all: 0, suspended: 0, archived: 0 });
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      if (page > (data.pages || 1)) setPage(data.pages || 1);
    } catch (fetchError) {
      if (fetchError.name !== "AbortError") setError(fetchError.message || "Could not load user accounts.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [debouncedSearch, filter, logout, navigate, page, token]);

  useEffect(() => {
    const controller = new AbortController();
    void loadUsers(controller.signal);
    return () => controller.abort();
  }, [loadUsers]);

  useEffect(() => {
    if (!selectedUserId) {
      setDetails(null);
      return undefined;
    }
    const controller = new AbortController();
    setDetailsLoading(true);
    setDetails(null);
    fetch(`/api/admin/users/${selectedUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await readApiResponse(response);
        if (response.status === 401) {
          logout();
          navigate("/login");
          return;
        }
        if (!response.ok) throw new Error(data.message || "Could not load account details.");
        setDetails(data);
      })
      .catch((fetchError) => {
        if (fetchError.name !== "AbortError") setError(fetchError.message || "Could not load account details.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailsLoading(false);
      });
    return () => controller.abort();
  }, [detailRefresh, logout, navigate, selectedUserId, token]);

  useEffect(() => {
    if (!selectedUserId && !pendingAction) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== "Escape" || actionBusy) return;
      if (pendingAction) {
        setPendingAction(null);
        setActionError("");
      } else {
        setSelectedUserId(null);
        setDetails(null);
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.delete("userId");
          return next;
        }, { replace: true });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionBusy, pendingAction, selectedUserId]);

  const openAction = (type, target = details?.user) => {
    if (!target) return;
    setActionError("");
    setPendingAction({ type, target });
  };

  const runAction = async () => {
    if (!pendingAction) return;
    setActionBusy(true);
    setActionError("");
    const { type, target } = pendingAction;
    const endpoints = {
      suspend: { path: `/api/admin/users/${target.id}/suspension`, method: "PATCH", body: { suspended: true } },
      unsuspend: { path: `/api/admin/users/${target.id}/suspension`, method: "PATCH", body: { suspended: false } },
      archive: { path: `/api/admin/users/${target.id}/archive`, method: "POST" },
      restore: { path: `/api/admin/users/${target.id}/restore`, method: "POST" },
      reset: { path: `/api/admin/users/${target.id}/reset-password`, method: "POST" },
    };
    const endpoint = endpoints[type];
    try {
      const response = await fetch(endpoint.path, {
        method: endpoint.method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(endpoint.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(endpoint.body ? { body: JSON.stringify(endpoint.body) } : {}),
      });
      const data = await readApiResponse(response);
      if (response.status === 401) {
        logout();
        navigate("/login");
        return;
      }
      if (!response.ok) throw new Error(data.message || "That account action could not be completed.");
      setNotice(data.message || "Account updated.");
      setPendingAction(null);
      if (type === "archive") {
        setSelectedUserId(null);
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.delete("userId");
          return next;
        }, { replace: true });
      } else {
        setDetailRefresh((value) => value + 1);
      }
      await loadUsers();
    } catch (actionErrorValue) {
      setActionError(actionErrorValue.message || "That account action could not be completed.");
    } finally {
      setActionBusy(false);
    }
  };

  const chooseFilter = (nextFilter) => {
    setNotice("");
    setFilter(nextFilter);
  };

  const openUser = (id) => {
    setError("");
    setNotice("");
    setSelectedUserId(id);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("userId", id);
      return next;
    }, { replace: true });
  };

  const closeDetails = () => {
    if (actionBusy) return;
    setSelectedUserId(null);
    setDetails(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("userId");
      return next;
    }, { replace: true });
  };

  const selectedUser = details?.user;
  const firstResult = total === 0 ? 0 : (page - 1) * 25 + 1;
  const lastResult = Math.min(page * 25, total);

  return (
    <section className="space-y-5 pb-10" aria-labelledby="admin-users-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 id="admin-users-title" className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">User accounts</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">Review access, support account recovery, and preserve a clear history of every administrative change.</p>
        </div>
        <button type="button" onClick={() => void loadUsers()} disabled={loading} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50/60 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:cursor-wait disabled:opacity-60 sm:self-auto">
          <Icon name="refresh" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss notification" className="rounded-md p-0.5 text-emerald-800 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><Icon name="close" /></button>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
          <span>{error}</span>
          <button type="button" onClick={() => void loadUsers()} className="shrink-0 underline decoration-rose-400 underline-offset-2 hover:text-rose-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700">Try again</button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.055)]">
        <div className="border-b border-slate-200/80 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, username, or email"
                aria-label="Search users by name, username, or email"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 caret-sky-700 shadow-sm outline-none placeholder:text-slate-500 transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              />
            </div>
            <p className="text-xs font-medium tabular-nums text-slate-600">
              {loading && total === 0 ? "Loading accounts…" : `${total.toLocaleString()} ${total === 1 ? "account" : "accounts"} in this view`}
            </p>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter user accounts">
            {FILTERS.map((item) => {
              const active = filter === item.id;
              const count = item.id === "all" ? counts.all : item.id === "suspended" ? counts.suspended : item.id === "archived" ? counts.archived : null;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => chooseFilter(item.id)}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 ${
                    active ? "border-sky-800 bg-sky-800 text-white shadow-sm" : "border-slate-300 bg-white text-sky-900 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-950"
                  }`}
                >
                  {item.label}
                  {count !== null && <span className={`tabular-nums ${active ? "text-sky-100" : "text-slate-500"}`}>{count.toLocaleString()}</span>}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <span>Showing <strong className="font-semibold tabular-nums text-slate-900">{firstResult}–{lastResult}</strong> of <strong className="font-semibold tabular-nums text-slate-900">{total}</strong></span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" />{counts.suspended.toLocaleString()} suspended</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500" />{counts.archived.toLocaleString()} archived</span>
          </div>
        </div>

        {loading && users.length === 0 ? (
          <div className="space-y-3 p-5" aria-label="Loading users">
            {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-[62px] animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : users.length === 0 ? (
          <div className="px-5 py-16 text-center sm:px-8">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-800"><Icon name="users" className="h-6 w-6" /></span>
            <h2 className="mt-4 text-base font-bold text-slate-900">{search ? "No matching accounts" : `No ${filter === "all" ? "" : `${filter} `}accounts here`}</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-slate-600">{search ? "Try another name, username, or email address." : "Accounts will appear here as they register or their status changes."}</p>
            {search && <button type="button" onClick={() => setSearch("")} className="mt-4 rounded-lg px-3 py-2 text-sm font-semibold text-sky-800 underline underline-offset-2 hover:text-sky-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600">Clear search</button>}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-slate-50/90 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">Account</th>
                    <th scope="col" className="px-4 py-3.5">Role</th>
                    <th scope="col" className="px-4 py-3.5">Joined</th>
                    <th scope="col" className="px-4 py-3.5">Status</th>
                    <th scope="col" className="px-4 py-3.5 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open ${user.name}'s account details`}
                      onClick={() => openUser(user.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openUser(user.id);
                        }
                      }}
                      className="group cursor-pointer outline-none transition-colors hover:bg-sky-50/55 focus-visible:bg-sky-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600"
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar user={user} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                            <p className="truncate text-xs text-slate-600">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${user.role === "provider" ? "bg-sky-50 text-sky-900" : "bg-indigo-50 text-indigo-900"}`}>{user.role}</span>
                      </td>
                      <td className="px-4 py-3.5 text-xs tabular-nums text-slate-600">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-3.5"><StatusPill status={user.status} /></td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-800 group-hover:text-sky-950">Inspect <Icon name="arrow" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-slate-100 sm:hidden">
              {users.map((user) => (
                <button key={user.id} type="button" onClick={() => openUser(user.id)} className="flex w-full items-center gap-3 px-4 py-4 text-left outline-none transition hover:bg-sky-50/60 focus-visible:bg-sky-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600">
                  <Avatar user={user} size="h-11 w-11" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{user.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-600">{user.email}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${user.role === "provider" ? "bg-sky-50 text-sky-900" : "bg-indigo-50 text-indigo-900"}`}>{user.role}</span>
                      <StatusPill status={user.status} />
                    </span>
                  </span>
                  <Icon name="arrow" className="h-4 w-4 shrink-0 text-slate-500" />
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-slate-200/80 px-4 py-3.5 sm:px-6">
          <p className="text-xs text-slate-600">Page <span className="font-semibold tabular-nums text-slate-900">{page}</span> of <span className="font-semibold tabular-nums text-slate-900">{pages}</span></p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:cursor-not-allowed disabled:opacity-45">Previous</button>
            <button type="button" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page >= pages || loading} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:cursor-not-allowed disabled:opacity-45">Next</button>
          </div>
        </div>
      </div>

      {selectedUserId && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-slate-950/35 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && closeDetails()}>
          <aside role="dialog" aria-modal="true" aria-labelledby="user-drawer-title" className="flex h-full w-full max-w-xl flex-col border-l border-white/70 bg-white shadow-[-20px_0_60px_rgba(15,23,42,0.18)]">
            <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-5 sm:px-7">
              {detailsLoading && !selectedUser ? (
                <div className="h-12 w-12 animate-pulse rounded-full bg-slate-100" />
              ) : selectedUser ? <Avatar user={selectedUser} size="h-12 w-12" /> : null}
              <div className="min-w-0 flex-1">
                <h2 id="user-drawer-title" className="truncate text-lg font-bold tracking-tight text-slate-950">{selectedUser?.name || "Account details"}</h2>
                <p className="mt-0.5 truncate text-sm text-slate-600">{selectedUser?.email || "Loading account…"}</p>
                {selectedUser && <div className="mt-2 flex flex-wrap items-center gap-2"><StatusPill status={selectedUser.status} /><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold capitalize text-slate-700">{selectedUser.role}</span></div>}
              </div>
              <button type="button" onClick={closeDetails} aria-label="Close account details" className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"><Icon name="close" /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
              {detailsLoading && !details ? (
                <div className="space-y-4" aria-label="Loading account details">
                  <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
                  <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
                  <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
                </div>
              ) : details ? (
                <div className="space-y-7">
                  <section>
                    <SectionHeading icon="users">Account overview</SectionHeading>
                    <div className="mt-3 grid grid-cols-2 gap-2.5">
                      <DetailValue label="Registered" value={formatDate(selectedUser.createdAt)} />
                      <DetailValue label="Active bookings" value={selectedUser.activeBookings} />
                      <DetailValue label="Stamp progress" value={`${selectedUser.stampProgress} / 5 stamps`} />
                      <DetailValue label="Completed bookings" value={selectedUser.completedBookings} />
                      <DetailValue label="Referral code" value={selectedUser.referralCode || "Not issued"} />
                      <DetailValue label="Referral uses" value={selectedUser.referralUses} />
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                      <DetailValue label="Email" value={selectedUser.email} />
                      <DetailValue label="Mobile" value={selectedUser.mobileNumber} />
                    </div>
                    {selectedUser.role === "provider" && selectedUser.professions?.length > 0 && (
                      <p className="mt-3 text-xs leading-5 text-slate-600"><span className="font-semibold text-slate-800">Services:</span> {selectedUser.professions.join(", ")}</p>
                    )}
                    {selectedUser.location && <p className="mt-2 text-xs leading-5 text-slate-600"><span className="font-semibold text-slate-800">Location:</span> {selectedUser.location}</p>}
                    {selectedUser.referredBy && <p className="mt-2 text-xs leading-5 text-slate-600"><span className="font-semibold text-slate-800">Referred by:</span> account {selectedUser.referredBy}</p>}
                  </section>

                  <section>
                    <SectionHeading icon="calendar">Recent bookings</SectionHeading>
                    {details.bookings.length ? (
                      <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                        {details.bookings.slice(0, 5).map((booking) => (
                          <div key={booking.id} className="flex items-start justify-between gap-3 px-3.5 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{booking.task || "Service request"}</p>
                              <p className="mt-1 text-xs text-slate-600">{selectedUser.role === "client" ? "Provider" : "Client"}: {booking.counterpartName}</p>
                              <p className="mt-1 text-[11px] text-slate-500">{formatDate(booking.serviceDate)} · {booking.timeSlot || "Time pending"}</p>
                            </div>
                            <span className="max-w-[8rem] shrink-0 truncate rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold capitalize text-slate-700">{String(booking.status).replaceAll("_", " ")}</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-600">No booking history for this account yet.</p>}
                  </section>

                  <section>
                    <SectionHeading icon="activity">Recent activity</SectionHeading>
                    <ol className="mt-3 space-y-0">
                      {details.activity.map((event, index) => (
                        <li key={`${event.title}-${event.occurredAt}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
                          {index < details.activity.length - 1 && <span aria-hidden="true" className="absolute left-[7px] top-4 h-[calc(100%-8px)] w-px bg-slate-200" />}
                          <span className={`relative mt-1 h-4 w-4 shrink-0 rounded-full border-[3px] border-white ring-1 ${event.type === "account" ? "bg-sky-600 ring-sky-200" : "bg-slate-500 ring-slate-200"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-900">{event.title}</p>
                            <p className="mt-0.5 break-words text-xs leading-5 text-slate-600">{event.detail}</p>
                            <time className="mt-1 block text-[10px] tabular-nums text-slate-500" dateTime={event.occurredAt}>{formatDate(event.occurredAt, dateTimeFormatter)}</time>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                </div>
              ) : (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error || "Account details could not be loaded."}</div>
              )}
            </div>

            {selectedUser && (
              <div className="border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Account controls</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {selectedUser.archivedAt ? (
                    <button type="button" onClick={() => openAction("restore")} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-sky-800 px-3 text-xs font-semibold text-white transition hover:bg-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"><Icon name="archive" />Restore</button>
                  ) : (
                    <>
                      <button type="button" onClick={() => openAction(selectedUser.isSuspended ? "unsuspend" : "suspend")} className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${selectedUser.isSuspended ? "border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100 focus-visible:ring-sky-600" : "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 focus-visible:ring-rose-600"}`}><Icon name="shield" />{selectedUser.isSuspended ? "Unsuspend" : "Suspend"}</button>
                      <button type="button" onClick={() => openAction("reset")} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"><Icon name="key" />Reset password</button>
                      <button type="button" onClick={() => openAction("archive")} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-800 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 sm:col-span-2"><Icon name="archive" />Archive account</button>
                    </>
                  )}
                </div>
                {selectedUser.isSuspended && selectedUser.archivedAt && <p className="mt-2 text-[11px] leading-5 text-amber-800">This account remains suspended. Restoring it will not automatically re-enable sign-in.</p>}
              </div>
            )}
          </aside>
        </div>
      )}

      <AccountActionModal action={pendingAction} busy={actionBusy} error={actionError} onClose={() => setPendingAction(null)} onConfirm={() => void runAction()} />
    </section>
  );
}
