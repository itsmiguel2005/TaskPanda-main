import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { readRegistrationDraft, saveRegistrationDraft } from "../utils/registrationDraft.js";

function isAdult(dateValue) {
  if (!dateValue) return false;
  const birthDate = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const beforeBirthday = today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 18;
}

export default function WorkerRegisterDob() {
  const navigate = useNavigate();
  const [dateOfBirth, setDateOfBirth] = useState(() => readRegistrationDraft("workerDobStep", { dateOfBirth: "" }).dateOfBirth);
  const [error, setError] = useState("");
  const today = new Date();
  const maxDate = `${today.getFullYear() - 18}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isAdult(dateOfBirth)) {
      setError("You must be at least 18 years old to register as a provider.");
      return;
    }
    saveRegistrationDraft("workerDobStep", { dateOfBirth });
    navigate("/worker-register/phone");
  };

  return (
    <Layout theme="green">
      {(a) => (
        <section className="flex items-center justify-center bg-white px-6 pt-16 pb-6 lg:h-full sm:px-8 md:pt-20">
          <div className="w-full max-w-sm space-y-6">
            <div className="flex items-center"><Link to="/worker-register/location" className="auth-back-link group inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-500" aria-label="Back to location"><svg className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-1" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15.75 19.5L8.25 12l7.5 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>Back to location</Link></div>
            <div className="space-y-1 text-center"><h2 className="text-2xl font-bold text-green-800">What&apos;s your date of birth?</h2><p className="text-sm text-gray-500">Providers must be 18 years old or above.</p></div>
            <div className="flex justify-center gap-1.5" aria-label="Registration progress">{[1, 2, 3, 4, 5].map((step) => <span key={step} className={`h-1.5 w-5 rounded-full ${step === 4 ? "bg-green-600" : "bg-gray-200"}`} />)}</div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2"><label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700">Date of Birth</label><input id="dateOfBirth" name="dateOfBirth" type="date" max={maxDate} value={dateOfBirth} onChange={(event) => { const value = event.target.value; setDateOfBirth(value); saveRegistrationDraft("workerDobStep", { dateOfBirth: value }); }} className="block w-full rounded-lg border border-green-200 bg-green-50/50 px-4 py-2.5 text-sm text-gray-800 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/30" /></div>
              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
              <button type="submit" className={`w-full rounded-lg bg-linear-to-r ${a.button} px-4 py-2.5 font-semibold text-white`}>Next</button>
            </form>
          </div>
        </section>
      )}
    </Layout>
  );
}
