import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";

const REGISTRATION_CHANNEL = "taskpanda-registration";
const REGISTRATION_RESUME_KEY = "taskpanda-registration-resume";

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
        try {
          const channel = new BroadcastChannel(REGISTRATION_CHANNEL);
          channel.postMessage(resumePayload);
          channel.close();
        } catch {
          // The storage event below is the fallback for browsers without BroadcastChannel.
        }
        try {
          localStorage.setItem(REGISTRATION_RESUME_KEY, JSON.stringify({ ...resumePayload, sentAt: Date.now() }));
          localStorage.removeItem(REGISTRATION_RESUME_KEY);
        } catch {
          // The current tab can still continue using the button below.
        }
        setEmail(data.user.email || "");
        setStatus("verified");
        setMessage("Your email is verified. Close this tab and return to the tab where you started registration; it will continue automatically.");
      })
      .catch((error) => {
        setStatus("error");
        setMessage(error.message || "This link is invalid or expired.");
      });
  }, [token]);

  useEffect(() => {
    if (token) return undefined;
    let channel;
    try {
      channel = new BroadcastChannel(REGISTRATION_CHANNEL);
      channel.onmessage = (event) => resumeRegistration(event.data);
    } catch {
      channel = null;
    }

    const handleStorage = (event) => {
      if (event.key !== REGISTRATION_RESUME_KEY || !event.newValue) return;
      try {
        resumeRegistration(JSON.parse(event.newValue));
      } catch {
        // Ignore malformed cross-tab signals.
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      channel?.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, [resumeRegistration, token]);

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
              <p className="text-xs text-gray-500">Leave this tab open. After you verify from your email, registration will continue in this tab.</p>
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
            {status === "verified" ? (
              <button
                type="button"
                onClick={handleContinueHere}
                className={`w-full rounded-lg bg-gradient-to-r ${a.button} px-4 py-2.5 font-semibold text-white`}
              >
                Continue registration in this tab
              </button>
            ) : (
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