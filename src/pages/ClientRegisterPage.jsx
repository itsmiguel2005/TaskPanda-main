import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import TermsModal from "../components/TermsModal.jsx";

export default function ClientRegisterPage() {
  console.log("[ClientRegisterPage] MOUNTED");
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [availability, setAvailability] = useState({ field: "", message: "", checking: false });

  const emailValid = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const passwordError = (password) => {
    if (!password) return "Password is required";
    const missing = [];
    if (/\s/.test(password)) missing.push("no spaces");
    if (password.length < 6) missing.push("at least 6 characters");
    if (password.length > 15) missing.push("no more than 15 characters");
    if (!/[A-Z]/.test(password)) missing.push("one uppercase letter");
    if (!/[^A-Za-z0-9]/.test(password)) missing.push("one special character");
    return missing.length ? `Password needs ${missing.join(", ")}.` : "";
  };

  const errors = {
    username: !formData.username.trim()
      ? "Username is required"
      : formData.username.trim().length < 3
      ? "Username must be at least 3 characters"
      : "",
    email: !formData.email.trim()
      ? "Email is required"
      : !emailValid(formData.email)
      ? "Please enter a valid email address"
      : "",
    password: passwordError(formData.password),
    confirmPassword: !formData.confirmPassword
      ? "Please confirm your password"
      : formData.confirmPassword !== formData.password
      ? "Passwords do not match"
      : "",
  };

  const showFieldError = (field) => touched[field] && errors[field];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  useEffect(() => {
    const email = formData.email.trim();
    const username = formData.username.trim();
    setAvailability({ field: "", message: "", checking: false });
    if (!emailValid(email) || username.length < 3) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAvailability({ field: "", message: "", checking: true });
      try {
        const response = await fetch("/api/auth/check-registration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "client", email, username }),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        setAvailability(response.ok
          ? { field: "", message: "", checking: false }
          : { field: data.field || "email", message: data.message || "That email or username is already in use.", checking: false });
      } catch (error) {
        if (error.name !== "AbortError") setAvailability({ field: "", message: "", checking: false });
      }
    }, 450);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [formData.email, formData.username]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setTouched({
      username: true,
      email: true,
      password: true,
      confirmPassword: true,
    });
    if (Object.values(errors).some((err) => err)) return;

    if (!agreedToTerms) {
      setError("You must agree to the Terms of Service and Privacy Policy");
      return;
    }

    setIsChecking(true);
    try {
      const response = await fetch("/api/auth/check-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "client", email: formData.email, username: formData.username }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || "That email or username is already in use.");
        return;
      }
    } catch {
      setError("Unable to check account availability. Please try again.");
      return;
    } finally {
      setIsChecking(false);
    }

    const step1 = {
      username: formData.username,
      email: formData.email,
      password: formData.password,
    };
    sessionStorage.setItem("clientStep1", JSON.stringify(step1));
    localStorage.setItem("clientStep1", JSON.stringify(step1));
    navigate("/client-register/name");
  };

  return (
    <Layout theme="primary">
      {(a) => (
        <>
        <section className="flex items-center justify-center bg-white px-6 pt-16 pb-6 lg:h-full sm:px-8 md:pt-20">
          <div className="w-full max-w-sm space-y-6">
            <div className="mb-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate("/register")}
                className="inline-flex items-center justify-center rounded-lg border border-primary-200 bg-primary-50 p-2 text-primary-700 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                aria-label="Back to role selection"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M15.75 19.5L8.25 12l7.5-7.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <span className="text-sm font-medium text-gray-500">Back to role selection</span>
            </div>

            <div className="space-y-1 text-center">
              <h2 className="font-bold text-2xl text-gray-900">
                Create your client account
              </h2>
              <p className="text-sm text-gray-600">
                Sign up to start finding and hiring trusted mechanics, plumbers,
                electricians, and more for your home.
              </p>
            </div>

            <div className="flex justify-center gap-1.5" aria-label="Registration progress">
              {[1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className={`h-1.5 w-5 rounded-full ${step === 1 ? "bg-primary-600" : "bg-gray-200"}`}
                />
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  Username
                </label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  autoComplete="username"
                  required
                  placeholder="janesmith"
                  value={formData.username}
                  onChange={handleChange}
                  onBlur={() => handleBlur("username")}
                  className={`block w-full rounded-lg border px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400/70 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
                    showFieldError("username")
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500/30"
                      : "border-primary-200 bg-primary-50/50 focus:border-primary-500 focus:ring-primary-500/30"
                  }`}
                />
                {showFieldError("username") && (
                  <p className="text-xs text-red-600">{errors.username}</p>
                )}
                {availability.field === "username" && (
                  <p className="text-xs text-red-600" role="alert">{availability.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  autoComplete="email"
                  placeholder="hello@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={() => handleBlur("email")}
                  className={`block w-full rounded-lg border px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400/70 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
                    showFieldError("email")
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500/30"
                      : "border-primary-200 bg-primary-50/50 focus:border-primary-500 focus:ring-primary-500/30"
                  }`}
                />
                {showFieldError("email") && (
                  <p className="text-xs text-red-600">{errors.email}</p>
                )}
                {availability.field === "email" && (
                  <p className="text-xs text-red-600" role="alert">{availability.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    name="password"
                    autoComplete="new-password"
                    maxLength={15}
                    placeholder="Create a password"
                    value={formData.password}
                    onChange={handleChange}
                    onBlur={() => handleBlur("password")}
                    className={`block w-full rounded-lg border px-4 py-2.5 pr-11 text-sm text-gray-800 placeholder-gray-400/70 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
                      showFieldError("password")
                        ? "border-red-400 focus:border-red-500 focus:ring-red-500/30"
                        : "border-primary-200 bg-primary-50/50 focus:border-primary-500 focus:ring-primary-500/30"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
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
                {showFieldError("password") && (
                  <p className="text-xs text-red-600">{errors.password}</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    id="confirmPassword"
                    name="confirmPassword"
                    autoComplete="new-password"
                    maxLength={15}
                    placeholder="Repeat your password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    onBlur={() => handleBlur("confirmPassword")}
                    className={`block w-full rounded-lg border px-4 py-2.5 pr-11 text-sm text-gray-800 placeholder-gray-400/70 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
                      showFieldError("confirmPassword")
                        ? "border-red-400 focus:border-red-500 focus:ring-red-500/30"
                        : "border-primary-200 bg-primary-50/50 focus:border-primary-500 focus:ring-primary-500/30"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                  >
                    {showConfirmPassword ? (
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
                {showFieldError("confirmPassword") && (
                  <p className="text-xs text-red-600">{errors.confirmPassword}</p>
                )}
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
                  {error}
                </div>
              )}

              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="agreeTerms"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="agreeTerms" className="text-sm text-gray-600">
                  I agree to the{" "}
                  <button
                    type="button"
                    onClick={() => setShowTerms(true)}
                    className="font-medium text-primary-600 hover:text-primary-800 underline"
                  >
                    Terms of Service
                  </button>{" "}
                  and{" "}
                  <button
                    type="button"
                    onClick={() => setShowTerms(true)}
                    className="font-medium text-primary-600 hover:text-primary-800 underline"
                  >
                    Privacy Policy
                  </button>
                </label>
              </div>

              <button
                type="submit"
                disabled={!agreedToTerms || isChecking}
                className={`w-full rounded-lg bg-gradient-to-r ${a.button} px-4 py-2.5 font-semibold text-white transition-opacity hover:brightness-110 focus:outline-none focus:ring-2 ${a.buttonHover} focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 lg:col-span-2`}
              >
                {isChecking ? "Checking..." : "Next"}
              </button>
            </form>

            <div className="text-center text-sm text-gray-600">
              Already have an account?{" "}
              <Link to="/login" className={`font-medium ${a.link}`}>
                Log in here
              </Link>
            </div>
          </div>
        </section>
        <TermsModal open={showTerms} onClose={() => setShowTerms(false)} />
      </>
      )}
    </Layout>
  );
}
