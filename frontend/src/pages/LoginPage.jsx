import { apiFetch } from "../services/api.js";
import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import SocialButton from "../components/SocialButton.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function formatWaitTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, logout } = useAuth();
  const [formData, setFormData] = useState({ email: "", password: "", remember: true });
  const [adminChallengeToken, setAdminChallengeToken] = useState("");
  const [adminOtp, setAdminOtp] = useState("");
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
        const stepKey = role === "provider" ? "workerStep1" : "clientStep1";
        const stepData = {
          email: incompleteUser.email || formData.email,
          username: incompleteUser.username || "",
          ...(role === "provider" ? { professions: incompleteUser.professions || [] } : {}),
        };
        sessionStorage.setItem("taskpanda_onboarding_token", data.onboardingToken || "");
        sessionStorage.setItem(stepKey, JSON.stringify(stepData));
        localStorage.removeItem(stepKey);
        navigate(role === "provider" ? "/worker-register/name" : "/client-register/name", { replace: true });
        return;
      }
      if (response.ok && data.requiresAdminOtp) {
        setAdminChallengeToken(data.challengeToken || "");
        setAdminOtp("");
        setServerError("");
        return;
      }
      if (response.ok) {
        const loggedInUser = data.user || { email: formData.email, role: data.role || "client" };
        login({ ...loggedInUser, role: data.role || loggedInUser.role || "client" }, data.token, formData.remember);
        const destination = data.role === "provider"
          ? "/provider-dashboard"
          : data.role === "admin"
          ? "/admin"
          : "/dashboard";
        navigate(destination);
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
      navigate("/admin");
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
    <Layout theme="primary">
      {(a) => (
        <>
        <section className="flex items-center justify-center bg-white px-6 pt-16 pb-6 lg:h-full sm:px-8 md:pt-20">
          <div className="w-full max-w-sm space-y-6">
            {adminChallengeToken ? (
              <>
                <div className="space-y-1 text-center">
                  <h2 className="font-bold text-2xl text-slate-900">Verify your admin sign-in</h2>
                  <p className="text-sm leading-6 text-slate-600">
                    Enter the 6-digit code sent to the configured admin email. The code expires in 5 minutes.
                  </p>
                </div>

                <form onSubmit={handleAdminOtpSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="adminLoginCode" className="block text-sm font-medium text-slate-700">
                      Verification code
                    </label>
                    <input
                      id="adminLoginCode"
                      name="adminLoginCode"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      value={adminOtp}
                      onChange={(event) => setAdminOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-center text-xl font-semibold leading-7 tracking-[0.35em] text-slate-900 placeholder:text-slate-300 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                      aria-describedby={serverError ? "adminLoginError" : undefined}
                    />
                  </div>
                  {serverError && <p id="adminLoginError" className="text-sm text-red-600" role="alert">{serverError}</p>}
                  <button
                    type="submit"
                    disabled={isSubmitting || adminOtp.length !== 6}
                    className={`w-full rounded-xl bg-linear-to-r ${a.button} px-4 py-3 font-semibold text-white transition-opacity hover:brightness-110 focus:outline-none focus:ring-2 ${a.buttonHover} focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {isSubmitting ? "Verifying..." : "Verify and sign in"}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => {
                    setAdminChallengeToken("");
                    setAdminOtp("");
                    setServerError("");
                  }}
                  className="w-full text-center text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  Back to credentials
                </button>
              </>
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

            <div className="flex items-center gap-3 text-sm text-gray-400">
              <span className="h-px flex-1 bg-gray-200"></span>
              <span>Or continue with</span>
              <span className="h-px flex-1 bg-gray-200"></span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SocialButton provider="google" />
              <SocialButton provider="facebook" />
            </div>

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
