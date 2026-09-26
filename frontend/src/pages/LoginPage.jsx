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
  const [formData, setFormData] = useState({ email: "", password: "", remember: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
      : formData.password.length < 6
      ? "Password must be at least 6 characters"
      : "",
  };

  const showError = (field) =>
    (touched[field] || (serverError && !errors.email && !errors.password)) && errors[field];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");
    setRequiresPasswordReset(false);
    setTouched({ email: true, password: true });
    if (errors.email || errors.password) return;
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
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
                      onBlur={() => handleBlur("password")}
                      className={`block w-full rounded-lg border px-4 py-2.5 pr-10 text-sm text-gray-800 placeholder-gray-400/70 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
                        showError("password")
                          ? "border-red-400 focus:border-red-500 focus:ring-red-500/30"
                          : "border-primary-200 bg-primary-50/50 focus:border-primary-500 focus:ring-primary-500/30"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-gray-400 transition-colors hover:text-gray-600 focus:outline-none"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="h-5 w-5"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="h-5 w-5"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
                className={`w-full rounded-lg bg-gradient-to-r ${a.button} py-2.5 px-4 font-semibold text-white transition-opacity hover:brightness-110 focus:outline-none focus:ring-2 ${a.buttonHover} focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`}
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
