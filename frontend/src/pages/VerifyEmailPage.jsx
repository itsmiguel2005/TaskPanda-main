import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [status, setStatus] = useState(token ? "verifying" : "waiting");
  const [message, setMessage] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [resumeCode, setResumeCode] = useState("");
  const [resumeCodeInput, setResumeCodeInput] = useState("");
  const [isResuming, setIsResuming] = useState(false);
  const [resumeCodeError, setResumeCodeError] = useState("");
  const verificationStarted = useRef(false);
  const registrationResumed = useRef(false);

  const resumeRegistration = useCallback((payload) => {
    if (!payload?.onboardingToken || !payload?.user || registrationResumed.current) return;
    registrationResumed.current = true;

    const user = payload.user;
    const isProvider = user.role === "provider";
    const stepKey = isProvider ? "workerStep1" : "clientStep1";
    const existingRaw = sessionStorage.getItem(stepKey) || localStorage.getItem(stepKey);
    let existingStep = {};
    try {
      existingStep = existingRaw ? JSON.parse(existingRaw) : {};
    } catch {
      existingStep = {};
    }

    sessionStorage.setItem("taskpanda_onboarding_token", payload.onboardingToken);
    sessionStorage.setItem(stepKey, JSON.stringify({
      ...existingStep,
      email: user.email || email,
      username: user.username || existingStep.username || "",
      ...(isProvider ? { professions: user.professions || existingStep.professions || [] } : {}),
    }));
    localStorage.removeItem(stepKey);
    navigate(isProvider ? "/worker-register/name" : "/client-register/name", { replace: true });
  }, [email, navigate]);

  const continueRegistrationOnThisBrowser = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/registration-status", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.onboardingToken && data.user) {
        resumeRegistration(data);
        return;
      }
      if (data.alreadyResumed) {
        setMessage("Registration is already continuing in the browser tab where it was started.");
        return;
      }
      if (response.status === 401) {
        setMessage("Your email is verified. Return to the browser or device where you started registration; it should continue automatically. If it does not, enter the one-time code below.");
        return;
      }
      if (!response.ok) {
        setMessage(data.message || "Your email is verified, but we could not check this browser. Return to the device where you started registration.");
        return;
      }
      setMessage("Your email is verified. Return to the browser or device where you started registration; it will continue automatically.");
    } catch (error) {
      console.error("Could not check registration status after email verification:", error);
      setMessage("Your email is verified, but we could not check this browser. Return to the device where you started registration.");
    }
  }, [resumeRegistration]);

  useEffect(() => {
    if (!token || verificationStarted.current) return;
    verificationStarted.current = true;
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "This link is invalid or expired.");
        if (!data.verified || !data.user) {
          throw new Error(data.message || "We could not confirm your email address.");
        }
        setEmail(data.user.email || "");
        setResumeCode(data.registrationResumeCode || "");
        setStatus("verified");
        await continueRegistrationOnThisBrowser();
      })
      .catch((error) => {
        setStatus("error");
        setMessage(error.message || "This link is invalid or expired.");
      });
  }, [continueRegistrationOnThisBrowser, token]);

  useEffect(() => {
    if (token) return undefined;
    let active = true;
    let checking = false;
    const checkRegistrationStatus = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/auth/registration-status", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        if (data.verified && data.onboardingToken && data.user) {
          resumeRegistration(data);
        } else if (data.alreadyResumed) {
          setStatus("verified");
          setMessage("Registration was already opened in another tab. If it did not continue, enter the one-time code from your verified device below.");
        } else if (data.verified) {
          setStatus("verified");
          setMessage("Your email is verified. Continue your registration here.");
        }
      } catch {
        // Keep waiting; the backend may be temporarily unavailable.
      } finally {
        checking = false;
      }
    };
    checkRegistrationStatus();
    const pollId = window.setInterval(checkRegistrationStatus, 1000);
    return () => {
      active = false;
      window.clearInterval(pollId);
    };
  }, [resumeRegistration, token]);

  const handleResumeWithCode = async (event) => {
    event.preventDefault();
    setResumeCodeError("");
    setIsResuming(true);
    try {
      const response = await fetch("/api/auth/registration-resume", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: resumeCodeInput.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.onboardingToken || !data.user) {
        setResumeCodeError(data.message || "Could not resume registration with that code.");
        return;
      }
      resumeRegistration(data);
    } catch (error) {
      console.error("Registration resume code submission failed:", error);
      setResumeCodeError(error instanceof TypeError
        ? "Could not reach the registration service. Check your connection and try again."
        : error.message || "Could not resume registration with that code.");
    } finally {
      setIsResuming(false);
    }
  };

  const handleResend = async (event) => {
    event.preventDefault();
    setMessage("");
    setIsResending(true);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "We could not resend the email. Try again.");
      setStatus("waiting");
      setMessage(data.message || "If a pending registration exists, a new link has been sent.");
    } catch (error) {
      setMessage(error.message || "We could not resend the email. Try again.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Layout theme="primary">
      {(a) => (
        <section className="flex min-h-[70vh] items-center justify-center bg-white px-6 py-16">
          <div className="w-full max-w-sm space-y-5 text-center">
            <h1 className="text-2xl font-bold text-gray-900">
              {status === "verified" ? "Email verified" : status === "verifying" ? "Verifying your email" : "Check your email"}
            </h1>
            <p className="text-sm text-gray-600">
              {status === "verified"
                ? message
                : status === "verifying"
                ? "Please wait while we confirm your email address."
                : message || (email ? `We sent a verification link to ${email}.` : "Enter the email used for registration to request a new verification link.")}
            </p>
            {status === "waiting" && (
              <p className="text-xs text-gray-500">Leave this page open. It will continue automatically once your email is verified, even if you verify from another device.</p>
            )}
            {status !== "verified" && status !== "verifying" && (
              <p className="text-xs text-gray-500">Each resend replaces earlier links. Open the newest verification email.</p>
            )}

            {status !== "verified" && (
              <form onSubmit={handleResend} className="space-y-3 text-left">
                <label htmlFor="verificationEmail" className="block text-sm font-medium text-gray-700">Email address</label>
                <input
                  id="verificationEmail"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="block w-full rounded-lg border border-primary-200 bg-primary-50/50 px-4 py-2.5 text-sm text-gray-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
                {status === "error" && <p className="text-sm text-red-600" role="alert">{message}</p>}
                <button
                  type="submit"
                  disabled={isResending || !email.trim()}
                  className={`w-full rounded-lg bg-linear-to-r ${a.button} px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {isResending ? "Sending..." : "Resend verification email"}
                </button>
              </form>
            )}

            {status === "waiting" && message && <p className="text-sm text-green-700" role="status">{message}</p>}
            {token && status === "verified" && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={continueRegistrationOnThisBrowser}
                  className={`w-full rounded-lg bg-linear-to-r ${a.button} px-4 py-2.5 font-semibold text-white`}
                >
                  Check this browser again
                </button>
                <p className="text-xs leading-5 text-gray-500" role="status">
                  If you started registration on another device, return to it. It should continue automatically.
                </p>
                {resumeCode && (
                  <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-4 text-left">
                    <p className="text-sm font-semibold text-gray-900">If the other device does not continue</p>
                    <p className="mt-1 text-xs leading-5 text-gray-600">Enter this one-time code on the device where you started registration. It expires in 15 minutes.</p>
                    <p className="mt-3 select-all rounded-lg bg-white px-3 py-2 text-center font-mono text-lg font-bold tracking-[0.18em] text-primary-900" aria-label="One-time registration resume code">{resumeCode}</p>
                  </div>
                )}
              </div>
            )}
            {status !== "verifying" && (
              <form onSubmit={handleResumeWithCode} className="space-y-3 border-t border-gray-100 pt-4 text-left">
                <label htmlFor="registrationResumeCode" className="block text-sm font-medium text-gray-700">Have a code from your verified device?</label>
                <input
                  id="registrationResumeCode"
                  type="text"
                  autoComplete="one-time-code"
                  value={resumeCodeInput}
                  onChange={(event) => setResumeCodeInput(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 12))}
                  maxLength={12}
                  placeholder="12-character code"
                  className="block w-full rounded-lg border border-primary-200 bg-primary-50/50 px-4 py-2.5 text-center font-mono text-sm tracking-[0.18em] text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
                {resumeCodeError && <p className="text-sm text-red-600" role="alert">{resumeCodeError}</p>}
                <button
                  type="submit"
                  disabled={isResuming || resumeCodeInput.length !== 12}
                  className={`w-full rounded-lg bg-linear-to-r ${a.button} px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {isResuming ? "Continuing..." : "Continue registration"}
                </button>
              </form>
            )}
            {status !== "verified" && (
              <Link to="/login" className="inline-block text-sm font-semibold text-primary-700 hover:text-primary-900">
                Go to sign in
              </Link>
            )}
          </div>
        </section>
      )}
    </Layout>
  );
}