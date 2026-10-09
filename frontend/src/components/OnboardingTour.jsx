import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch } from "../services/api.js";

const CLIENT_STEPS = [
  {
    target: "client-discovery",
    title: "Find a great local pro",
    description: "Search by service and discover skilled people working right in your area.",
    action: "Explore services",
  },
  {
    target: "pandabot",
    title: "A little help from PandaBot",
    description: "Ask AI for a hand choosing a service, finding a pro, or keeping a booking on track.",
    action: "Meet PandaBot",
  },
  {
    target: "client-bookings",
    title: "Your bookings, beautifully clear",
    description: "Follow every job from request to done, then securely confirm cash or digital payment right on the booking.",
    action: "Get Started",
    showStamps: true,
  },
];

const PROVIDER_STEPS = [
  {
    target: "provider-requests",
    title: "Good work starts with a new request",
    description: "New client requests land in your dashboard. Review the details, then accept the jobs and schedules that fit.",
    action: "See how jobs work",
  },
  {
    target: "provider-running-late",
    title: "Keep every booking moving",
    description: "Guide accepted jobs through each status, and use the highlighted Running late control to send an updated ETA if you’re delayed.",
    action: "See delay controls",
    path: "/provider-bookings",
    showBookingLifecycle: true,
  },
  {
    target: "provider-earnings",
    title: "Build trust. Track every payout.",
    description: "Your earnings tracker keeps completed-job income in view. Verified government ID and approved TESDA credentials help clients feel confident choosing you.",
    action: "Review TESDA status",
    path: "/provider-dashboard",
    href: "/provider-profile/tesda",
    showProviderTrust: true,
  },
];

function StampMark() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200 bg-white/80 text-amber-400" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M12 21V8m0 5c-3 0-5-1.5-6-4 3.5-.5 5.5.7 6 4Zm0-3c0-3 1.5-5 4-6 .5 3.5-.7 5.5-4 6Z" />
      </svg>
    </span>
  );
}

