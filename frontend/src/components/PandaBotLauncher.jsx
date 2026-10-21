import { lazy, Suspense } from "react";
import { useAuth } from "../context/AuthContext.jsx";

const PandaBotWidget = lazy(() => import("./PandaBotWidget.jsx"));

function LauncherButton({ onClick, loading = false, role }) {
  return (
    <div className="fixed bottom-4 right-4 z-70 sm:bottom-6 sm:right-6">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className={`dashboard-focus relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-white transition duration-200 hover:-translate-y-0.5 motion-reduce:transform-none disabled:cursor-wait ${
          role === "client"
            ? "bg-sky-700 shadow-[0_8px_28px_rgba(3,105,161,0.38)] hover:bg-sky-800"
            : "bg-emerald-800 shadow-[0_8px_28px_rgba(6,78,59,0.38)] hover:bg-emerald-900"
        }`}
        aria-label={loading ? "Loading PandaBot support" : "Open PandaBot support"}
        aria-expanded="false"
        title="Chat with PandaBot"
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white" aria-hidden="true">
          <img src="/assets/PandaBotFace.png" alt="" className="h-[88%] w-[88%] object-contain" />
        </span>
      </button>
    </div>
  );
}

export default function PandaBotLauncher() {
  const { isLoggedIn, isAuthLoading, role } = useAuth();

  if (isAuthLoading || !isLoggedIn || role === "admin") return null;

  return (
    <Suspense fallback={<LauncherButton loading role={role} />}>
      <PandaBotWidget />
    </Suspense>
  );
}