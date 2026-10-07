import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { readRegistrationDraft, saveRegistrationDraft } from "../utils/registrationDraft.js";

const namePattern = /^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u;
const disallowedNameCharacters = /[^\p{L}\p{M} .'-]/gu;

export default function ClientRegisterName() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState(() => readRegistrationDraft("clientNameStep", {
    firstName: "",
    middleName: "",
    lastName: "",
  }));
  const [error, setError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    const updated = { ...formData, [name]: value.replace(disallowedNameCharacters, "") };
    setFormData(updated);
    saveRegistrationDraft("clientNameStep", updated);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();

    if (!firstName || !lastName) {
      setError("First name and last name are required.");
      return;
    }
    if (![firstName, formData.middleName.trim(), lastName].filter(Boolean).every((name) => namePattern.test(name))) {
      setError("Names may contain letters, spaces, apostrophes, hyphens, and periods only.");
      return;
    }
    if ([firstName, formData.middleName.trim(), lastName].filter(Boolean).join(" ").length > 100) {
      setError("Your full name must be 100 characters or fewer.");
      return;
    }

    const nameData = {
      firstName,
      middleName: formData.middleName.trim(),
      lastName,
    };
    sessionStorage.setItem("clientNameStep", JSON.stringify(nameData));
    localStorage.setItem("clientNameStep", JSON.stringify(nameData));
    navigate("/client-register/location");
  };

  return (
    <Layout theme="primary">
      {(a) => (
        <section className="flex items-center justify-center bg-white px-6 pt-16 pb-6 lg:h-full sm:px-8 md:pt-20">
          <div className="w-full max-w-sm space-y-6">
            <div className="flex items-center">
              <Link to="/login" className="auth-back-link group inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-500" aria-label="Back to sign in">
                <svg className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-1" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15.75 19.5L8.25 12l7.5-7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back to sign in
              </Link>
            </div>

            <div className="space-y-1 text-center">
              <h2 className="text-2xl font-bold text-gray-900">What&apos;s your name?</h2>
              <p className="text-sm text-gray-500">Tell us your name so we can personalize your account.</p>
            </div>

            <div className="flex justify-center gap-1.5" aria-label="Registration progress">
              {[1, 2, 3, 4].map((step) => (
                <span key={step} className={`h-1.5 w-5 rounded-full ${step === 2 ? "bg-primary-600" : "bg-gray-200"}`} />
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                ["firstName", "First Name", "Juan"],
                ["middleName", "Middle Name (Optional)", "Santos"],
                ["lastName", "Last Name", "Dela Cruz"],
              ].map(([name, label, placeholder]) => (
                <div key={name} className="space-y-2">
                  <label htmlFor={name} className="block text-sm font-medium text-gray-700">{label}</label>
                  <input
                    id={name}
                    name={name}
                    type="text"
                    required={name !== "middleName"}
                    maxLength={80}
                    placeholder={placeholder}
                    value={formData[name]}
                    onChange={handleChange}
                    className="block w-full rounded-lg border border-primary-200 bg-primary-50/50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400/70 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                  />
                </div>
              ))}

              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

              <button type="submit" className={`w-full rounded-lg bg-linear-to-r ${a.button} px-4 py-2.5 font-semibold text-white transition-opacity hover:brightness-110 focus:outline-none focus:ring-2 ${a.buttonHover} focus:ring-offset-2`}>
                Next
              </button>
            </form>
          </div>
        </section>
      )}
    </Layout>
  );
}
