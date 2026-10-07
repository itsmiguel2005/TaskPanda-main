import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "../components/Header.jsx";

const AdminDashboardOverview = lazy(() => import("../components/AdminDashboardOverview.jsx"));
const AdminUsersManagement = lazy(() => import("../components/AdminUsersManagement.jsx"));
const AdminTransactionsPanel = lazy(() => import("../components/AdminTransactionsPanel.jsx"));
const AdminRewardsAnalytics = lazy(() => import("../components/AdminRewardsAnalytics.jsx"));
const AdminSystemSettings = lazy(() => import("../components/AdminSystemSettings.jsx"));
const AdminBookingsManagement = lazy(() => import("../components/AdminBookingsManagement.jsx"));
const VerificationsAdmin = lazy(() => import("../components/VerificationsAdmin.jsx"));

const sections = {
  dashboard: {
    component: AdminDashboardOverview,
    label: "Loading dashboard…",
  },
  users: {
    component: AdminUsersManagement,
    label: "Loading user management…",
  },
  transactions: {
    component: AdminTransactionsPanel,
    label: "Loading financial ledger…",
  },
  rewards: {
    component: AdminRewardsAnalytics,
    label: "Loading voucher analytics…",
  },
  settings: {
    component: AdminSystemSettings,
    label: "Loading global settings…",
  },
  bookings: {
    component: AdminBookingsManagement,
    label: "Loading booking operations…",
  },
  verifications: {
    component: VerificationsAdmin,
    label: "Loading verification queue…",
  },
};

export default function AdminDashboardPage() {
  const [searchParams] = useSearchParams();
  const section = searchParams.get("section") || "dashboard";
  const activeTab = section.charAt(0).toUpperCase() + section.slice(1);
  const activeSection = sections[section];
  const Section = activeSection?.component;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(219,234,254,0.5),_transparent_48%),linear-gradient(180deg,_#eff6ff_0%,_#f8fbff_28rem,_#f8fafc_100%)] pt-16 pb-12">
      <Header showNav activeTab={activeTab} role="admin" />

      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-8">
        {Section ? (
          <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white/90 p-8 text-sm text-slate-600">{activeSection.label}</div>}>
            <Section />
          </Suspense>
        ) : (
          <section className="rounded-2xl border border-white/80 bg-white/85 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur-lg">
            <h2 className="text-base font-bold text-slate-950">System information</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4"><dt className="text-slate-600">Server</dt><dd className="font-semibold text-emerald-800">Running</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-600">Build</dt><dd className="font-semibold text-slate-900">v1.0.0</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-600">Uploads</dt><dd className="font-semibold text-slate-900">5 MB limit</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-600">Current role</dt><dd className="font-semibold text-sky-800">admin</dd></div>
            </dl>
          </section>
        )}
      </main>
    </div>
  );
}
