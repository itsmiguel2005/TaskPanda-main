import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import PHLocationPicker from "../components/PHLocationPicker.jsx";
import { readRegistrationDraft, saveRegistrationDraft } from "../utils/registrationDraft.js";

export default function ClientRegisterLocation() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState(() => readRegistrationDraft("clientLocationStep", {
    provinceCode: "",
    cityCode: "",
    barangayCode: "",
    province: "",
    city: "",
    barangay: "",
    address: "",
    geoLocation: null,
  }));
  const [error, setError] = useState("");

  useEffect(() => {
    saveRegistrationDraft("clientLocationStep", formData);
  }, [formData]);
  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (!formData.province || !formData.city || !formData.barangay) {
      setError("Please select your complete location.");
      return;
    }

    const step1Raw = sessionStorage.getItem("clientStep1") || localStorage.getItem("clientStep1");
    const nameRaw = sessionStorage.getItem("clientNameStep") || localStorage.getItem("clientNameStep");
    if (!step1Raw || !nameRaw) {
      setError("Session expired. Please start registration again.");
      return;
    }

    try {
      JSON.parse(step1Raw);
      JSON.parse(nameRaw);
    } catch (error) {
      setError("Registration data is invalid. Please start again.");
      return;
    }
    sessionStorage.setItem("clientLocationStep", JSON.stringify(formData));
    localStorage.setItem("clientLocationStep", JSON.stringify(formData));
    navigate("/client-register/phone");
  };

  return (
    <Layout theme="primary">
      {(a) => (
        <>
        <section className="flex items-center justify-center bg-white px-6 pt-16 pb-6 lg:h-full sm:px-8 md:pt-20">
          <div className="w-full max-w-sm space-y-6">
            <div className="flex items-center">
              <Link to="/client-register/name" className="auth-back-link group inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-500" aria-label="Back to name">
                <svg className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-1" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15.75 19.5L8.25 12l7.5-7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back to name
              </Link>
            </div>

            <div className="space-y-1 text-center">
              <h2 className="font-bold text-2xl text-gray-900">
                Where are you located?
              </h2>
              <p className="text-sm text-gray-500">
                Tell us your address so we can match you with nearby providers.
              </p>
            </div>

            <div className="flex justify-center gap-1.5" aria-label="Registration progress">
              {[1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className={`h-1.5 w-5 rounded-full ${step === 3 ? "bg-primary-600" : "bg-gray-200"}`}
                />
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <PHLocationPicker
                formData={formData}
                setFormData={setFormData}
                accent="primary"
              />

              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className={`w-full rounded-lg bg-gradient-to-r ${a.button} py-2.5 px-4 font-semibold text-white transition-opacity hover:brightness-110 focus:outline-none focus:ring-2 ${a.buttonHover} focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Next
              </button>
            </form>

          </div>
        </section>
        </>
      )}
    </Layout>
  );
}
