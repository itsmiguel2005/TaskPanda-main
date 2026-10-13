import { Link, useSearchParams } from "react-router-dom";

const navigationGroups = [
  {
    links: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }],
  },
  {
    label: "Operations",
    links: [
      { id: "users", label: "Users", icon: "users" },
      { id: "verifications", label: "Verifications", icon: "verifications" },
      { id: "reports", label: "Reports", icon: "reports" },
      { id: "bookings", label: "Bookings", icon: "bookings" },
      { id: "refunds", label: "Refunds", icon: "refunds" },
    ],
  },
  {
    label: "Finance & growth",
    links: [
      { id: "transactions", label: "Transactions", icon: "transactions" },
      { id: "rewards", label: "Rewards", icon: "rewards" },
    ],
  },
  {
    label: "System",
    links: [
      { id: "settings", label: "Settings", icon: "settings" },
      { id: "audit-logs", label: "System Logs", icon: "logs" },
    ],
  },
];

function AdminIcon({ name, className = "h-5 w-5" }) {
  const commonProps = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  const shapes = {
    dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    users: <><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" /><circle cx="9.5" cy="7" r="4" /><path d="M17 11a4 4 0 0 0 0-8M21 20v-1.5a4 4 0 0 0-3-3.87" /></>,
    verifications: <><path d="m8 12 2.5 2.5L16.5 8.5" /><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /></>,
    reports: <><path d="M4 19.5V4.5A1.5 1.5 0 0 1 5.5 3H20v16H5.5A1.5 1.5 0 0 0 4 20.5Z" /><path d="M8 7h8M8 11h8M8 15h5" /></>,
    bookings: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    refunds: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.8-2L20 12M4 12l2.6 5a7 7 0 0 0 11.8-2" /><path d="M12 8v8m2-6.5c-.4-1-1.2-1.5-2-1.5-1.1 0-2 .7-2 1.6 0 2.3 4 1.2 4 3.4 0 .9-.9 1.6-2 1.6-.8 0-1.6-.5-2-1.5" /></>,
    transactions: <><path d="M3 7h18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M7 15h3M15 13l2 2-2 2" /></>,
    rewards: <><path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7" /><path d="M12 7H7.5a2.5 2.5 0 1 1 2.5-2.5C10 6 12 7 12 7ZM12 7h4.5A2.5 2.5 0 1 0 14 4.5C14 6 12 7 12 7Z" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 1 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 1 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 1 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 1 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" /></>,
    logs: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    collapse: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16m6-11-3 3 3 3" /></>,
    expand: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16m3-11 3 3-3 3" /></>,
  };

  return <svg {...commonProps}>{shapes[name]}</svg>;
}

export default function AdminSidebar({
  activeSection,
  collapsed = false,
  mobile = false,
  onClose,
  onToggleCollapse,
}) {
  const [searchParams] = useSearchParams();

  const section = searchParams.get("section") || "dashboard";
  const currentSection = activeSection || section;

  return (
    <aside
      aria-label="Admin navigation"
      className={mobile
        ? "fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col border-r border-blue-100 bg-[#eff6ff] text-slate-700 shadow-2xl lg:hidden"
        : `relative sticky top-0 hidden h-screen shrink-0 flex-col border-r border-blue-100 bg-[#eff6ff] text-slate-700 transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex ${
          collapsed ? "w-20" : "w-64"
        }`}
    >
      <div className={`flex items-center border-b border-blue-100 py-5 ${collapsed && !mobile ? "justify-center px-3" : "gap-3 px-5"}`}>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
          <img src="/assets/Panda Cropped.png" alt="" className="h-full w-full object-cover object-top" />
        </span>
        {(!collapsed || mobile) && (
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">TaskPanda</p>
            <p className="mt-1 inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-700">
              Admin Portal
            </p>
          </div>
        )}
        {mobile && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close admin navigation"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-blue-900 transition hover:bg-blue-100 hover:text-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <AdminIcon name="close" />
          </button>
        )}
        {!mobile && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand admin sidebar" : "Collapse admin sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-blue-900 transition hover:bg-blue-100 hover:text-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              collapsed ? "absolute left-1/2 top-[4.75rem] -translate-x-1/2" : ""
            }`}
          >
            <AdminIcon name={collapsed ? "expand" : "collapse"} className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>

      <nav aria-label="Admin sections" className={`min-h-0 flex-1 overflow-y-auto py-5 ${collapsed && !mobile ? "px-2 pt-12" : "px-3"}`}>
        {navigationGroups.map((group, groupIndex) => (
          <div key={group.label || "overview"} className={groupIndex > 0 ? (collapsed && !mobile ? "mt-3" : "mt-6") : ""}>
            {group.label && (!collapsed || mobile) && (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-800">
                {group.label}
              </p>
            )}
            <div className="space-y-1">
              {group.links.map((link) => {
                const isActive = currentSection === link.id;
                return (
                  <Link
                    key={link.id}
                    to={`/admin?section=${link.id}`}
                    onClick={mobile ? onClose : undefined}
                    aria-label={collapsed && !mobile ? link.label : undefined}
                    aria-current={isActive ? "page" : undefined}
                    title={collapsed && !mobile ? link.label : undefined}
                    className={`flex min-h-10 items-center rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                      collapsed && !mobile ? "justify-center px-0" : "gap-3 px-3"
                    } ${
                      isActive
                        ? "bg-indigo-600 font-medium text-white"
                        : "text-blue-900 hover:bg-blue-100 hover:text-blue-950"
                    }`}
                  >
                    <AdminIcon name={link.icon} className="h-[18px] w-[18px] shrink-0" />
                    {(!collapsed || mobile) && <span>{link.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-blue-100" aria-hidden="true" />
    </aside>
  );
}
