import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";

export default function ClientRegisterPhone() {
  const navigate = useNavigate();
  const [mobileNumber, setMobileNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!/^09\d{9}$/.test(mobileNumber)) {
      setError("Enter a valid 11-digit mobile number starting with 09.");
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit OTP.");
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
      const step1 = JSON.parse(step1Raw);
      const nameData = JSON.parse(nameRaw);
      const locationData = JSON.parse(locationRaw);
      const payload = {
        ...step1,
        ...nameData,
        ...locationData,
        fullName: [nameData.firstName, nameData.middleName, nameData.lastName].filter(Boolean).join(" "),
        mobileNumber,
        role: "client",
      };
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || "Registration failed. Please try again.");
        return;
      }
      ["clientStep1", "clientNameStep", "clientLocationStep"].forEach((key) => {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      });
      navigate("/login", { state: { registrationSuccess: true } });
    } catch {
      setError("Network error. Please try again.");
    }
  };

  return (
    <Layout theme="primary">
      {(a) => (
        <>
          <section className="flex items-center justify-center bg-white px-6 pt-16 pb-6 lg:h-full sm:px-8 md:pt-20">
            <div className="w-full max-w-sm space-y-6">
              <div className="flex items-center gap-2">
                <Link to="/client-register/location" className="inline-flex items-center justify-center rounded-lg border border-primary-200 bg-primary-50 p-2 text-primary-700 hover:bg-primary-100" aria-label="Back to step 3">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15.75 19.5L8.25 12l7.5-7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </Link>
                <span className="text-sm font-medium text-gray-500">Back to step 3</span>
              </div>

              <div className="space-y-1 text-center">
                <h2 className="text-2xl font-bold text-gray-900">What&apos;s your mobile number?</h2>
                <p className="text-sm text-gray-500">We will use this for bookings, verification, and coordination.</p>
              </div>

              <div className="flex justify-center gap-1.5" aria-label="Registration progress">
                {[1, 2, 3, 4].map((step) => <span key={step} className={`h-1.5 w-5 rounded-full ${step === 4 ? "bg-primary-600" : "bg-gray-200"}`} />)}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="mobileNumber" className="block text-sm font-medium text-gray-700">Mobile Number</label>
                  <input id="mobileNumber" name="mobileNumber" type="tel" inputMode="numeric" autoComplete="tel" placeholder="09XX XXX XXXX" value={mobileNumber} onChange={(event) => setMobileNumber(event.target.value.replace(/\D/g, "").slice(0, 11))} className="block w-full rounded-lg border border-primary-200 bg-primary-50/50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400/70 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="otp" className="block text-sm font-medium text-gray-700">OTP Code</label>
                  <input id="otp" name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="Enter 6-digit OTP" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} className="block w-full rounded-lg border border-primary-200 bg-primary-50/50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400/70 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                </div>

                {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
                <button type="submit" className={`w-full rounded-lg bg-gradient-to-r ${a.button} px-4 py-2.5 font-semibold text-white transition-opacity hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50`}>Complete Sign up</button>
              </form>
            </div>
          </section>
        </>
      )}
    </Layout>
  );
}