export default function OnboardingTour() {
  const { role, user, token, isProfileLoaded, updateUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isProvider = role === "provider";
  const requestedStep = location.state?.providerOnboardingStep;
  const initialStepIndex = isProvider && Number.isInteger(requestedStep) && requestedStep >= 0 && requestedStep < PROVIDER_STEPS.length
    ? requestedStep
    : 0;
  const [stepIndex, setStepIndex] = useState(initialStepIndex);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [spotlight, setSpotlight] = useState(null);
  const [popoverPosition, setPopoverPosition] = useState({ left: 16, top: 88 });
  const popoverRef = useRef(null);

  const steps = useMemo(() => (isProvider ? PROVIDER_STEPS : CLIENT_STEPS), [isProvider]);
  const step = steps[stepIndex];
  const completionField = isProvider ? "hasCompletedProviderOnboarding" : "hasCompletedOnboarding";
  const canShow = Boolean(token && isProfileLoaded && user?.[completionField] === false);
  const accentClasses = isProvider
    ? { button: "bg-emerald-600 hover:bg-emerald-700 focus-visible:outline-emerald-600", tint: "bg-emerald-50 text-emerald-800", progress: "bg-emerald-500", ring: "ring-emerald-200" }
    : { button: "bg-blue-600 hover:bg-blue-700 focus-visible:outline-blue-600", tint: "bg-blue-50 text-blue-800", progress: "bg-blue-600", ring: "ring-blue-200" };

  const updatePosition = useCallback(() => {
    const element = document.querySelector(`[data-onboarding-target="${step.target}"]`);
    const rect = element?.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const card = popoverRef.current;
    const cardWidth = Math.min(card?.offsetWidth || 400, viewportWidth - 32);
    const cardHeight = card?.offsetHeight || 380;

    if (!rect || rect.width === 0 || rect.height === 0) {
      setSpotlight(null);
      setPopoverPosition({
        left: Math.max(16, (viewportWidth - cardWidth) / 2),
        top: Math.max(16, (viewportHeight - cardHeight) / 2),
      });
      return;
    }

    setSpotlight({
      left: Math.floor(Math.max(8, rect.left - 8)),
      top: Math.floor(Math.max(8, rect.top - 8)),
      width: Math.ceil(Math.min(rect.width + 16, viewportWidth - 16)),
      height: Math.ceil(Math.min(rect.height + 16, viewportHeight - 16)),
    });
    let left = Math.min(Math.max(16, rect.left + rect.width / 2 - cardWidth / 2), viewportWidth - cardWidth - 16);
    const below = rect.bottom + 22;
    let top = below + cardHeight <= viewportHeight - 16
      ? below
      : Math.max(16, rect.top - cardHeight - 22);
    const overlapsVertically = top < rect.bottom + 8 && top + cardHeight > rect.top - 8;
    const overlapsHorizontally = left < rect.right && left + cardWidth > rect.left;
    if (overlapsVertically && overlapsHorizontally) {
      const leftPosition = rect.left - cardWidth - 22;
      const rightPosition = rect.right + 22;
      if (leftPosition >= 16) left = leftPosition;
      else if (rightPosition + cardWidth <= viewportWidth - 16) left = rightPosition;
    }
    setPopoverPosition({ left, top });
  }, [step.target]);

  useEffect(() => {
    if (!canShow) return undefined;

    const element = document.querySelector(`[data-onboarding-target="${step.target}"]`);
    if (element) {
      const rect = element.getBoundingClientRect();
      const isMobileViewport = window.innerWidth < 640;
      const isFixedTarget = window.getComputedStyle(element).position === "fixed";
      const shouldMakeRoomForPopover = isMobileViewport
        && rect.top > 90
        && rect.top + (popoverRef.current?.offsetHeight || 430) + 32 > window.innerHeight;
      const shouldScrollTarget = !isFixedTarget
        && (rect.top < 90 || rect.bottom > window.innerHeight - 90 || shouldMakeRoomForPopover);
      if (shouldScrollTarget && isMobileViewport) {
        window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - 96), behavior: "smooth" });
      } else if (shouldScrollTarget) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    const timer = window.setTimeout(updatePosition, 280);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [canShow, location.pathname, step.target, updatePosition]);

  const completeTour = useCallback(async (onSuccess) => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      const response = await apiFetch("/api/profile/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [completionField]: true }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Your progress could not be saved.");
      }
      if (data[completionField] !== true) {
        throw new Error("The server did not confirm your onboarding progress.");
      }
      updateUser({ [completionField]: true });
      onSuccess?.();
    } catch (error) {
      console.error("Saving onboarding progress failed:", error);
      setErrorMessage(error.message || "Your progress could not be saved. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [completionField, isSaving, updateUser]);

  useEffect(() => {
    if (!canShow) return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape" && !isSaving) void completeTour();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [canShow, completeTour, isSaving]);

  if (!canShow || !step) return null;

  const isLastStep = stepIndex === steps.length - 1;
  const handleNext = () => {
    setErrorMessage("");
    if (isLastStep) {
      void completeTour(step.href ? () => navigate(step.href) : undefined);
      return;
    }
    const nextIndex = stepIndex + 1;
    const nextStep = steps[nextIndex];
    setStepIndex(nextIndex);
    if (isProvider && nextStep.path && nextStep.path !== location.pathname) {
      navigate(nextStep.path, { state: { providerOnboardingStep: nextIndex } });
    }
  };
  const backdropClass = "pointer-events-none fixed z-[80] bg-slate-950/40 transition-all duration-300 ease-out";

  return (
    <div className="fixed inset-0 z-[80]">
      {!spotlight && (
        <div className={backdropClass} style={{ inset: 0 }} aria-hidden="true" />
      )}
      {spotlight && (
        <div
          className="pointer-events-none fixed z-[81] rounded-2xl border-2 border-white/90 transition-all duration-300 ease-out"
          style={{
            left: spotlight.left,
            top: spotlight.top,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.4), 0 0 34px rgba(255,255,255,0.26)",
          }}
          aria-hidden="true"
        />
      )}
      <section
        ref={popoverRef}
        role="dialog"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
        key={step.target}
        className="content-arrive fixed z-[82] w-[min(25rem,calc(100vw-2rem))] rounded-[1.65rem] border border-slate-200/80 bg-white/90 p-5 shadow-2xl backdrop-blur-md transition-all duration-300 ease-out sm:p-6"
        style={{ left: popoverPosition.left, top: popoverPosition.top }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-1.5" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
            {steps.map((item, index) => (
              <span
                key={item.target}
                className={`h-1.5 rounded-full transition-all duration-300 ease-out ${index <= stepIndex ? `${accentClasses.progress} w-8` : "w-4 bg-slate-200"}`}
              />
            ))}
          </div>
          <p className="text-xs font-semibold tabular-nums text-slate-500">Step {stepIndex + 1} of {steps.length}</p>
          <button
            type="button"
            onClick={() => void completeTour()}
            disabled={isSaving}
            className="text-xs font-semibold text-slate-500 transition-opacity duration-200 hover:text-slate-900 hover:opacity-70 disabled:cursor-wait disabled:opacity-50"
          >
            Skip tour
          </button>
        </div>

        <div className="mt-6 flex items-start gap-3">
          <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${accentClasses.tint}`} aria-hidden="true">
            {isProvider ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M12 3 4.5 6v5.5c0 4.4 3.2 7.7 7.5 9.5 4.3-1.8 7.5-5.1 7.5-9.5V6L12 3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" />
                <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
              </svg>
            )}
          </span>
          <div>
            <h2 id="onboarding-title" className="text-xl font-bold tracking-tight text-slate-950">{step.title}</h2>
            <p id="onboarding-description" className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
          </div>
        </div>

        {step.showStamps && (
          <div className="mt-5 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-amber-950">Bamboo Stamp Card</p>
                <p className="mt-0.5 text-xs text-amber-900/75">Each completed booking brings you closer to a reward.</p>
              </div>
              <span className="min-w-10 whitespace-nowrap rounded-full bg-white/80 px-2.5 py-1 text-center text-xs font-bold tabular-nums text-amber-900 ring-1 ring-amber-200">0/5</span>
            </div>
            <div className="mt-3 flex items-center gap-2" aria-label="0 of 5 bamboo stamps earned">
              {[0, 1, 2, 3, 4].map((stamp) => <StampMark key={stamp} />)}
              <span className="ml-1 animate-[bounce_900ms_ease-in-out_1] text-amber-700" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4" />
                </svg>
              </span>
            </div>
          </div>
        )}

        {step.showBookingLifecycle && (
          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-900">Your booking, step by step</p>
            <div className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Scheduled, On the Way, In Progress, Completed">
              {["Scheduled", "On the Way", "In Progress", "Completed"].map((status, index) => (
                <div key={status} className="min-w-0">
                  <span className={`block h-1.5 rounded-full ${index === 0 ? "bg-emerald-600" : "bg-emerald-200"}`} />
                  <span className="mt-1.5 block truncate text-[10px] font-semibold text-emerald-950">{status}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-white/80 bg-white/80 px-3 py-2.5">
              <p className="text-xs font-bold text-emerald-950">Running behind?</p>
              <p className="mt-1 text-xs leading-5 text-emerald-900">Use “Running late” on an in-progress booking to share an updated ETA. The 30-minute arrival grace period is there for delays.</p>
            </div>
          </div>
        )}

        {step.showProviderTrust && (
          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-900">Your trust & earnings snapshot</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/80 bg-white/85 p-3">
                <p className="text-xs font-semibold text-slate-600">Government ID</p>
                <p className="mt-1 text-sm font-bold text-emerald-800">
                  {user?.isVerified || user?.verificationStatus === "verified"
                    ? "Verified"
                    : user?.verificationStatus === "pending"
                      ? "In review"
                      : "Not verified yet"}
                </p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white/85 p-3">
                <p className="text-xs font-semibold text-slate-600">TESDA credential</p>
                <p className="mt-1 text-sm font-bold text-emerald-800">
                  {(user?.tesdaCertificates || []).some((certificate) => certificate.status === "approved")
                    ? "Approved"
                    : (user?.tesdaCertificates || []).some((certificate) => certificate.status === "pending")
                      ? "In review"
                      : "Not submitted yet"}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-emerald-900">Approved credentials build client confidence. Your live earnings total is highlighted on the dashboard.</p>
          </div>
        )}

        {step.href && !step.showProviderTrust && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 ring-1 ring-emerald-100" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="m12 3 7 3v5c0 4.4-3 7.7-7 10-4-2.3-7-5.6-7-10V6l7-3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
            <p className="text-xs leading-5 text-emerald-950">An approved TESDA badge gives clients an extra reason to trust your skills.</p>
          </div>
        )}

        {errorMessage && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm leading-5 text-rose-800">
            {errorMessage}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          {errorMessage && (
            <button
              type="button"
              onClick={() => void completeTour()}
              disabled={isSaving}
              className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={isSaving}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60 ${accentClasses.button}`}
          >
            {isSaving ? "Saving…" : step.action}
            {!isLastStep && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
