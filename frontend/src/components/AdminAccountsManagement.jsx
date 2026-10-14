import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { adminRequest } from "../services/adminApi.js";

function formatCreatedAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-PH", {
    dateStyle: "medium",
  });
}

export default function AdminAccountsManagement() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!token) {
      logout();
      navigate("/login", { replace: true });
      return undefined;
    }
    const controller = new AbortController();
    adminRequest("/api/admin/admin-accounts", token, { signal: controller.signal })
      .then((result) => {
        setIsPrimaryAdmin(result.isPrimaryAdmin === true);
        setAccounts(Array.isArray(result.accounts) ? result.accounts : []);
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        if (requestError.status === 401) {
          logout();
          navigate("/login", { replace: true });
          return;
        }
        setError(requestError.message || "Could not load admin accounts.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [logout, navigate, token]);

  async function createAccount(event) {
    event.preventDefault();
    setIsCreating(true);
    setError("");
    setNotice("");
    try {
      const result = await adminRequest("/api/admin/admin-accounts", token, {
        method: "POST",
        body: JSON.stringify({ fullName: fullName.trim(), email: email.trim() }),
      });
      setAccounts((current) => [...current, result.account]);
      setFullName("");
      setEmail("");
      setNotice(result.message || "Admin account created.");
    } catch (requestError) {
      if (requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(requestError.message || "Could not create the admin account.");
    } finally {
      setIsCreating(false);
    }
  }

  if (isLoading && !isPrimaryAdmin) return null;
  if (!isPrimaryAdmin && !error) return null;

  return (
    <section aria-labelledby="admin-accounts-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
        <h2 id="admin-accounts-title" className="text-sm font-bold text-slate-950">Admin accounts</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">Create named admin logins. Each admin receives sign-in verification codes at their own email address.</p>
      </div>
      {error && <p role="alert" className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="m-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}
      <form onSubmit={createAccount} className="grid gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:px-5">
        <label className="text-xs font-semibold text-slate-700">
          Admin name
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} minLength={2} maxLength={100} required disabled={isCreating} className="dashboard-focus mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-950 disabled:bg-slate-100" autoComplete="name" />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Admin email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required disabled={isCreating} className="dashboard-focus mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-950 disabled:bg-slate-100" autoComplete="email" />
        </label>
        <button type="submit" disabled={isCreating || !fullName.trim() || !email.trim()} className="dashboard-focus h-10 rounded-xl bg-blue-800 px-4 text-sm font-semibold text-white transition hover:bg-blue-900 disabled:cursor-wait disabled:opacity-50">
          {isCreating ? "Creating…" : "Add admin"}
        </button>
      </form>
      <div className="divide-y divide-slate-100">
        {accounts.length ? accounts.map((account) => (
          <div key={account.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{account.fullName}</p>
              <p className="truncate text-xs text-slate-600">{account.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${account.isAvailable ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                {account.isAvailable ? "Active" : "Unavailable"}
              </span>
              <time className="text-xs tabular-nums text-slate-500">{formatCreatedAt(account.createdAt)}</time>
            </div>
          </div>
        )) : (
          <p className="px-4 py-5 text-sm text-slate-600 sm:px-5">No additional admin accounts yet.</p>
        )}
      </div>
      <p className="border-t border-slate-200 px-4 py-3 text-xs leading-5 text-slate-600 sm:px-5">
        New admins should choose <strong className="font-semibold text-slate-800">Forgot password</strong> on the sign-in page to set their own password before signing in.
      </p>
    </section>
  );
}
