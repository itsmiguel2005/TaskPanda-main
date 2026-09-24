import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import RoleCard from "../components/RoleCard.jsx";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBack = () => {
    const origin = sessionStorage.getItem("registerOrigin");
    if (origin === "login") {
      sessionStorage.removeItem("registerOrigin");
      navigate("/login");
      return;
    }

    sessionStorage.removeItem("registerOrigin");
    navigate("/");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("[RegisterPage] handleSubmit, selectedRole:", selectedRole);
    if (!selectedRole) return;

    if (selectedRole === "client") {
      console.log("[RegisterPage] navigating to /client-register");
      navigate("/client-register");
      return;
    }

    if (selectedRole === "provider") {
      console.log("[RegisterPage] navigating to /worker-register");
      navigate("/worker-register");
      return;
    }
  };

  return (
    <Layout theme="primary">
      {(a) => (
        <section className="flex items-center justify-center bg-white px-6 pt-16 pb-6 lg:h-full sm:px-8 md:pt-20">
          <div className="w-full max-w-sm space-y-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center justify-center rounded-lg border border-primary-200 bg-primary-50 p-2 text-primary-700 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                aria-label="Back"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M15.75 19.5L8.25 12l7.5-7.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <span className="text-sm font-medium text-gray-500">
                {sessionStorage.getItem("registerOrigin") === "login" ? "Back to login" : "Back to home"}
              </span>
            </div>

            <div className="space-y-1 text-center">
              <h2 className="font-bold text-2xl text-gray-900">I want to</h2>
              <p className="text-sm text-gray-600">
                Choose how you'll use TaskPanda. You can switch or add a
                provider account later in settings.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <fieldset className="space-y-3">
                <legend className="sr-only">Choose your account type</legend>

                <RoleCard
                  value="client"
                  selected={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  label="Hire a Skilled Worker"
                  description="Find and hire local mechanics, plumbers, electricians, and more for your home projects."
                  color="primary"
                />

                <RoleCard
                  value="provider"
                  selected={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  label="Work as a Provider"
                  description="Offer your professional trade services and connect with local homeowners looking for help."
                  color="green"
                />
              </fieldset>

              <button
                type="submit"
                disabled={!selectedRole || isSubmitting}
                className={`w-full rounded-lg bg-gradient-to-r ${a.button} py-2.5 px-4 font-semibold text-white transition-opacity hover:brightness-110 focus:outline-none focus:ring-2 ${a.buttonHover} focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isSubmitting ? "Processing..." : "Next"}
              </button>
            </form>

            <div className="text-center text-sm text-gray-600">
              Already registered?
              <Link to="/login" className={`font-medium ${a.link}`}>
                Log in here
              </Link>
            </div>
          </div>
        </section>
      )}
    </Layout>
  );
}
