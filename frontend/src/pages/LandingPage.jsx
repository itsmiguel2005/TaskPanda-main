import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import { categories } from "../components/ClientDashboard.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const howItWorksClient = [
  {
    step: "01",
    title: "Search & compare",
    description:
      "Browse verified local pros by service, location, and rating before you book.",
    icon: "🔍",
  },
  {
    step: "02",
    title: "Request & negotiate",
    description:
      "Send a request, compare quotes, and use the counter-offer flow to stay protected and transparent.",
    icon: "💬",
  },
  {
    step: "03",
    title: "Book with confidence",
    description:
      "Secure the right professional for the job and track progress without the usual off-platform risk.",
    icon: "✅",
  },
];

const howItWorksProvider = [
  {
    step: "01",
    title: "Set up your profile",
    description:
      "Create your profile, list your skills, and highlight credentials like TESDA NC II, diplomas, or past work.",
    icon: "👤",
  },
  {
    step: "02",
    title: "Receive local requests",
    description:
      "Get matched with nearby jobs that suit your availability, expertise, and service area.",
    icon: "📬",
  },
  {
    step: "03",
    title: "Complete jobs securely",
    description:
      "Offer pricing, communicate clearly, and finish jobs with trust-building reviews and progress updates.",
    icon: "🎉",
  },
];

const stats = [
  { value: "500+", label: "Bookings completed" },
  { value: "4.9/5", label: "Average rating" },
  { value: "150+", label: "Verified pros" },
  { value: "24/7", label: "Local support" },
];

const trustHighlights = [
  {
    title: "Verified identity",
    description: "ID-verified clients and providers help reduce fraud and build trust before any booking begins.",
    icon: "🪪",
  },
  {
    title: "Professional credentials",
    description: "Showcase TESDA NC II, diplomas, and proven experience so homeowners can hire with confidence.",
    icon: "🎓",
  },
  {
    title: "Safer negotiation",
    description: "Structured quotes and counter-offers keep the process clear, fair, and away from risky off-platform deals.",
    icon: "🛡️",
  },
];

const categoryCards = [
  { name: "Aircon Repair", icon: "❄️", tone: "from-sky-50 to-blue-50 text-slate-700 border-sky-100" },
  { name: "Plumbing", icon: "🚿", tone: "from-cyan-50 to-sky-50 text-slate-700 border-sky-100" },
  { name: "Electrical", icon: "💡", tone: "from-blue-50 to-sky-50 text-slate-700 border-sky-100" },
  { name: "IT & Gadget Repair", icon: "🖥️", tone: "from-slate-50 to-cyan-50 text-slate-700 border-sky-100" },
];

const providers = [
  {
    name: "Johhny Cruz",
    trade: "Carpentry",
    cred: "TESDA NC II Carpenter",
    rating: 4.8,
    reviews: 24,
    price: "P500",
    color: "bg-sky-100 text-slate-700",
    banner: "from-slate-700 to-blue-700",
  },
  {
    name: "Maria Santos",
    trade: "Electrical",
    cred: "TESDA NC II Electrician",
    rating: 4.6,
    reviews: 18,
    price: "P450",
    color: "bg-blue-100 text-blue-700",
    banner: "from-blue-600 to-slate-700",
  },
  {
    name: "Pedro Cruz",
    trade: "Plumbing",
    cred: "TESDA NC II Plumbing",
    rating: 4.7,
    reviews: 31,
    price: "P400",
    color: "bg-sky-100 text-slate-700",
    banner: "from-slate-600 to-blue-700",
  },
];

