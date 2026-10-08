import { apiFetch } from "../services/api.js";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import PhilippineMobileInput from "../components/PhilippineMobileInput.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { clearRegistrationDraft, readRegistrationDraft, saveRegistrationDraft } from "../utils/registrationDraft.js";
import { getPhilippineMobileInputValue, normalizePhilippineMobile } from "../utils/registrationValidation.js";

export default function ClientRegisterPhone() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [mobileNumber, setMobileNumber] = useState(() => getPhilippineMobileInputValue(readRegistrationDraft("clientPhoneStep", { mobileNumber: "" }).mobileNumber));
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const normalizedMobileNumber = normalizePhilippineMobile(mobileNumber);
    if (!normalizedMobileNumber) {
      setError("Enter 10 digits starting with 9 for a Philippine mobile number.");
      return;
    }
    const onboardingToken = sessionStorage.getItem("taskpanda_onboarding_token");
    if (!onboardingToken) {
      setError("Your registration session expired. Sign in again to continue.");
      return;
    }
    const step1Raw = sessionStorage.getItem("clientStep1") || localStorage.getItem("clientStep1");
    const nameRaw = sessionStorage.getItem("clientNameStep") || localStorage.getItem("clientNameStep");
    const locationRaw = sessionStorage.getItem("clientLocationStep") || localStorage.getItem("clientLocationStep");
    if (!step1Raw || !nameRaw || !locationRaw) {
      setError("Registration data is missing. Please start again.");
      return;
    }

    try {
      setIsSubmitting(true);
      const step1 = JSON.parse(step1Raw);
      const nameData = JSON.parse(nameRaw);
      const locationData = JSON.parse(locationRaw);
      const { password, ...accountData } = step1;
      const payload = {
        ...accountData,
        ...nameData,
        ...locationData,
        fullName: [nameData.firstName, nameData.middleName, nameData.lastName].filter(Boolean).join(" "),
        mobileNumber: normalizedMobileNumber,
        role: "client",
      };
      const response = await apiFetch("/api/auth/complete-registration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${onboardingToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || "Registration failed. Please try again.");
        if (response.status === 401) sessionStorage.removeItem("taskpanda_onboarding_token");
        return;
      }
      ["clientStep1", "clientNameStep", "clientLocationStep"].forEach((key) => {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      });
      clearRegistrationDraft("clientPhoneStep");
      sessionStorage.removeItem("taskpanda_onboarding_token");
      login(data.user, data.token, false);
      navigate("/dashboard", { replace: true });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout theme="primary">
      {(a) => (
        <>
          <section className="flex items-center justify-center bg-white px-6 pt-16 pb-6 lg:h-full sm:px-8 md:pt-20">
            <div className="w-full max-w-sm space-y-6">
              <div className="flex items-center">
                <Link to="/client-register/location" className="auth-back-link group inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-500" aria-label="Back to location">
                  <svg className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-1" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15.75 19.5L8.25 12l7.5-7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Back to location
                </Link>
              </div>

              <div className="space-y-1 text-center">
                <h2 className="text-2xl font-bold text-gray-900">What&apos;s your mobile number?</h2>
                <p className="text-sm text-gray-500">We will use this for bookings and coordination.</p>
              </div>

              <div className="flex justify-center gap-1.5" aria-label="Registration progress">
                {[1, 2, 3, 4].map((step) => <span key={step} className={`h-1.5 w-5 rounded-full ${step === 4 ? "bg-primary-600" : "bg-gray-200"}`} />)}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <PhilippineMobileInput
                  id="mobileNumber"
                  value={mobileNumber}
                  onChange={(value) => {
                    setMobileNumber(value);
                    saveRegistrationDraft("clientPhoneStep", { mobileNumber: value });
                  }}
                />
                {error && <p className="text-sm text-red-600" role="alert">{error} {error.toLowerCase().includes("sign in again") && <Link to="/login" className="font-semibold underline">Sign in again</Link>}</p>}
                <button type="submit" disabled={isSubmitting} className={`w-full rounded-lg bg-linear-to-r ${a.button} px-4 py-2.5 font-semibold text-white transition-opacity hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50`}>{isSubmitting ? "Finishing registration..." : "Complete Sign up"}</button>
              </form>
            </div>
          </section>
        </>
      )}
    </Layout>
  );
}
