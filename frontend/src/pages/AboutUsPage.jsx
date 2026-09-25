import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";

const stats = [
  { value: "2,000+", label: "Happy Homeowners" },
  { value: "150+", label: "Verified Pros" },
  { value: "500+", label: "Jobs Completed" },
  { value: "4.9", label: "Average Rating" },
];

const values = [
  {
    icon: "🤝",
    title: "Trust First",
    description:
      "Every professional is vetted and verified so homeowners book with confidence, and pros build credibility.",
  },
  {
    icon: "⚡",
    title: "Fast Matching",
    description:
      "Our AI-powered system connects homeowners with the right pro in minutes, giving providers instant access to job requests.",
  },
  {
    icon: "💎",
    title: "Quality Work",
    description:
      "We only work with TESDA-certified tradespeople who deliver quality results on every job.",
  },
  {
    icon: "💰",
    title: "Fair Earnings",
    description:
      "Providers set competitive rates and get paid promptly for every completed booking.",
  },
  {
    icon: "📋",
    title: "Steady Work",
    description:
      "Providers receive a consistent flow of job requests matched to their skills and location.",
  },
  {
    icon: "⭐",
    title: "Verified Reviews",
    description:
      "Real feedback from both sides helps the community make better choices and maintain high standards.",
  },
];

export default function AboutUsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showNav={false} />

      {/* Hero */}
      <section className="relative overflow-hidden bg-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              About TaskPanda
            </h1>
            <p className="mt-6 text-lg text-gray-600">
              We connect homeowners with trusted local tradespeople. Our
              mission is to make finding reliable home services fast,
              transparent, and hassle-free.
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-center"
              >
                <div className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
                  {s.value}
                </div>
                <div className="mt-1 text-xs text-gray-500 sm:text-sm">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Our Values
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {values.map((v) => (
              <div
                key={v.title}
                className="rounded-xl border border-gray-100 bg-white p-8 shadow-sm transition hover:shadow-md"
              >
                <span className="text-4xl">{v.icon}</span>
                <h3 className="mt-4 text-xl font-bold text-gray-900">
                  {v.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  {v.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-gradient-to-r from-primary-600 to-teal-600 px-6 py-12 text-center sm:px-12 sm:py-16">
            <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
              Ready to get started?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-primary-100">
              Join thousands of homeowners who trust TaskPanda for their
              home service needs.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                onClick={() => navigate("/register")}
                className="rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-primary-700 transition hover:bg-gray-100"
              >
                Create Free Account
              </button>
              <button
                onClick={() => navigate("/explore")}
                className="rounded-xl border border-white/30 bg-white/10 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                Explore Services
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