function StarIcon({ filled }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-3.5 w-3.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { isVerified } = useAuth();
  const [howTab, setHowTab] = useState("client");
  const [showVerifyPrompt, setShowVerifyPrompt] = useState(false);

  const pricingSummary = [
    { label: "Aircon tune-up", value: "₱1,299" },
    { label: "Leak repair", value: "₱899" },
    { label: "Electrical check", value: "₱1,580" },
  ];

  return (
    <div className="min-h-screen bg-sky-50/60 pt-16 text-slate-900">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        :root {
          font-family: 'Plus Jakarta Sans', sans-serif;
        }
        @keyframes landingFadeUp {
          from { opacity: 0; transform: translate3d(0, 12px, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        .landing-enter {
          animation: landingFadeUp 560ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .landing-enter-1 { animation-delay: 70ms; }
        .landing-enter-2 { animation-delay: 140ms; }
        .landing-enter-3 { animation-delay: 210ms; }
        .landing-interactive {
          transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .landing-interactive:hover { transform: translateY(-1px) scale(1.02); }
        .landing-interactive:active { transform: scale(0.98); }
        @media (prefers-reduced-motion: reduce) {
          .landing-enter { animation: none; }
          .landing-interactive { transition: none; }
          .landing-interactive:hover,
          .landing-interactive:active { transform: none; }
        }
      `}</style>

      <Header showNav={false} />

      <main className="pb-20">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(186,230,253,0.42),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(207,250,254,0.36),_transparent_26%)]" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-10 py-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12 lg:py-16">
              <div className="max-w-xl">
                <div className="landing-enter inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                  <span>✨</span>
                  Trusted local home help
                </div>

                <h1 className="landing-enter landing-enter-1 mt-6 text-[clamp(2.8rem,4vw,5rem)] font-black leading-[0.96] tracking-[-0.07em] text-slate-900">
                  Find trusted local
                  <span className="block text-blue-600">
                    pros for your home
                  </span>
                </h1>

                <p className="landing-enter landing-enter-2 mt-5 max-w-lg text-base leading-8 text-slate-600 sm:text-lg">
                  TaskPanda connects homeowners with verified local specialists for repairs, upkeep, and everyday essentials—without the stress, guesswork, or risky off-platform deals.
                </p>

                <div className="landing-enter landing-enter-3 mt-7 rounded-[1.6rem] border border-sky-100 bg-white p-2.5 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
                  <div className="grid gap-2.5 lg:grid-cols-[1.2fr_1fr_auto]">
                    <div className="min-h-16 min-w-0 rounded-full border border-sky-100 bg-sky-50/60 px-4 py-2.5">
                      <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Service
                      </label>
                      <div className="mt-1 flex min-w-0 items-center gap-2 text-sm font-medium text-slate-900">
                        <span className="shrink-0">🔧</span>
                        <span className="truncate">Aircon Repair</span>
                      </div>
                    </div>

                    <div className="min-h-16 min-w-0 rounded-full border border-sky-100 bg-sky-50/60 px-4 py-2.5">
                      <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Location
                      </label>
                      <div className="mt-1 flex min-w-0 items-center gap-2 text-sm font-medium text-slate-900">
                        <span className="shrink-0">📍</span>
                        <span className="truncate">Pantal, Dagupan City</span>
                      </div>
                    </div>

                    <button
                      onClick={() => navigate("/login")}
                      className="landing-interactive flex min-h-16 items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600"
                    >
                      Explore
                    </button>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                  <div className="flex -space-x-2">
                    {[
                      { bg: "bg-sky-100 text-slate-700", letter: "J" },
                      { bg: "bg-blue-100 text-blue-700", letter: "M" },
                      { bg: "bg-sky-50 text-slate-700", letter: "A" },
                    ].map((avatar) => (
                      <div
                        key={avatar.letter}
                        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-xs font-bold shadow-sm ${avatar.bg}`}
                      >
                        {avatar.letter}
                      </div>
                    ))}
                  </div>
                  <span>
                    Trusted by <strong className="text-slate-900">2,000+</strong> homeowners
                  </span>
                </div>
              </div>

              <div className="relative">
                <div className="landing-enter landing-enter-2 relative overflow-hidden rounded-[2rem] border border-sky-100 bg-white p-5 shadow-[0_32px_90px_rgba(15,23,42,0.08)] sm:p-7">
                  <div className="absolute left-2 top-2 h-32 w-32 rounded-full bg-sky-100/70 blur-3xl" />
                  <div className="absolute bottom-0 right-0 h-40 w-40 rounded-full bg-cyan-100/70 blur-3xl" />

                  <div className="relative rounded-[1.5rem] border border-sky-100 bg-white p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Verified jobs nearby
                        </p>
                        <h2 className="mt-2 text-2xl font-black tracking-[-0.06em] text-slate-900">
                          18 this week
                        </h2>
                      </div>
                      <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-700">
                        Open
                      </span>
                    </div>

                    <div className="mt-6 rounded-[1.35rem] border border-sky-100 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-2xl">
                            🐼
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Panda match
                            </p>
                            <p className="text-base font-bold text-slate-900">
                              Trusted & ready
                            </p>
                          </div>
                        </div>
                        <div className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
                          96% match
                        </div>
                      </div>

                      <div className="mt-5 space-y-3">
                        {pricingSummary.map((item) => (
                          <div
                            key={item.label}
                            className="flex items-center justify-between rounded-2xl border border-sky-100 bg-sky-50/60 px-3 py-2.5"
                          >
                            <div>
                              <p className="text-xs text-slate-600">{item.label}</p>
                              <p className="text-sm font-semibold text-slate-900">{item.value}</p>
                            </div>
                            <span className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-700">
                              Ready
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-4 md:grid-cols-4">
              {stats.map((item, index) => (
                <div
                  key={item.label}
                  className="rounded-[1.5rem] border border-sky-100 bg-white px-4 py-5 text-center shadow-[0_8px_30px_rgba(15,23,42,0.05)]"
                  style={{ animationDelay: `${0.08 * index}s` }}
                >
                  <div className="text-3xl font-black tracking-[-0.06em] text-slate-900 sm:text-4xl">
                    {item.value}
                  </div>
                  <div className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Built for trust
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] text-slate-900 sm:text-4xl">
                Home service confidence from the first click
              </h2>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              {trustHighlights.map((item) => (
                <div
                  key={item.title}
                  className="rounded-[1.75rem] border border-sky-100 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-2xl shadow-sm">
                    {item.icon}
                  </div>
                  <h3 className="mt-5 text-xl font-bold tracking-[-0.04em] text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 flex flex-col gap-3 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Popular services
              </p>
              <h2 className="text-3xl font-black tracking-[-0.06em] text-slate-900 sm:text-4xl">
                Choose the job that needs attention
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {categoryCards.map((card) => (
                <button
                  key={card.name}
                  onClick={() => navigate(`/explore?service=${encodeURIComponent(card.name)}`)}
                  className={`landing-interactive rounded-[1.6rem] border bg-gradient-to-br p-5 text-left shadow-[0_16px_48px_rgba(15,23,42,0.05)] ${card.tone}`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 text-2xl shadow-sm">
                    {card.icon}
                  </div>
                  <div className="mt-5 text-lg font-bold text-slate-900">{card.name}</div>
                  <div className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    Book now
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                How it works
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] text-slate-900 sm:text-4xl">
                Clear steps, safer bookings, happier outcomes
              </h2>
            </div>

            <div className="mx-auto mb-8 inline-flex rounded-full border border-sky-100 bg-sky-50 p-1.5 shadow-sm">
              <button
                onClick={() => setHowTab("client")}
                className={`landing-interactive rounded-full px-4 py-2 text-sm font-semibold ${
                  howTab === "client"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                For homeowners
              </button>
              <button
                onClick={() => setHowTab("provider")}
                className={`landing-interactive rounded-full px-4 py-2 text-sm font-semibold ${
                  howTab === "provider"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                For providers
              </button>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              {(howTab === "client" ? howItWorksClient : howItWorksProvider).map((item) => (
                <div
                  key={item.title}
                  className="rounded-[1.8rem] border border-sky-100 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-2xl shadow-sm ring-1 ring-sky-100">
                    {item.icon}
                  </div>
                  <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    {item.step}
                  </div>
                  <h3 className="mt-3 text-xl font-bold tracking-[-0.04em] text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-8 lg:grid-cols-[1.02fr_0.98fr]">
              <div className="rounded-[2rem] border border-sky-100 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)] sm:p-7">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Negotiation flow
                    </p>
                    <h3 className="mt-2 text-2xl font-black tracking-[-0.06em] text-slate-900">
                      Transparent pricing, protected trust
                    </h3>
                  </div>
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">
                    Safe
                  </span>
                </div>

                <div className="mt-8 space-y-4">
                  {[
                    { label: "Initial request", value: "Client posts job" },
                    { label: "Local matches", value: "Verified pros respond" },
                    { label: "Counter-offer", value: "Price is negotiated on-platform" },
                    { label: "Booking complete", value: "Work begins with clear terms" },
                  ].map((step, index) => (
                    <div
                      key={step.label}
                      className="flex items-center gap-4 rounded-[1.3rem] border border-sky-100 bg-sky-50/60 px-4 py-3"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-slate-700">
                        {index + 1}
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {step.label}
                        </div>
                        <div className="text-sm font-semibold text-slate-900">{step.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Why homeowners keep coming back
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] text-slate-900 sm:text-4xl">
                  A better system for home services in the Philippines
                </h2>
                <ul className="mt-7 space-y-5 text-base text-slate-600">
                  {[
                    "Verified professionals with clear credentials and local accountability.",
                    "Protected conversations and fair pricing without risky cash-only arrangements.",
                    "Fast access to nearby experts for repairs, maintenance, and everyday home needs.",
                  ].map((point) => (
                    <li key={point} className="flex gap-3">
                      <span className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                        ✓
                      </span>
                      <span className="leading-7">{point}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => navigate("/register")}
                  className="landing-interactive mt-8 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Book a service
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pt-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl rounded-[2.2rem] bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-8 text-center shadow-[0_30px_90px_rgba(15,23,42,0.18)] sm:p-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-200">
              Ready when you are
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.06em] text-white sm:text-4xl">
              Book reliable help or grow your service business.
            </h2>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                onClick={() => navigate("/register")}
                className="landing-interactive rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-sky-50"
              >
                Book a service
              </button>
              <button
                onClick={() => navigate("/login")}
                className="landing-interactive rounded-full border border-white/30 bg-transparent px-6 py-3 text-sm font-semibold text-white hover:bg-white/5"
              >
                Sign up as a provider
              </button>
            </div>
          </div>
        </section>
      </main>

      {showVerifyPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowVerifyPrompt(false)}
        >
          <div
            className="w-full max-w-sm rounded-[2rem] bg-white p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sky-50 text-2xl">
              🪪
            </div>
            <h2 className="text-center text-2xl font-black tracking-[-0.06em] text-slate-900">
              Verification required
            </h2>
            <p className="mt-2 text-center text-sm leading-7 text-slate-600">
              You need to verify your identity before booking a trusted helper.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowVerifyPrompt(false);
                  navigate("/profile/verify");
                }}
                className="landing-interactive rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Verify now
              </button>
              <button
                onClick={() => setShowVerifyPrompt(false)}
                className="w-full text-center text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                Continue without verifying
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
