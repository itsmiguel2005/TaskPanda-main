import { useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 68;
const MAX_PULL = 88;

function isInteractiveTarget(target, root) {
  return target instanceof Element
    && target.closest("button, a, input, textarea, select, [contenteditable='true']") !== null
    && root.contains(target.closest("button, a, input, textarea, select, [contenteditable='true']"));
}

function scrollContainerAt(target, root) {
  let element = target instanceof Element ? target : null;
  while (element && element !== root) {
    const overflowY = window.getComputedStyle(element).overflowY;
    if (/(auto|scroll)/.test(overflowY) && element.scrollHeight > element.clientHeight) return element;
    element = element.parentElement;
  }
  return null;
}

export default function PandaSwipeRefresh({ children, onRefresh, disabled = false, className = "" }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const rootRef = useRef(null);
  const gestureRef = useRef(null);
  const pullDistanceRef = useRef(0);
  const disabledRef = useRef(disabled);
  const refreshingRef = useRef(refreshing);
  const refreshRef = useRef(null);

  const refresh = async () => {
    if (disabled || refreshing) return;
    setRefreshing(true);
    setRefreshError("");
    try {
      await onRefresh();
    } catch (error) {
      setRefreshError(error?.message || "Could not refresh this list. Try again.");
    } finally {
      setRefreshing(false);
      setPullDistance(0);
    }
  };
  disabledRef.current = disabled;
  refreshingRef.current = refreshing;
  refreshRef.current = refresh;
  pullDistanceRef.current = pullDistance;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const handleStart = (event) => {
      if (disabledRef.current || refreshingRef.current || event.touches.length !== 1 || isInteractiveTarget(event.target, root)) return;
      const target = scrollContainerAt(event.target, root);
      const rootTop = root.getBoundingClientRect().top;
      const listAtViewportTop = !target && rootTop >= -48 && rootTop <= 80;
      const startOffset = target ? target.scrollTop : listAtViewportTop ? 0 : window.scrollY;
      gestureRef.current = { startY: event.touches[0].clientY, target, startOffset, listAtViewportTop, isPulling: false };
    };

    const handleMove = (event) => {
      const gesture = gestureRef.current;
      if (!gesture || event.touches.length !== 1) return;
      const delta = event.touches[0].clientY - gesture.startY;
      if (delta <= 0) {
        gestureRef.current = null;
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }
      const currentOffset = gesture.target
        ? gesture.target.scrollTop
        : gesture.listAtViewportTop ? 0 : window.scrollY;
      if (currentOffset > 0) return;
      const overscroll = delta - gesture.startOffset;
      if (overscroll < 8) return;
      event.preventDefault();
      gesture.isPulling = true;
      const nextDistance = Math.min(MAX_PULL, (overscroll - 8) * 0.62);
      pullDistanceRef.current = nextDistance;
      setPullDistance(nextDistance);
    };

    const handleEnd = () => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (gesture?.isPulling && pullDistanceRef.current >= PULL_THRESHOLD && !disabledRef.current && !refreshingRef.current) {
        void refreshRef.current?.();
      } else {
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };
    const handleCancel = () => {
      gestureRef.current = null;
      pullDistanceRef.current = 0;
      setPullDistance(0);
    };

    root.addEventListener("touchstart", handleStart, { passive: true });
    root.addEventListener("touchmove", handleMove, { passive: false });
    root.addEventListener("touchend", handleEnd, { passive: true });
    root.addEventListener("touchcancel", handleCancel, { passive: true });
    return () => {
      root.removeEventListener("touchstart", handleStart);
      root.removeEventListener("touchmove", handleMove);
      root.removeEventListener("touchend", handleEnd);
      root.removeEventListener("touchcancel", handleCancel);
    };
  }, []);

  const status = refreshing ? "Refreshing…" : pullDistance >= PULL_THRESHOLD ? "Release to refresh" : "Pull down to refresh";
  const visiblePullDistance = Math.max(pullDistance, refreshing ? 44 : 0);

  return (
    <div ref={rootRef} className={`panda-swipe-surface ${className}`} style={{ "--panda-pull-distance": `${visiblePullDistance}px` }}>
      <div
        className={`panda-swipe-indicator ${visiblePullDistance ? "is-visible" : ""} ${pullDistance ? "is-pulling" : ""}`}
        aria-hidden="true"
      >
        <span className={`panda-swipe-panda ${refreshing ? "is-chewing" : ""}`}>
          <svg viewBox="0 0 36 30" fill="none" aria-hidden="true">
            <path d="M29 25V8" stroke="#65a30d" strokeWidth="2" strokeLinecap="round" />
            <path d="M29 13c-5-5-8-4-8-4 1 4 4 6 8 6M29 19c4-5 7-4 7-4-1 4-3 6-7 7" fill="#84cc16" />
            <circle cx="9" cy="9" r="5" fill="#172554" />
            <circle cx="22" cy="9" r="5" fill="#172554" />
            <ellipse cx="15.5" cy="17" rx="12" ry="10.5" fill="#fff" stroke="#cbd5e1" />
            <ellipse cx="10" cy="16" rx="3.6" ry="4.4" fill="#172554" transform="rotate(24 10 16)" />
            <ellipse cx="21" cy="16" rx="3.6" ry="4.4" fill="#172554" transform="rotate(-24 21 16)" />
            <circle cx="10.8" cy="16" r="1" fill="#fff" />
            <circle cx="20.2" cy="16" r="1" fill="#fff" />
            <path d="M14 20c.8-1 2.2-1 3 0-.2 2-2.8 2-3 0Z" fill="#172554" />
            <path d="M15.5 22v1.2" stroke="#172554" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </span>
        <span>{status}</span>
      </div>
      <div className={`panda-swipe-controls ${pullDistance ? "is-pulling" : ""}`}>
        <button type="button" onClick={() => void refresh()} disabled={disabled || refreshing} className="dashboard-focus panda-swipe-button">
          {refreshing ? "Refreshing…" : "Refresh list"}
        </button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{refreshing ? "Refreshing list." : refreshError || ""}</p>
      {refreshError && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{refreshError}</p>}
      <div className={`panda-swipe-content ${pullDistance ? "is-pulling" : ""}`}>
        {children}
      </div>
    </div>
  );
}
