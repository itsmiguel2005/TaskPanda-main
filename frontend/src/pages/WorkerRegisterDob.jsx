import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";

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
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState("");
  const today = new Date();
  const maxDate = `${today.getFullYear() - 18}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isAdult(dateOfBirth)) {
      setError("You must be at least 18 years old to register as a provider.");
      return;
    }
    sessionStorage.setItem("workerDobStep", JSON.stringify({ dateOfBirth }));
    localStorage.setItem("workerDobStep", JSON.stringify({ dateOfBirth }));
    navigate("/worker-register/phone");
  };

  return (
    <Layout theme="green">
      {(a) => (
        <section className="flex items-center justify-center bg-white px-6 pt-16 pb-6 lg:h-full sm:px-8 md:pt-20">
          <div className="w-full max-w-sm space-y-6">
            <div className="flex items-center gap-2"><Link to="/worker-register/location" className="rounded-lg border border-green-200 bg-green-50 p-2 text-green-700" aria-label="Back to location">&larr;</Link><span className="text-sm font-medium text-gray-500">Back to location</span></div>
            <div className="space-y-1 text-center"><h2 className="text-2xl font-bold text-green-800">What&apos;s your date of birth?</h2><p className="text-sm text-gray-500">Providers must be 18 years old or above.</p></div>
            <div className="flex justify-center gap-1.5" aria-label="Registration progress">{[1, 2, 3, 4, 5].map((step) => <span key={step} className={`h-1.5 w-5 rounded-full ${step === 4 ? "bg-green-600" : "bg-gray-200"}`} />)}</div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2"><label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700">Date of Birth</label><input id="dateOfBirth" name="dateOfBirth" type="date" max={maxDate} value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} className="block w-full rounded-lg border border-green-200 bg-green-50/50 px-4 py-2.5 text-sm text-gray-800 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/30" /></div>
              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
              <button type="submit" className={`w-full rounded-lg bg-gradient-to-r ${a.button} px-4 py-2.5 font-semibold text-white`}>Next</button>
            </form>
          </div>
        </section>
      )}
    </Layout>
  );
}
