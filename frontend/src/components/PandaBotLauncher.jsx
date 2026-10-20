import { lazy, Suspense, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

const PandaBotWidget = lazy(() => import("./PandaBotWidget.jsx"));

function LauncherButton({ onClick, loading = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="dashboard-focus relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-emerald-800 shadow-[0_8px_28px_rgba(6,78,59,0.38)] transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-900 motion-reduce:transform-none disabled:cursor-wait"
      aria-label={loading ? "Loading PandaBot support" : "Open PandaBot support"}
      aria-expanded="false"
      title="Chat with PandaBot"
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white" aria-hidden="true">
        <img src="/assets/PandaBotFace.png" alt="" className="h-[88%] w-[88%] object-contain" />
      </span>
    </button>
  );
}

export default function PandaBotLauncher() {
  const [shouldLoadWidget, setShouldLoadWidget] = useState(false);
  const { isLoggedIn, isAuthLoading } = useAuth();

  if (isAuthLoading || !isLoggedIn) return null;

  if (!shouldLoadWidget) {
    return <LauncherButton onClick={() => setShouldLoadWidget(true)} />;
  }

  return (
    <Suspense fallback={<LauncherButton loading />}>
      <PandaBotWidget initiallyOpen />
    </Suspense>
  );
}