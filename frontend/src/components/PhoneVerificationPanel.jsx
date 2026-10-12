import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";

export function PhoneVerificationStatus({ verified }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        verified ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
      }`}
    >
      {verified ? "Verified" : "Not verified"}
    </span>
  );
}

export default function PhoneVerificationPanel({ phone: phoneProp, onVerified }) {
  const { token, user, updateUser } = useAuth();
  const phone = String(phoneProp ?? user?.mobileNumber ?? "").trim();
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const isCurrentNumberVerified = user?.phoneVerified === true && phone === user.mobileNumber;

  useEffect(() => {
    setOtpCode("");
    setError("");
    setNotice("");
    setCodeSent(false);
    setVerified(false);
  }, [phone]);

  if (isCurrentNumberVerified || verified) {
    return null;
  }

  const sendCode = async () => {
    setIsSending(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/profile/phone-verification/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not send a verification code.");
      setCodeSent(true);
      setNotice(data.message || `A verification code was sent to ${phone}.`);
    } catch (sendError) {
      setError(sendError.message || "Could not send a verification code.");
    } finally {
      setIsSending(false);
    }
  };

  const verifyCode = async (event) => {
    event?.preventDefault();
    if (isVerifying || otpCode.length !== 6) return;
    setIsVerifying(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/profile/phone-verification/verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone, otpCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not verify your phone number.");
      onVerified?.(data.mobileNumber);
      updateUser({ phoneVerified: true, mobileNumber: data.mobileNumber });
      setVerified(true);
      setNotice(data.message || "Your phone number is verified and saved.");
      setOtpCode("");
    } catch (verifyError) {
      setError(verifyError.message || "Could not verify your phone number.");
      setOtpCode("");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h3 className="text-sm font-semibold text-slate-900">
            {phone !== user?.mobileNumber ? "Verify your new phone number" : "Verify your phone number"}
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {phone !== user?.mobileNumber
              ? "Your current number will stay on your account until you verify this new one by SMS."
              : "Confirm the saved number to secure your account. You can keep using TaskPanda while it is unverified."}
          </p>
        </div>
        {phoneProp == null && (
          <Link
            to="/profile/edit"
            className="dashboard-focus rounded-lg px-2 py-1 text-sm font-semibold text-blue-700 transition hover:text-blue-900 focus-visible:outline-blue-600"
          >
            {user?.mobileNumber ? "Change number" : "Add number"}
          </Link>
        )}
      </div>
      {codeSent ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block w-full max-w-xs">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">6-digit verification code</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              pattern="[0-9]{6}"
              required
              value={otpCode}
              onChange={(event) => {
                setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") verifyCode(event);
              }}
              className="dashboard-focus w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "phone-verification-error" : undefined}
            />
          </label>
          <button
            type="button"
            onClick={() => verifyCode()}
            disabled={isVerifying || isSending || otpCode.length !== 6}
            className="dashboard-primary-button dashboard-focus px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isVerifying ? "Verifying..." : "Verify and save number"}
          </button>
          <button
            type="button"
            onClick={sendCode}
            disabled={isSending || isVerifying}
            className="dashboard-secondary-button dashboard-focus px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? "Sending..." : "Resend code"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={sendCode}
          disabled={isSending}
          className="dashboard-primary-button dashboard-focus mt-4 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSending ? "Sending..." : "Send verification code"}
        </button>
      )}
      {notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
      {error && (
        <p id="phone-verification-error" role="alert" aria-live="assertive" className="mt-3 text-sm font-medium text-red-700">
          {error}
          {error.toLowerCase().includes("code is incorrect") && " Check the SMS and try again, or request a new code."}
        </p>
      )}
    </div>
  );
}
