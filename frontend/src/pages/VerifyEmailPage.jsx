import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";

const REGISTRATION_CHANNEL = "taskpanda-registration";
const REGISTRATION_RESUME_KEY = "taskpanda-registration-resume";

function publishRegistrationEvent(type, payload) {
  const event = { type, payload, sentAt: Date.now() };
  try {
    const channel = new BroadcastChannel(REGISTRATION_CHANNEL);
    channel.postMessage(event);
    channel.close();
  } catch {
    // The storage event below is the fallback for browsers without BroadcastChannel.
  }
  try {
    localStorage.setItem(REGISTRATION_RESUME_KEY, JSON.stringify(event));
    localStorage.removeItem(REGISTRATION_RESUME_KEY);
  } catch {
    // The current tab can still continue using its own onboarding token.
  }
}

function notifyRegistrationTabClosed(payload) {
  publishRegistrationEvent("closed", payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/auth/registration-tab-closed", new Blob([], { type: "text/plain" }));
  }
}

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [status, setStatus] = useState(token ? "verifying" : "waiting");
  const [message, setMessage] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [verifiedData, setVerifiedData] = useState(null);
  const verificationStarted = useRef(false);
  const registrationResumed = useRef(false);
  const closeSignalSent = useRef(false);

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
        if (!data.onboardingToken || !data.user) {
          throw new Error("Email verified, but we could not resume registration. Return to your registration tab and sign in to continue.");
        }
        const resumePayload = { onboardingToken: data.onboardingToken, user: data.user };
        setVerifiedData(resumePayload);
        publishRegistrationEvent("verified", resumePayload);
        setEmail(data.user.email || "");
        setStatus("verified");
        setMessage("Your email is verified. Continue here, or close this tab to continue in your registration tab.");
      })
      .catch((error) => {
        setStatus("error");
        setMessage(error.message || "This link is invalid or expired.");
      });
  }, [token]);

  useEffect(() => {
    if (!token || !verifiedData) return undefined;
    const handleTabClose = () => {
      if (closeSignalSent.current) return;
      closeSignalSent.current = true;
      notifyRegistrationTabClosed(verifiedData);
    };
    window.addEventListener("beforeunload", handleTabClose);
    window.addEventListener("pagehide", handleTabClose);
    return () => {
      window.removeEventListener("beforeunload", handleTabClose);
      window.removeEventListener("pagehide", handleTabClose);
    };
  }, [token, verifiedData]);

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
        if (data.verified) {
          setStatus("verified");
          setMessage("Email verified. Close the verification tab to continue registration here.");
        }
        if (data.verificationTabClosed && data.onboardingToken && data.user) {
          resumeRegistration(data);
        }
      } catch {
        // Keep waiting; the backend may be temporarily unavailable.
      } finally {
        checking = false;
      }
    };
    checkRegistrationStatus();
    const pollId = window.setInterval(checkRegistrationStatus, 1000);
    const handleRegistrationEvent = (event) => {
      const { type, payload } = event || {};
      if (type === "verified" && payload?.user) {
        setVerifiedData(payload);
        setEmail(payload.user.email || "");
        setStatus("verified");
        setMessage("Email verified. Close the verification tab to continue registration here.");
      } else if (type === "closed") {
        resumeRegistration(payload);
      }
    };
    let channel;
    try {
      channel = new BroadcastChannel(REGISTRATION_CHANNEL);
      channel.onmessage = (event) => handleRegistrationEvent(event.data);
    } catch {
      channel = null;
    }

    const handleStorage = (event) => {
      if (event.key !== REGISTRATION_RESUME_KEY || !event.newValue) return;
      try {
        handleRegistrationEvent(JSON.parse(event.newValue));
      } catch {
        // Ignore malformed cross-tab signals.
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      active = false;
      window.clearInterval(pollId);
      channel?.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, [resumeRegistration, token]);

  const continueInThisTab = () => resumeRegistration(verifiedData);
  const closeVerificationTab = () => {
    if (!verifiedData) return;
    if (!closeSignalSent.current) {
      closeSignalSent.current = true;
      notifyRegistrationTabClosed(verifiedData);
    }
    window.close();
    setMessage("The registration tab can continue now. If this tab stays open, close it using your browser.");
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

  const handleContinueHere = () => resumeRegistration(verifiedData);

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
              <p className="text-xs text-gray-500">Leave this tab open while you verify your email. It will continue after the verification tab is closed.</p>
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
                  className={`w-full rounded-lg bg-gradient-to-r ${a.button} px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50`}
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
                  onClick={continueInThisTab}
                  className={`w-full rounded-lg bg-gradient-to-r ${a.button} px-4 py-2.5 font-semibold text-white`}
                >
                  Continue in this tab
                </button>
                <button
                  type="button"
                  onClick={closeVerificationTab}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700"
                >
                  Close this tab and continue registration
                </button>
              </div>
            )}
            {!token && status === "verified" && (
              <p className="text-sm font-medium text-green-700" role="status">{message}</p>
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