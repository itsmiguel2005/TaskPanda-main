import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";

export default function ClientRegisterName() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
  });
  const [error, setError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();

    if (!firstName || !lastName) {
      setError("First name and last name are required.");
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
            <div className="flex items-center gap-2">
              <Link
                to="/client-register"
                className="inline-flex items-center justify-center rounded-lg border border-primary-200 bg-primary-50 p-2 text-primary-700 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                aria-label="Back to step 1"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15.75 19.5L8.25 12l7.5-7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <span className="text-sm font-medium text-gray-500">Back to step 1</span>
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
                    placeholder={placeholder}
                    value={formData[name]}
                    onChange={handleChange}
                    className="block w-full rounded-lg border border-primary-200 bg-primary-50/50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400/70 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                  />
                </div>
              ))}

              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

              <button type="submit" className={`w-full rounded-lg bg-gradient-to-r ${a.button} px-4 py-2.5 font-semibold text-white transition-opacity hover:brightness-110 focus:outline-none focus:ring-2 ${a.buttonHover} focus:ring-offset-2`}>
                Next
              </button>
            </form>
          </div>
        </section>
      )}
    </Layout>
  );
}
