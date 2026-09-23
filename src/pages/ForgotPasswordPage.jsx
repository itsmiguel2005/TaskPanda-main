import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";

function passwordError(password) {
  if (!password) return "Password is required";
  const missing = [];
  if (password.length < 6) missing.push("at least 6 characters");
  if (password.length > 15) missing.push("no more than 15 characters");
  if (!/[A-Z]/.test(password)) missing.push("one uppercase letter");
  if (!/[^A-Za-z0-9]/.test(password)) missing.push("one special character");
  return missing.length ? `Password needs ${missing.join(", ")}.` : "";
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const submitEmail = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || "Unable to start password reset.");
        setMessage("");
        return;
      }
      setMessage(
        data.debugCode
          ? `${data.message} Use this code for testing: ${data.debugCode}`
          : data.message
      );
      setError("");
      setStep(2);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitReset = async (event) => {
    event.preventDefault();
    setError("");
    const passwordIssue = passwordError(password);
    if (passwordIssue) {
      setError(passwordIssue);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit reset code.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || "Unable to reset password.");
        return;
      }
      navigate("/login", { state: { passwordResetSuccess: true } });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout theme="primary">
      {(a) => (
        <section className="flex items-center justify-center bg-white px-6 pt-16 pb-6 lg:h-full sm:px-8 md:pt-20">
          <div className="w-full max-w-sm space-y-6">
            <div className="flex items-center gap-2">
              <Link to="/login" className="inline-flex items-center justify-center rounded-lg border border-primary-200 bg-primary-50 p-2 text-primary-700 hover:bg-primary-100" aria-label="Back to login">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15.75 19.5L8.25 12l7.5-7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
              <span className="text-sm font-medium text-gray-500">Back to login</span>
            </div>

            <div className="space-y-1 text-center">
              <h2 className="text-2xl font-bold text-gray-900">Reset your password</h2>
              <p className="text-sm text-gray-600">
                {step === 1 ? "Enter your account email and we will send you a reset code." : "Enter the code from your email and choose a new password."}
              </p>
            </div>

            {step === 1 ? (
              <form onSubmit={submitEmail} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="resetEmail" className="block text-sm font-medium text-gray-700">Email Address</label>
                  <input id="resetEmail" type="email" autoComplete="email" placeholder="hello@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} className="block w-full rounded-lg border border-primary-200 bg-primary-50/50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400/70 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                </div>
                {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
                <button type="submit" disabled={isSubmitting} className={`w-full rounded-lg bg-gradient-to-r ${a.button} px-4 py-2.5 font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50`}>{isSubmitting ? "Sending..." : "Send reset code"}</button>
              </form>
            ) : (
              <form onSubmit={submitReset} className="space-y-4">
                {message && <p className="text-sm text-green-700" role="status">{message}</p>}
                <div className="space-y-2">
                  <label htmlFor="resetCode" className="block text-sm font-medium text-gray-700">Reset Code</label>
                  <input id="resetCode" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Enter 6-digit code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="block w-full rounded-lg border border-primary-200 bg-primary-50/50 px-4 py-2.5 text-center text-lg tracking-[0.35em] text-gray-800 placeholder-gray-400/70 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">New Password</label>
                  <div className="relative">
                    <input id="newPassword" type={showPassword ? "text" : "password"} maxLength={15} autoComplete="new-password" placeholder="Create a password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} className="block w-full rounded-lg border border-primary-200 bg-primary-50/50 px-4 py-2.5 pr-11 text-sm text-gray-800 placeholder-gray-400/70 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                    <button type="button" onClick={() => setShowPassword((previous) => !previous)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                  <div className="relative">
                    <input id="confirmNewPassword" type={showConfirmPassword ? "text" : "password"} maxLength={15} autoComplete="new-password" placeholder="Repeat your password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(""); }} className="block w-full rounded-lg border border-primary-200 bg-primary-50/50 px-4 py-2.5 pr-11 text-sm text-gray-800 placeholder-gray-400/70 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                    <button type="button" onClick={() => setShowConfirmPassword((previous) => !previous)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500" aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}>{showConfirmPassword ? "Hide" : "Show"}</button>
                  </div>
                </div>
                {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
                <button type="submit" disabled={isSubmitting} className={`w-full rounded-lg bg-gradient-to-r ${a.button} px-4 py-2.5 font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50`}>{isSubmitting ? "Updating..." : "Reset password"}</button>
              </form>
            )}
          </div>
        </section>
      )}
    </Layout>
  );
}
