import { apiFetch } from "../services/api.js";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter.jsx";
import RecaptchaDisclosure from "../components/RecaptchaDisclosure.jsx";
import { executeRecaptcha } from "../utils/recaptcha.js";

function passwordError(password) {
  if (!password) return "Password is required";
  const missing = [];
  if (password.length < 8) missing.push("at least 8 characters");
  if (password.length > 15) missing.push("no more than 15 characters");
  if (!/[A-Z]/.test(password)) missing.push("one uppercase letter");
  if (!/[^A-Za-z0-9]/.test(password)) missing.push("one special character");
  return missing.length ? `Password needs ${missing.join(", ")}.` : "";
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const [resendCooldown, setResendCooldown] = useState(0);
  const [adminSetupToken, setAdminSetupToken] = useState("");
  const codeInputs = useRef([]);

  useEffect(() => {
    const linkedEmail = String(searchParams.get("email") || "").trim().toLowerCase();
    const linkedCode = String(searchParams.get("code") || "").trim();
    const linkedSetupToken = String(searchParams.get("setupToken") || "").trim();
    if (/^\S+@\S+\.\S+$/.test(linkedEmail) && /^[a-f\d]{64}$/i.test(linkedSetupToken)) {
      setEmail(linkedEmail);
      setAdminSetupToken(linkedSetupToken);
      setStep(3);
      setError("");
      setMessage("");
      navigate("/forgot-password", { replace: true });
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(linkedEmail) || !/^\d{6}$/.test(linkedCode)) return;

    setEmail(linkedEmail);
    setCode(linkedCode);
    setStep(2);
    setError("");
    setMessage("Reset code loaded. Verify it to choose a new password.");
    navigate("/forgot-password", { replace: true });
  }, [navigate, searchParams]);

  useEffect(() => {
    if (step === 2 && !isSubmitting) codeInputs.current[0]?.focus();
  }, [isSubmitting, step]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setResendCooldown((remaining) => Math.max(remaining - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

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
      const recaptchaToken = await executeRecaptcha("forgot_password");
      const response = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), recaptchaToken }),
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
      setCode("");
      setStep(2);
      setResendCooldown(60);
    } catch (submitError) {
      setError(submitError.message?.startsWith("reCAPTCHA")
        ? submitError.message
        : "Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateCodeDigit = (index, rawValue) => {
    const digits = rawValue.replace(/\D/g, "");
    if (digits.length > 1) {
      const nextCode = digits.slice(0, 6);
      setCode(nextCode);
      codeInputs.current[Math.min(nextCode.length, 5)]?.focus();
      setError("");
      return;
    }
    setCode((current) => {
      const next = current.padEnd(6, " ").split("");
      next[index] = digits || " ";
      return next.join("").trimEnd();
    });
    setError("");
    if (digits && index < 5) codeInputs.current[index + 1]?.focus();
  };

  const handleCodePaste = (event) => {
    event.preventDefault();
    const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    setCode(digits);
    setError("");
    codeInputs.current[Math.min(digits.length, 5)]?.focus();
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit reset code.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await apiFetch("/api/auth/forgot-password/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || "Unable to verify the reset code.");
        return;
      }
      setStep(3);
      setMessage(data.message || "Reset code verified. Choose a new password.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendCode = async () => {
    if (resendCooldown > 0 || isSubmitting) return;
    setError("");
    setMessage("");
    setIsSubmitting(true);
    try {
      const recaptchaToken = await executeRecaptcha("forgot_password");
      const response = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), recaptchaToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || "Unable to resend the reset code.");
        return;
      }
      setMessage(
        data.debugCode
          ? `${data.message} Use this code for testing: ${data.debugCode}`
          : data.message
      );
      setCode("");
      codeInputs.current[0]?.focus();
      setResendCooldown(60);
    } catch (submitError) {
      setError(submitError.message?.startsWith("reCAPTCHA")
        ? submitError.message
        : "Network error. Please try again.");
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
    if (!adminSetupToken && !/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit reset code.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await apiFetch(adminSetupToken ? "/api/auth/admin-setup" : "/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adminSetupToken
          ? { email: email.trim(), setupToken: adminSetupToken, password }
          : { email: email.trim(), code, password }),
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
            <div className="flex items-center">
              <Link to="/login" className="auth-back-link group inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-500" aria-label="Back to login">
                <svg className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-1" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15.75 19.5L8.25 12l7.5-7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Back to login
              </Link>
            </div>

            <div className="space-y-1 text-center">
              <h2 className="text-2xl font-bold text-gray-900">{adminSetupToken ? "Set your admin password" : "Reset your password"}</h2>
              <p className="text-sm text-gray-600">
                {adminSetupToken
                  ? "Choose a password for your new admin login."
                  : step === 1
                  ? "Enter your account email and we will send you a reset code."
                  : step === 2
                  ? "Enter the 6-digit code sent to your email."
                  : "Your code is verified. Choose a new password."}
              </p>
            </div>

            {step === 1 ? (
              <form onSubmit={submitEmail} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="resetEmail" className="block text-sm font-medium text-gray-700">Email Address</label>
                  <input id="resetEmail" type="email" autoComplete="email" placeholder="hello@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} className="block w-full rounded-lg border border-primary-200 bg-primary-50/50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400/70 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                </div>
                {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
                <button type="submit" disabled={isSubmitting} className={`w-full rounded-lg bg-linear-to-r ${a.button} px-4 py-2.5 font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50`}>{isSubmitting ? "Sending..." : "Send reset code"}</button>
              </form>
            ) : step === 2 ? (
              <div className="space-y-5">
                <p className="text-center text-sm leading-6 text-slate-600">
                  We sent a reset code to the email address on file for this account. It expires in 10 minutes.
                </p>
                <form onSubmit={verifyCode} className="space-y-5">
                  <div className="space-y-2">
                    <p id="resetCodeLabel" className="text-center text-sm font-medium text-slate-700">
                      Verification code
                    </p>
                    <div className="grid grid-cols-6 gap-2" role="group" aria-labelledby="resetCodeLabel" aria-describedby={error ? "resetCodeError" : undefined}>
                      {Array.from({ length: 6 }, (_, index) => (
                        <input
                          key={index}
                          ref={(element) => { codeInputs.current[index] = element; }}
                          type="text"
                          inputMode="numeric"
                          autoComplete={index === 0 ? "one-time-code" : "off"}
                          pattern="[0-9]*"
                          maxLength={6}
                          aria-label={`Digit ${index + 1}`}
                          value={code[index] || ""}
                          onChange={(event) => updateCodeDigit(index, event.target.value)}
                          onPaste={handleCodePaste}
                          onKeyDown={(event) => {
                            if (event.key === "Backspace" && !code[index] && index > 0) {
                              codeInputs.current[index - 1]?.focus();
                            } else if (event.key === "ArrowLeft" && index > 0) {
                              event.preventDefault();
                              codeInputs.current[index - 1]?.focus();
                            } else if (event.key === "ArrowRight" && index < 5) {
                              event.preventDefault();
                              codeInputs.current[index + 1]?.focus();
                            }
                          }}
                          className="!h-12 min-w-0 rounded-xl border border-slate-200 bg-white px-0 text-center text-xl font-semibold tabular-nums text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                        />
                      ))}
                    </div>
                  </div>
                  {error && <p id="resetCodeError" className="text-sm text-red-600" role="alert">{error}</p>}
                  {message && <p className="text-center text-sm text-sky-800" role="status">{message}</p>}
                  <button type="submit" disabled={isSubmitting || !/^\d{6}$/.test(code)} className={`w-full rounded-xl bg-linear-to-r ${a.button} px-4 py-3 font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50`}>
                    {isSubmitting ? "Checking code..." : "Verify code"}
                  </button>
                </form>
                <div className="flex flex-col items-center gap-3 text-sm">
                  <button type="button" onClick={resendCode} disabled={resendCooldown > 0 || isSubmitting} className="font-semibold text-primary-700 hover:text-primary-900 disabled:cursor-not-allowed disabled:text-gray-400">
                    {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                  </button>
                  <button type="button" onClick={() => { setStep(1); setError(""); setMessage(""); }} className="font-medium text-slate-600 hover:text-slate-900">
                    Change email address
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submitReset} className="space-y-4">
                {message && <p className="text-sm text-emerald-700" role="status">{message}</p>}
                <div className="space-y-2">
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">New Password</label>
                  <div className="relative">
                    <input id="newPassword" type={showPassword ? "text" : "password"} maxLength={15} autoComplete="new-password" placeholder="Create a password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} className="block w-full rounded-lg border border-primary-200 bg-primary-50/50 px-4 py-2.5 pr-11 text-sm text-gray-800 placeholder-gray-400/70 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                    <button type="button" onClick={() => setShowPassword((previous) => !previous)} className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 transition-colors hover:text-gray-600 focus:outline-none" aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <PasswordStrengthMeter password={password} />
                <div className="space-y-2">
                  <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                  <div className="relative">
                    <input id="confirmNewPassword" type={showConfirmPassword ? "text" : "password"} maxLength={15} autoComplete="new-password" placeholder="Repeat your password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(""); }} className="block w-full rounded-lg border border-primary-200 bg-primary-50/50 px-4 py-2.5 pr-11 text-sm text-gray-800 placeholder-gray-400/70 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                    <button type="button" onClick={() => setShowConfirmPassword((previous) => !previous)} className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 transition-colors hover:text-gray-600 focus:outline-none" aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}>
                      {showConfirmPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
                <button type="submit" disabled={isSubmitting} className={`w-full rounded-lg bg-linear-to-r ${a.button} px-4 py-2.5 font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50`}>{isSubmitting ? "Updating..." : adminSetupToken ? "Set password" : "Reset password"}</button>
              </form>
            )}
            {!adminSetupToken && <RecaptchaDisclosure />}
          </div>
        </section>
      )}
    </Layout>
  );
}
