import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import ProfessionSelector from "../components/ProfessionSelector.jsx";
import { readRegistrationDraft, saveRegistrationDraft } from "../utils/registrationDraft.js";

function getSavedProfessions() {
  const professionDraft = readRegistrationDraft("workerProfessionStep", {});
  if (Array.isArray(professionDraft.professions)) return professionDraft.professions;

  try {
    const legacyStep = sessionStorage.getItem("workerStep1") || localStorage.getItem("workerStep1");
    const professions = legacyStep ? JSON.parse(legacyStep).professions : null;
    return Array.isArray(professions) ? professions : [];
  } catch {
    return [];
  }
}

export default function WorkerRegisterProfession() {
  const navigate = useNavigate();
  const [professions, setProfessions] = useState(getSavedProfessions);
  const [error, setError] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    if (professions.length === 0) {
      setError("Select at least one profession or trade to continue.");
      return;
    }

    saveRegistrationDraft("workerProfessionStep", { professions });
    navigate("/worker-register/location", { viewTransition: true });
  };

  return (
    <Layout theme="green">
      {(a) => (
        <section className="flex items-center justify-center bg-white px-6 pt-16 pb-6 lg:h-full sm:px-8 md:pt-20">
          <div className="w-full max-w-sm space-y-6">
            <div className="flex items-center">
              <Link
                to="/worker-register/name"
                viewTransition
                className="auth-back-link group inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-500"
                aria-label="Back to name"
              >
                <svg className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-1" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15.75 19.5L8.25 12l7.5-7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back to name
              </Link>
            </div>

            <div className="space-y-1 text-center">
              <h2 className="text-2xl font-bold text-green-800">What work do you do?</h2>
              <p className="text-sm text-gray-500">Choose up to 3 professions or trades to show on your provider profile.</p>
            </div>

            <div className="flex justify-center gap-1.5" aria-label="Registration progress">
              {[1, 2, 3, 4, 5, 6].map((step) => (
                <span key={step} className={`h-1.5 w-5 rounded-full ${step === 3 ? "bg-green-600" : "bg-gray-200"}`} />
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="professions" className="block text-sm font-medium text-gray-700">Profession / Trade</label>
                <ProfessionSelector
                  value={professions}
                  onChange={(nextProfessions) => {
                    setProfessions(nextProfessions);
                    setError("");
                    saveRegistrationDraft("workerProfessionStep", { professions: nextProfessions });
                  }}
                  placeholder="e.g. Carpenter, Electrician, Plumber"
                  closeOnSelect
                />
                {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
              </div>

              <button type="submit" className={`w-full rounded-lg bg-linear-to-r ${a.button} px-4 py-2.5 font-semibold text-white`}>
                Next
              </button>
            </form>
          </div>
        </section>
      )}
    </Layout>
  );
}
