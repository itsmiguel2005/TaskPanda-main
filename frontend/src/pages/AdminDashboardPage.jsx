import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout.jsx";
import { SkeletonBlock } from "../components/Skeletons.jsx";

const AdminDashboardOverview = lazy(() => import("../components/AdminDashboardOverview.jsx"));
const AdminUsersManagement = lazy(() => import("../components/AdminUsersManagement.jsx"));
const AdminTransactionsPanel = lazy(() => import("../components/AdminTransactionsPanel.jsx"));
const AdminRewardsAnalytics = lazy(() => import("../components/AdminRewardsAnalytics.jsx"));
const AdminSystemSettings = lazy(() => import("../components/AdminSystemSettings.jsx"));
const AdminBookingsManagement = lazy(() => import("../components/AdminBookingsManagement.jsx"));
const VerificationsAdmin = lazy(() => import("../components/VerificationsAdmin.jsx"));
const AdminSupportReports = lazy(() => import("../components/AdminSupportReports.jsx"));
const AdminRefundManagement = lazy(() => import("../components/AdminRefundManagement.jsx"));
const AdminAuditLogs = lazy(() => import("../components/AdminAuditLogs.jsx"));

const sections = {
  dashboard: {
    component: AdminDashboardOverview,
    title: "Dashboard",
    label: "Loading dashboard…",
  },
  users: {
    component: AdminUsersManagement,
    title: "Users",
    label: "Loading user management…",
  },
  transactions: {
    component: AdminTransactionsPanel,
    title: "Transactions",
    label: "Loading financial ledger…",
  },
  rewards: {
    component: AdminRewardsAnalytics,
    title: "Rewards",
    label: "Loading voucher analytics…",
  },
  settings: {
    component: AdminSystemSettings,
    title: "Settings",
    label: "Loading global settings…",
  },
  bookings: {
    component: AdminBookingsManagement,
    title: "Bookings",
    label: "Loading booking operations…",
  },
  verifications: {
    component: VerificationsAdmin,
    title: "Verifications",
    label: "Loading verification queue…",
  },
  reports: {
    component: AdminSupportReports,
    title: "Reports",
    label: "Loading support reports…",
  },
  refunds: {
    component: AdminRefundManagement,
    title: "Refunds & disputes",
    label: "Loading refund requests…",
  },
  "audit-logs": {
    component: AdminAuditLogs,
    title: "System Logs",
    label: "Loading system audit logs…",
  },
};

export default function AdminDashboardPage() {
  const [searchParams] = useSearchParams();
  const section = searchParams.get("section") || "dashboard";
  const activeSection = sections[section];
  const Section = activeSection?.component;

  return (
    <AdminLayout title={activeSection?.title || "System information"}>
      {Section ? (
        <Suspense fallback={
          <div role="status" aria-label={activeSection.label} aria-busy="true" className="dashboard-panel content-arrive p-5 sm:p-6">
            <span className="sr-only">{activeSection.label}</span>
            <SkeletonBlock className="h-6 w-48 max-w-full" />
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="rounded-xl border border-slate-100 p-4">
                  <SkeletonBlock className="h-3 w-24" />
                  <SkeletonBlock className="mt-3 h-7 w-16" />
                  <SkeletonBlock className="mt-4 h-3 w-full" />
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-3">
              {Array.from({ length: 4 }, (_, index) => (
                <SkeletonBlock key={index} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </div>
        }>
          <div className="content-arrive">
            <Section />
          </div>
        </Suspense>
      ) : (
        <section className="rounded-2xl border border-white/80 bg-white/85 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur-lg">
          <h2 className="text-base font-bold text-slate-950">System information</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-4"><dt className="text-slate-600">Server</dt><dd className="font-semibold text-emerald-800">Running</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-600">Build</dt><dd className="font-semibold text-slate-900">v1.0.0</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-600">Booking photos</dt><dd className="font-semibold text-slate-900">4 MB each</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-600">Current role</dt><dd className="font-semibold text-sky-800">admin</dd></div>
          </dl>
        </section>
      )}
    </AdminLayout>
  );
}
