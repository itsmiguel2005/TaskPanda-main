import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";

const openings = [
  {
    title: "Customer Support Specialist",
    location: "Manila, Philippines",
    type: "Full-time",
    icon: "🎧",
  },
  {
    title: "Marketing Coordinator",
    location: "Manila, Philippines",
    type: "Full-time",
    icon: "📢",
  },
  {
    title: "Full Stack Developer",
    location: "Remote",
    type: "Full-time",
    icon: "💻",
  },
  {
    title: "Quality Assurance Analyst",
    location: "Manila, Philippines",
    type: "Full-time",
    icon: "🔍",
  },
];

const benefits = [
  "Health and dental insurance",
  "Flexible work arrangements",
  "Professional development budget",
  "Paid time off",
  "Performance bonuses",
  "Team outings and events",
];

export default function CareersPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showNav={false} />

      {/* Hero */}
      <section className="relative overflow-hidden bg-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Join Our Team
            </h1>
            <p className="mt-6 text-lg text-gray-600">
              Help us build the future of home services. We're always
              looking for talented people who share our passion for
              quality and trust.
            </p>
          </div>
        </div>
      </section>

      {/* Openings */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Open Positions
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {openings.map((job) => (
              <div
                key={job.title}
                className="flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm transition hover:shadow-md"
              >
                <span className="text-3xl">{job.icon}</span>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900">
                    {job.title}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                      {job.location}
                    </span>
                    <span className="rounded-full bg-primary-50 px-3 py-1 text-xs text-primary-700">
                      {job.type}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => navigate("/register")}
                  className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-gray-800"
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
                Why Work With Us
              </h2>
              <p className="mt-4 text-gray-600">
                We believe in taking care of our team so they can take
                care of our community.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {benefits.map((b) => (
                <div
                  key={b}
                  className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3"
                >
                  <span className="text-green-500">✓</span>
                  <span className="text-sm text-gray-700">{b}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-gradient-to-r from-primary-600 to-teal-600 px-6 py-12 text-center sm:px-12 sm:py-16">
            <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
              Don't See Your Role?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-primary-100">
              We're always looking for great people. Send us your resume
              and we'll keep you in mind.
            </p>
            <div className="mt-8">
              <button
                onClick={() => navigate("/register")}
                className="rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-primary-700 transition hover:bg-gray-100"
              >
                Get in Touch
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
