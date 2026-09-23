import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";

export default function WorkerRegisterName() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ firstName: "", middleName: "", lastName: "" });
  const [error, setError] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();
    if (!firstName || !lastName) {
      setError("First name and last name are required.");
      return;
    }
    const data = { firstName, middleName: formData.middleName.trim(), lastName };
    sessionStorage.setItem("workerNameStep", JSON.stringify(data));
    localStorage.setItem("workerNameStep", JSON.stringify(data));
    navigate("/worker-register/location");
  };

  return (
    <Layout theme="green">
      {(a) => (
        <section className="flex items-center justify-center bg-white px-6 pt-16 pb-6 lg:h-full sm:px-8 md:pt-20">
          <div className="w-full max-w-sm space-y-6">
            <div className="flex items-center gap-2"><Link to="/worker-register" className="rounded-lg border border-green-200 bg-green-50 p-2 text-green-700" aria-label="Back to step 1">&larr;</Link><span className="text-sm font-medium text-gray-500">Back to step 1</span></div>
            <div className="space-y-1 text-center"><h2 className="text-2xl font-bold text-green-800">What&apos;s your name?</h2><p className="text-sm text-gray-500">Tell us your name for your provider profile.</p></div>
            <div className="flex justify-center gap-1.5" aria-label="Registration progress">{[1, 2, 3, 4, 5].map((step) => <span key={step} className={`h-1.5 w-5 rounded-full ${step === 2 ? "bg-green-600" : "bg-gray-200"}`} />)}</div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {[['firstName', 'First Name', 'Juan'], ['middleName', 'Middle Name (Optional)', 'Santos'], ['lastName', 'Last Name', 'Dela Cruz']].map(([name, label, placeholder]) => <div key={name} className="space-y-2"><label htmlFor={name} className="block text-sm font-medium text-gray-700">{label}</label><input id={name} name={name} type="text" required={name !== "middleName"} maxLength={80} placeholder={placeholder} value={formData[name]} onChange={(event) => setFormData((previous) => ({ ...previous, [name]: event.target.value }))} className="block w-full rounded-lg border border-green-200 bg-green-50/50 px-4 py-2.5 text-sm text-gray-800 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/30" /></div>)}
              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
              <button type="submit" className={`w-full rounded-lg bg-gradient-to-r ${a.button} px-4 py-2.5 font-semibold text-white`}>Next</button>
            </form>
          </div>
        </section>
      )}
    </Layout>
  );
}
