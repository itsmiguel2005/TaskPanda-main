import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { clearRegistrationDraft, readRegistrationDraft, saveRegistrationDraft } from "../utils/registrationDraft.js";
import { normalizePhilippineMobile } from "../utils/registrationValidation.js";

export default function WorkerRegisterPhone() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [mobileNumber, setMobileNumber] = useState(() => readRegistrationDraft("workerPhoneStep", { mobileNumber: "" }).mobileNumber);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    const normalizedMobileNumber = normalizePhilippineMobile(mobileNumber);
    if (!normalizedMobileNumber) return setError("Enter a valid Philippine mobile number, such as +63 9XX XXX XXXX.");
    const onboardingToken = sessionStorage.getItem("taskpanda_onboarding_token");
    if (!onboardingToken) return setError("Your registration session expired. Sign in again to continue.");
    const keys = ["workerStep1", "workerNameStep", "workerLocationStep", "workerDobStep"];
    const stored = keys.map((key) => sessionStorage.getItem(key) || localStorage.getItem(key));
    if (stored.some((value) => !value)) return setError("Registration data is missing. Please start again.");

    try {
      const [step1, name, location, dob] = stored.map((value) => JSON.parse(value));
      setIsSubmitting(true);
      const { password, ...accountData } = step1;
      const response = await fetch("/api/auth/complete-registration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${onboardingToken}`,
        },
        body: JSON.stringify({ ...accountData, ...name, ...location, ...dob, mobileNumber: normalizedMobileNumber, role: "provider" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || "Registration failed. Please try again.");
        if (response.status === 401) sessionStorage.removeItem("taskpanda_onboarding_token");
        return;
      }
      keys.forEach((key) => { sessionStorage.removeItem(key); localStorage.removeItem(key); });
      clearRegistrationDraft("workerPhoneStep");
      sessionStorage.removeItem("taskpanda_onboarding_token");
      login(data.user, data.token, false);
      navigate("/provider-dashboard", { replace: true });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout theme="green">
      {(a) => (
        <>
          <section className="flex items-center justify-center bg-white px-6 pt-16 pb-6 lg:h-full sm:px-8 md:pt-20">
            <div className="w-full max-w-sm space-y-6">
              <div className="flex items-center"><Link to="/worker-register/dob" className="auth-back-link group inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-500" aria-label="Back to date of birth"><svg className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-1" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15.75 19.5L8.25 12l7.5-7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>Back to date of birth</Link></div>
              <div className="space-y-1 text-center"><h2 className="text-2xl font-bold text-green-800">What&apos;s your mobile number?</h2><p className="text-sm text-gray-500">We will use this for bookings and coordination.</p></div>
              <div className="flex justify-center gap-1.5" aria-label="Registration progress">{[1, 2, 3, 4, 5].map((step) => <span key={step} className={`h-1.5 w-5 rounded-full ${step === 5 ? "bg-green-600" : "bg-gray-200"}`} />)}</div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2"><label htmlFor="workerMobileNumber" className="block text-sm font-medium text-gray-700">Mobile Number</label><input id="workerMobileNumber" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="+63 9XX XXX XXXX" value={mobileNumber} onChange={(event) => { const value = event.target.value.replace(/[^\d+\s()-]/g, "").slice(0, 20); setMobileNumber(value); saveRegistrationDraft("workerPhoneStep", { mobileNumber: value }); }} className="block w-full rounded-lg border border-green-200 bg-green-50/50 px-4 py-2.5 text-sm text-gray-800 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/30" /></div>
                {error && <p className="text-sm text-red-600" role="alert">{error} {error.toLowerCase().includes("sign in again") && <Link to="/login" className="font-semibold underline">Sign in again</Link>}</p>}
                <button type="submit" disabled={isSubmitting} className={`w-full rounded-lg bg-linear-to-r ${a.button} px-4 py-2.5 font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50`}>{isSubmitting ? "Creating account..." : "Complete Signup"}</button>
              </form>
            </div>
          </section>
        </>
      )}
    </Layout>
  );
}
