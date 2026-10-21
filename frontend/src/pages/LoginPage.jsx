import { apiFetch } from "../services/api.js";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { resumeRegistrationAttempt } from "../utils/registrationDraft.js";

function formatWaitTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getDashboardPath(role) {
  if (role === "provider") return "/provider-dashboard";
  if (role === "admin") return "/admin";
  return "/dashboard";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, logout } = useAuth();
  const [formData, setFormData] = useState({ email: "", password: "", remember: true });
  const [loginOtpToken, setLoginOtpToken] = useState("");
  const [loginOtpRole, setLoginOtpRole] = useState("client");
  const [loginOtp, setLoginOtp] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const loginOtpInputs = useRef([]);
  const [adminChallengeToken, setAdminChallengeToken] = useState("");
  const [adminOtpDestination, setAdminOtpDestination] = useState("");
  const [adminOtp, setAdminOtp] = useState("");
  const adminOtpInputs = useRef([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [serverError, setServerError] = useState("");
  const [requiresPasswordReset, setRequiresPasswordReset] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [touched, setTouched] = useState({});
  const [showRegistrationSuccess, setShowRegistrationSuccess] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [isRegistrationToastFading, setIsRegistrationToastFading] = useState(false);
  const [showPasswordResetSuccess, setShowPasswordResetSuccess] = useState(false);
  const [isPasswordResetToastFading, setIsPasswordResetToastFading] = useState(false);

  useEffect(() => {
    if (!location.state?.registrationSuccess) return;
    setShowRegistrationSuccess(true);
    setIsRegistrationToastFading(false);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!showRegistrationSuccess) return;
    const fadeTimer = window.setTimeout(() => setIsRegistrationToastFading(true), 2200);
    const removeTimer = window.setTimeout(() => {
      setIsRegistrationToastFading(false);
      setShowRegistrationSuccess(false);
    }, 3000);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [showRegistrationSuccess]);

  useEffect(() => {
    if (!location.state?.passwordResetSuccess) return;
    setShowPasswordResetSuccess(true);
    setIsPasswordResetToastFading(false);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!showPasswordResetSuccess) return;
    const fadeTimer = window.setTimeout(() => setIsPasswordResetToastFading(true), 2200);
    const removeTimer = window.setTimeout(() => {
      setIsPasswordResetToastFading(false);
      setShowPasswordResetSuccess(false);
    }, 3000);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [showPasswordResetSuccess]);

  useEffect(() => {
    if (lockoutSeconds <= 0) return undefined;

    const countdownTimer = window.setInterval(() => {
      setLockoutSeconds((remaining) => {
        if (remaining <= 1) {
          setServerError("");
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);

    return () => window.clearInterval(countdownTimer);
  }, [lockoutSeconds]);

  useEffect(() => {
    if (!loginOtpToken) return undefined;
    loginOtpInputs.current[0]?.focus();
    return undefined;
  }, [loginOtpToken]);

  useEffect(() => {
    if (!adminChallengeToken) return undefined;
    adminOtpInputs.current[0]?.focus();
    return undefined;
  }, [adminChallengeToken]);

  useEffect(() => {
    if (!loginOtpToken || resendSeconds <= 0) return undefined;
    const countdownTimer = window.setInterval(() => {
      setResendSeconds((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(countdownTimer);
  }, [loginOtpToken, resendSeconds]);

  const errors = {
    email:
      !formData.email.trim()
        ? "Email or username is required"
        : "",
    password: !formData.password
      ? "Password is required"
      : formData.password.length < 8
      ? "Password must be at least 8 characters"
      : "",
  };

  const showError = (field) =>
    (touched[field] || (serverError && !errors.email && !errors.password)) && errors[field];

  const updateCapsLockState = (event) => {
    setCapsLockOn(event.getModifierState("CapsLock"));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");
    setRequiresPasswordReset(false);
    setTouched({ email: true, password: true });
    if (errors.email || errors.password) return;
    setIsSubmitting(true);
    try {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          remember: formData.remember,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.requiresRegistrationCompletion) {
        logout();
        const incompleteUser = data.user || {};
        const role = incompleteUser.role || data.role || "client";
        const stepData = {
          email: incompleteUser.email || formData.email,
          ...(incompleteUser.username ? { username: incompleteUser.username } : {}),
          ...(role === "provider" && Array.isArray(incompleteUser.professions)
            ? { professions: incompleteUser.professions }
            : {}),
        };
        sessionStorage.setItem("taskpanda_onboarding_token", data.onboardingToken || "");
        resumeRegistrationAttempt(role === "provider" ? "worker" : "client", stepData);
        navigate(role === "provider" ? "/worker-register/name" : "/client-register/name", { replace: true });
        return;
      }
      if (response.ok && data.requiresAdminOtp) {
        setAdminChallengeToken(data.challengeToken || "");
        setAdminOtpDestination(data.otpDestination || "");
        setAdminOtp("");
        setServerError("");
        return;
      }
      if (response.ok && data.requiresOtp) {
        setLoginOtpToken(data.preAuthToken || "");
        setLoginOtpRole(data.role === "provider" ? "provider" : "client");
        setLoginOtp("");
        setRememberDevice(false);
        setResendSeconds(60);
        setServerError("");
        return;
      }
      if (response.ok) {
        const loggedInUser = data.user || { email: formData.email, role: data.role || "client" };
        const role = data.role || loggedInUser.role || "client";
        login({ ...loggedInUser, role }, data.token, formData.remember);
        sessionStorage.removeItem("taskpanda_post_auth_redirect");
        navigate(getDashboardPath(role));
      } else {
        if (data.requiresEmailVerification) {
          const email = data.email || formData.email;
          navigate(`/verify-email?email=${encodeURIComponent(email)}`, { replace: true });
          return;
        }
        setServerError(data.message || "Invalid email or password. Please try again.");
        setUnverifiedEmail(data.requiresEmailVerification ? (data.email || formData.email) : "");
        setRequiresPasswordReset(Boolean(data.requiresPasswordReset));
        setLockoutSeconds(Number(data.retryAfterSeconds) || 0);
      }
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoginOtpSubmit = async (event) => {
    event.preventDefault();
    setServerError("");
    if (!/^\d{6}$/.test(loginOtp)) {
      setServerError("Enter the 6-digit verification code.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiFetch("/api/auth/verify-otp", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${loginOtpToken}`,
        },
        body: JSON.stringify({ otpCode: loginOtp, rememberDevice }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setServerError(data.message || "Unable to verify the sign-in code.");
        return;
      }

      const loggedInUser = data.user || { email: formData.email, role: loginOtpRole };
      const role = data.role || loggedInUser.role || loginOtpRole;
      login({ ...loggedInUser, role }, data.token, formData.remember);
      sessionStorage.removeItem("taskpanda_post_auth_redirect");
      navigate(getDashboardPath(role));
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendLoginOtp = async () => {
    setServerError("");
    setIsSubmitting(true);
    try {
      const response = await apiFetch("/api/auth/resend-otp", {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${loginOtpToken}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setServerError(data.message || "Unable to resend the sign-in code.");
        return;
      }
      setLoginOtp("");
      setResendSeconds(60);
      loginOtpInputs.current[0]?.focus();
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateLoginOtpDigit = (index, rawValue) => {
    const digits = rawValue.replace(/\D/g, "");
    if (digits.length > 1) {
      const nextOtp = digits.slice(0, 6);
      setLoginOtp(nextOtp);
      loginOtpInputs.current[Math.min(nextOtp.length, 5)]?.focus();
      return;
    }
    setLoginOtp((current) => {
      const next = current.padEnd(6, " ").split("");
      next[index] = digits || " ";
      return next.join("").trimEnd();
    });
    if (digits && index < 5) loginOtpInputs.current[index + 1]?.focus();
  };

  const handleLoginOtpPaste = (event) => {
    event.preventDefault();
    const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    setLoginOtp(digits);
    loginOtpInputs.current[Math.min(digits.length, 5)]?.focus();
  };

  const updateAdminOtpDigit = (index, rawValue) => {
    const digits = rawValue.replace(/\D/g, "");
    if (digits.length > 1) {
      const nextOtp = digits.slice(0, 6);
      setAdminOtp(nextOtp);
      adminOtpInputs.current[Math.min(nextOtp.length, 5)]?.focus();
      return;
    }
    setAdminOtp((current) => {
      const next = current.padEnd(6, " ").split("");
      next[index] = digits || " ";
      return next.join("").trimEnd();
    });
    if (digits && index < 5) adminOtpInputs.current[index + 1]?.focus();
  };

  const handleAdminOtpPaste = (event) => {
    event.preventDefault();
    const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    setAdminOtp(digits);
    adminOtpInputs.current[Math.min(digits.length, 5)]?.focus();
  };

  const handleAdminOtpSubmit = async (event) => {
    event.preventDefault();
    setServerError("");
    if (!/^\d{6}$/.test(adminOtp)) {
      setServerError("Enter the 6-digit verification code.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiFetch("/api/auth/admin-login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: adminChallengeToken, code: adminOtp }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setServerError(data.message || "Unable to verify the admin code.");
        return;
      }

      const adminUser = data.user || { email: formData.email, role: "admin" };
      login({ ...adminUser, role: "admin" }, data.token, formData.remember);
      sessionStorage.removeItem("taskpanda_post_auth_redirect");
      navigate(getDashboardPath("admin"));
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setServerError("");
    setUnverifiedEmail("");
    setRequiresPasswordReset(false);
    setLockoutSeconds(0);
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  return (
    <Layout theme={loginOtpToken && loginOtpRole === "provider" ? "green" : "primary"} showReviewsLink>
      {(a) => (
        <>
        <section className="flex items-center justify-center bg-white px-6 py-8 sm:px-8 lg:h-[calc(100svh-4rem)] lg:py-6">
          <div className="w-full max-w-sm space-y-6">
            {loginOtpToken ? (
              <div className="space-y-6">
                <div className="space-y-2 text-center">
                  <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${loginOtpRole === "provider" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`} aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="m3 7 9 6 9-6" />
                    </svg>
                  </div>
                  <h2 className="font-bold text-2xl text-slate-900">Check your email</h2>
                  <p className="text-sm leading-6 text-slate-600">
                    Enter the 6-digit sign-in code on its way to your email. It expires in 5 minutes.
                  </p>
                </div>

                <form onSubmit={handleLoginOtpSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <p id="loginOtpLabel" className="text-center text-sm font-medium text-slate-700">
                      Verification code
                    </p>
                    <div className="grid grid-cols-6 gap-2" role="group" aria-labelledby="loginOtpLabel">
                      {Array.from({ length: 6 }, (_, index) => (
                        <input
                          key={index}
                          ref={(element) => { loginOtpInputs.current[index] = element; }}
                          type="text"
                          inputMode="numeric"
                          autoComplete={index === 0 ? "one-time-code" : "off"}
                          pattern="[0-9]*"
                          maxLength={6}
                          aria-label={`Digit ${index + 1}`}
                          value={loginOtp[index] || ""}
                          onChange={(event) => updateLoginOtpDigit(index, event.target.value)}
                          onPaste={handleLoginOtpPaste}
                          onKeyDown={(event) => {
                            if (event.key === "Backspace" && !loginOtp[index] && index > 0) {
                              loginOtpInputs.current[index - 1]?.focus();
                            } else if (event.key === "ArrowLeft" && index > 0) {
                              event.preventDefault();
                              loginOtpInputs.current[index - 1]?.focus();
                            } else if (event.key === "ArrowRight" && index < 5) {
                              event.preventDefault();
                              loginOtpInputs.current[index + 1]?.focus();
                            }
                          }}
                          className={`!h-12 min-w-0 rounded-xl border border-slate-200 bg-white px-0 text-center text-xl font-semibold tabular-nums text-slate-900 focus:outline-none focus:ring-2 ${loginOtpRole === "provider" ? "focus:border-emerald-500 focus:ring-emerald-500/30" : "focus:border-sky-500 focus:ring-sky-500/30"}`}
                        />
                      ))}
                    </div>
                  </div>

                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm ${loginOtpRole === "provider" ? "border-emerald-100 bg-emerald-50/60 text-emerald-950" : "border-sky-100 bg-sky-50/60 text-sky-950"}`}>
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={(event) => setRememberDevice(event.target.checked)}
                      className={`mt-0.5 h-4 w-4 shrink-0 rounded focus:ring-2 ${loginOtpRole === "provider" ? "accent-emerald-600 focus:ring-emerald-500/40" : "accent-sky-600 focus:ring-sky-500/40"}`}
                    />
                    <span>
                      <span className="block font-semibold">Trust this device</span>
                      <span className={`mt-0.5 block leading-5 ${loginOtpRole === "provider" ? "text-emerald-800" : "text-sky-800"}`}>
                        Don&apos;t ask for a code on this browser again.
                      </span>
                    </span>
                  </label>

                  {serverError && <p className="text-sm text-red-600" role="alert">{serverError}</p>}
                  <button
                    type="submit"
                    disabled={isSubmitting || !/^\d{6}$/.test(loginOtp)}
                    className={`w-full rounded-xl bg-linear-to-r ${a.button} px-4 py-3 font-semibold text-white transition-opacity hover:brightness-110 focus:outline-none focus:ring-2 ${a.buttonHover} focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {isSubmitting ? "Verifying..." : "Verify and sign in"}
                  </button>
                </form>

                <div className="flex flex-col items-center gap-3 text-sm">
                  <button
                    type="button"
                    onClick={handleResendLoginOtp}
                    disabled={isSubmitting || resendSeconds > 0}
                    className={`font-semibold disabled:cursor-not-allowed disabled:text-slate-400 ${a.link}`}
                  >
                    {resendSeconds > 0 ? `Resend code in ${formatWaitTime(resendSeconds)}` : "Resend code"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginOtpToken("");
                      setLoginOtp("");
                      setServerError("");
                      setResendSeconds(0);
                    }}
                    className="font-medium text-slate-600 hover:text-slate-900"
                  >
                    Back to credentials
                  </button>
                </div>
              </div>
            ) : adminChallengeToken ? (
              <div className="space-y-6">
                <div className="space-y-2 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-700" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="m3 7 9 6 9-6" />
                    </svg>
                  </div>
                  <h2 className="font-bold text-2xl text-slate-900">Verify your admin sign-in</h2>
                  <p className="text-sm leading-6 text-slate-600">
                    Enter the 6-digit code sent to {adminOtpDestination || "your admin email"}. The code expires in 5 minutes.
                  </p>
                </div>

                <form onSubmit={handleAdminOtpSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <p id="adminOtpLabel" className="text-center text-sm font-medium text-slate-700">
                      Verification code
                    </p>
                    <div
                      className="grid grid-cols-6 gap-2"
                      role="group"
                      aria-labelledby="adminOtpLabel"
                      aria-describedby={serverError ? "adminLoginError" : undefined}
                    >
                      {Array.from({ length: 6 }, (_, index) => (
                        <input
                          key={index}
                          ref={(element) => { adminOtpInputs.current[index] = element; }}
                          type="text"
                          inputMode="numeric"
                          autoComplete={index === 0 ? "one-time-code" : "off"}
                          pattern="[0-9]*"
                          maxLength={6}
                          required
                          aria-label={`Digit ${index + 1}`}
                          value={adminOtp[index] || ""}
                          onChange={(event) => updateAdminOtpDigit(index, event.target.value)}
                          onPaste={handleAdminOtpPaste}
                          onKeyDown={(event) => {
                            if (event.key === "Backspace" && !adminOtp[index] && index > 0) {
                              adminOtpInputs.current[index - 1]?.focus();
                            } else if (event.key === "ArrowLeft" && index > 0) {
                              event.preventDefault();
                              adminOtpInputs.current[index - 1]?.focus();
                            } else if (event.key === "ArrowRight" && index < 5) {
                              event.preventDefault();
                              adminOtpInputs.current[index + 1]?.focus();
                            }
                          }}
                          className="!h-12 min-w-0 rounded-xl border border-slate-200 bg-white px-0 text-center text-xl font-semibold tabular-nums text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                        />
                      ))}
                    </div>
                  </div>
                  {serverError && <p id="adminLoginError" className="text-sm text-red-600" role="alert">{serverError}</p>}
                  <button
                    type="submit"
                    disabled={isSubmitting || !/^\d{6}$/.test(adminOtp)}
                    className={`w-full rounded-xl bg-linear-to-r ${a.button} px-4 py-3 font-semibold text-white transition-opacity hover:brightness-110 focus:outline-none focus:ring-2 ${a.buttonHover} focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {isSubmitting ? "Verifying..." : "Verify and sign in"}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => {
                    setAdminChallengeToken("");
                    setAdminOtpDestination("");
                    setAdminOtp("");
                    setServerError("");
                  }}
                  className="w-full text-center text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  Back to credentials
                </button>
              </div>
            ) : (
              <>
            <div className="space-y-1 text-center">
              <h2 className="font-bold text-2xl text-gray-900">Welcome Back</h2>
              <p className="text-sm text-gray-600">
                Sign in to continue to your TaskPanda account
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email or Username
                </label>
                <input
                  type="text"
                  id="email"
                  name="email"
                  autoComplete="username"
                  required
                  placeholder="hello@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={() => handleBlur("email")}
                  className={`block w-full rounded-lg border px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400/70 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
                    showError("email")
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500/30"
                      : "border-primary-200 bg-primary-50/50 focus:border-primary-500 focus:ring-primary-500/30"
                  }`}
                />
                {showError("email") && (
                  <p className="text-xs text-red-600">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="space-y-1">
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      name="password"
                      autoComplete="current-password"
                      required
                      placeholder="&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;"
                      value={formData.password}
                      onChange={handleChange}
                      onKeyDown={updateCapsLockState}
                      onKeyUp={updateCapsLockState}
                      onBlur={() => {
                        handleBlur("password");
                        setCapsLockOn(false);
                      }}
                      className={`block w-full rounded-lg border py-2.5 pr-10 text-sm text-gray-800 placeholder-gray-400/70 transition-[padding,border-color,background-color,box-shadow] focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
                        capsLockOn ? "pl-12" : "px-4"
                      } ${
                        showError("password")
                          ? "border-red-400 focus:border-red-500 focus:ring-red-500/30"
                          : "border-primary-200 bg-primary-50/50 focus:border-primary-500 focus:ring-primary-500/30"
                      }`}
                    />
                    {capsLockOn && (
                      <span
                        className="pointer-events-none absolute inset-y-0 left-3 flex items-center"
                        role="status"
                        aria-label="Caps Lock is on"
                        aria-live="polite"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 shadow-sm">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 15V5" />
                            <path d="m8 9 4-4 4 4" />
                            <path d="M7 19h10" />
                          </svg>
                        </span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M3 3l18 18" />
                          <path d="M10.58 10.58A2 2 0 0 0 13.42 13.42" />
                          <path d="M9.88 5.08A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a17.2 17.2 0 0 1-4.21 5.33" />
                          <path d="M6.61 6.61A17.48 17.48 0 0 0 2 12s3.5 7 10 7a11.12 11.12 0 0 0 5.39-1.61" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {showError("password") && (
                    <p className="text-xs text-red-600 leading-5">{errors.password}</p>
                  )}
                  {serverError && !errors.email && !errors.password && (
                    <div className="space-y-1" role="alert">
                      <p className="text-xs text-red-600">
                        {lockoutSeconds > 0
                          ? `Too many failed login attempts. Please wait ${formatWaitTime(lockoutSeconds)} before trying again.`
                          : serverError}
                      </p>
                      {requiresPasswordReset && (
                        <button
                          type="button"
                          onClick={() => navigate("/forgot-password")}
                          className="text-xs font-semibold text-primary-600 hover:text-primary-800"
                        >
                          Forgot password? Reset it here.
                        </button>
                      )}
                      {unverifiedEmail && (
                        <Link
                          to={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`}
                          className="block text-xs font-semibold text-primary-600 hover:text-primary-800"
                        >
                          Verify your email or resend the link.
                        </Link>
                      )}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => navigate("/forgot-password")}
                      className="text-sm font-medium text-primary-600 hover:text-primary-800"
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    id="remember"
                    name="remember"
                    type="checkbox"
                    checked={formData.remember}
                    onChange={handleChange}
                    className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-500"
                  />
                  Remember me
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || lockoutSeconds > 0}
                className={`w-full rounded-lg bg-linear-to-r ${a.button} py-2.5 px-4 font-semibold text-white transition-opacity hover:brightness-110 focus:outline-none focus:ring-2 ${a.buttonHover} focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isSubmitting ? "Signing in..." : "Login"}
              </button>
            </form>

            <div className="text-center text-sm text-gray-600">
              Don&apos;t have an account?{' '}
              <Link
                to="/register"
                onClick={() => sessionStorage.setItem("registerOrigin", "login")}
                className={`font-medium ${a.link}`}
              >
                Register
              </Link>
            </div>
              </>
            )}
          </div>
        </section>
        {showRegistrationSuccess && (
          <div className={`fixed bottom-5 right-5 z-50 flex max-w-xs items-start gap-3 rounded-lg border border-green-200 bg-white px-4 py-3 text-sm text-green-800 shadow-lg transition-opacity duration-700 ${isRegistrationToastFading ? "opacity-0" : "opacity-100"}`} role="status">
            <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">✓</span>
            <div className="flex-1">
              <p className="font-semibold">Account created successfully</p>
              <p className="text-xs text-green-700">You can now sign in.</p>
            </div>
            <button type="button" onClick={() => setShowRegistrationSuccess(false)} className="text-green-600 hover:text-green-900" aria-label="Dismiss notification">×</button>
          </div>
        )}
        {showPasswordResetSuccess && (
          <div className={`fixed bottom-5 right-5 z-50 flex max-w-xs items-start gap-3 rounded-lg border border-green-200 bg-white px-4 py-3 text-sm text-green-800 shadow-lg transition-opacity duration-700 ${isPasswordResetToastFading ? "opacity-0" : "opacity-100"}`} role="status">
            <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">✓</span>
            <div className="flex-1">
              <p className="font-semibold">Password reset successfully</p>
              <p className="text-xs text-green-700">You can now sign in.</p>
            </div>
            <button type="button" onClick={() => setShowPasswordResetSuccess(false)} className="text-green-600 hover:text-green-900" aria-label="Dismiss notification">×</button>
          </div>
        )}
        </>
      )}
    </Layout>
  );
}
