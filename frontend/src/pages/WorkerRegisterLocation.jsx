import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import PHLocationPicker from "../components/PHLocationPicker.jsx";

export default function WorkerRegisterLocation() {
  console.log("[WorkerRegisterLocation] MOUNTED");
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    provinceCode: "",
    cityCode: "",
    barangayCode: "",
    province: "",
    city: "",
    barangay: "",
    address: "",
  });
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (!formData.province || !formData.city || !formData.barangay) {
      setError("Please select your complete location.");
      return;
    }

    const step1Raw = sessionStorage.getItem("workerStep1") || localStorage.getItem("workerStep1");
    if (!step1Raw) {
      setError("Session expired. Please start registration again.");
      return;
    }

    let step1;
    try {
      step1 = JSON.parse(step1Raw);
    } catch (error) {
      setError("Registration data is invalid. Please start again.");
      return;
    }
    sessionStorage.setItem("workerLocationStep", JSON.stringify({
      province: formData.province,
      city: formData.city,
      barangay: formData.barangay,
      address: formData.address,
    }));
    localStorage.setItem("workerLocationStep", JSON.stringify({
      province: formData.province,
      city: formData.city,
      barangay: formData.barangay,
      address: formData.address,
    }));
    navigate("/worker-register/dob");
  };

  return (
    <Layout theme="green">
      {(a) => (
        <>
        <section className="flex items-center justify-center bg-white px-6 pt-16 pb-6 lg:h-full sm:px-8 md:pt-20">
          <div className="w-full max-w-sm space-y-6">
            <div className="flex items-center gap-2">
              <Link
                to="/worker-register/name"
                className="inline-flex items-center justify-center rounded-lg border border-green-200 bg-green-50 p-2 text-green-700 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500/40"
                aria-label="Back to name step"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M15.75 19.5L8.25 12l7.5-7.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <span className="text-sm font-medium text-gray-500">
                Back to name step
              </span>
            </div>

            <div className="space-y-1 text-center">
              <h2 className="font-bold text-2xl text-green-800">
                Where Are You Located?
              </h2>
              <p className="text-sm text-gray-500">
                Tell us your service area so we can match you with nearby clients.
              </p>
            </div>

            <div className="flex justify-center gap-1.5" aria-label="Registration progress">
              {[1, 2, 3, 4, 5].map((step) => (
                <span
                  key={step}
                  className={`h-1.5 w-5 rounded-full ${step === 3 ? "bg-green-600" : "bg-gray-200"}`}
                />
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <PHLocationPicker
                formData={formData}
                setFormData={setFormData}
                accent="green"
              />

              <div className="space-y-2">
                <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                  Street Address
                </label>
                <input
                  type="text"
                  id="address"
                  name="address"
                  autoComplete="street-address"
                  placeholder="Block, Lot, Unit (optional)"
                  value={formData.address}
                  onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                  className="block w-full rounded-lg border border-green-200 bg-green-50/50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400/70 transition-colors focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                className={`w-full rounded-lg bg-gradient-to-r ${a.button} py-2.5 px-4 font-semibold text-white transition-opacity hover:brightness-110 focus:outline-none focus:ring-2 ${a.buttonHover} focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Complete Sign up
              </button>
            </form>

            <div className="text-center text-sm text-gray-600">
              Already have an account?
              <Link to="/login" className={`font-medium ${a.link}`}>
                Log in here
              </Link>
            </div>
          </div>
        </section>
        </>
      )}
    </Layout>
  );
}
