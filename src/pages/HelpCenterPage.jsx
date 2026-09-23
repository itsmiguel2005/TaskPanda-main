import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";

const faqs = [
  {
    q: "How do I book a service?",
    a: "Browse our services, select the one you need, choose a date and time, and confirm your booking. You'll receive a confirmation immediately.",
  },
  {
    q: "How are providers verified?",
    a: "All providers must submit valid TESDA certifications and valid IDs. Our team reviews each application before approving a profile.",
  },
  {
    q: "Can I cancel or reschedule a booking?",
    a: "Yes. Go to your Bookings page, select the booking, and choose Cancel or Reschedule. Please give at least 24 hours notice when possible.",
  },
  {
    q: "How do providers get paid?",
    a: "Providers receive payment within 24 hours after a completed booking. Payment is processed securely through our platform.",
  },
  {
    q: "What if I'm not satisfied with the work?",
    a: "Contact our support team within 48 hours. We'll assess the situation and work toward a resolution, including rebooking if needed.",
  },
  {
    q: "How do I leave a review?",
    a: "After a completed booking, you'll receive a notification to rate your experience and leave a review for the provider.",
  },
];

const categories = [
  { icon: "📅", title: "Bookings", desc: "Manage your appointments" },
  { icon: "💳", title: "Payments", desc: "Billing and refunds" },
  { icon: "👤", title: "Account", desc: "Profile and settings" },
  { icon: "💬", title: "Messages", desc: "Communication with providers" },
  { icon: "⭐", title: "Reviews", desc: "Ratings and feedback" },
  { icon: "🔒", title: "Security", desc: "Privacy and safety" },
];

export default function HelpCenterPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [openIndex, setOpenIndex] = useState(null);

  const filteredFaqs = faqs.filter(
    (f) =>
      f.q.toLowerCase().includes(search.toLowerCase()) ||
      f.a.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showNav={false} />

      {/* Hero */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            Help Center
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Find answers to common questions or get in touch with our
            support team.
          </p>

          <div className="mt-8">
            <div className="relative mx-auto max-w-xl">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search for answers..."
                className="w-full rounded-xl border border-gray-200 bg-white px-5 py-3.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                🔍
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Categories */}
      <section className="py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <div
                key={c.title}
                className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <span className="text-2xl">{c.icon}</span>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    {c.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {c.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-8 text-center text-3xl font-bold text-gray-900 sm:text-4xl">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {filteredFaqs.length > 0 ? (
              filteredFaqs.map((f, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setOpenIndex(openIndex === i ? null : i)
                    }
                    className="flex w-full items-center justify-between px-5 py-4 text-left"
                  >
                    <span className="text-sm font-semibold text-gray-900">
                      {f.q}
                    </span>
                    <span className="text-gray-400 transition-transform duration-200">
                      {openIndex === i ? "▲" : "▼"}
                    </span>
                  </button>
                  {openIndex === i && (
                    <div className="px-5 pb-4 text-sm leading-relaxed text-gray-600">
                      {f.a}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-gray-500">
                No results found. Try different keywords.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-gradient-to-r from-primary-600 to-teal-600 px-6 py-12 text-center sm:px-12 sm:py-16">
            <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
              Still Need Help?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-primary-100">
              Our support team is here to help. Reach out and we'll
              get back to you within 24 hours.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                onClick={() => navigate("/messages")}
                className="rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-primary-700 transition hover:bg-gray-100"
              >
                Contact Support
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
