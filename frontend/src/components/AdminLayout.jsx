import { useEffect, useState } from "react";
import AdminSidebar from "./AdminSidebar.jsx";
import AdminHeaderActions from "./AdminHeaderActions.jsx";

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="h-5 w-5">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export default function AdminLayout({ children, title = "Dashboard" }) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!mobileNavigationOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setMobileNavigationOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileNavigationOpen]);

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <AdminSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />

      {mobileNavigationOpen && (
        <>
          <button
            type="button"
            aria-label="Close admin navigation"
            onClick={() => setMobileNavigationOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-slate-950/50 lg:hidden"
          />
          <AdminSidebar mobile onClose={() => setMobileNavigationOpen(false)} />
        </>
      )}

      <main className="min-w-0 flex-1 bg-slate-50 lg:h-screen lg:overflow-y-auto">
        <header className="sticky top-0 z-30 flex min-h-[76px] items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileNavigationOpen(true)}
            aria-label="Open admin navigation"
            aria-expanded={mobileNavigationOpen}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 lg:hidden"
          >
            <MenuIcon />
          </button>
          <div>
            <p className="text-xs font-medium text-slate-500">TaskPanda <span className="px-1 text-slate-300">/</span> Admin Portal</p>
            <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{title}</h1>
          </div>
          <AdminHeaderActions />
        </header>
        <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
