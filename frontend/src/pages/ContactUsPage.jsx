import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";

const contactInfo = [
  { icon: "📧", label: "Email", value: "support@taskpanda.ph" },
  { icon: "📞", label: "Phone", value: "+63 2 1234 5678" },
  { icon: "📍", label: "Address", value: "Manila, Philippines" },
];

const socials = [
  { icon: "📘", label: "Facebook" },
  { icon: "📷", label: "Instagram" },
  { icon: "🐦", label: "Twitter" },
  { icon: "💼", label: "LinkedIn" },
];

export default function ContactUsPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showNav={false} />

      {/* Hero */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            Contact Us
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            We'd love to hear from you. Send us a message and we'll
            respond as soon as possible.
          </p>
        </div>
      </section>

      {/* Contact Info + Form */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-3">
            {/* Contact Info */}
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Get in Touch
              </h2>
              {contactInfo.map((c) => (
                <div key={c.label} className="flex items-center gap-4">
                  <span className="text-2xl">{c.icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">
                      {c.label}
                    </p>
                    <p className="text-sm font-medium text-gray-900">
                      {c.value}
                    </p>
                  </div>
                </div>
              ))}
              <div className="pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Follow Us
                </p>
                <div className="mt-3 flex gap-3">
                  {socials.map((s) => (
                    <a
                      key={s.label}
                      href="#"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg transition hover:bg-gray-100"
                      title={s.label}
                    >
                      {s.icon}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-2">
              {submitted ? (
                <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
                  <span className="text-4xl">✅</span>
                  <h3 className="mt-4 text-xl font-bold text-green-900">
                    Message Sent!
                  </h3>
                  <p className="mt-2 text-sm text-green-700">
                    Thank you for reaching out. We'll get back to you within 24 hours.
                  </p>
                  <button
                    onClick={() => navigate("/")}
                    className="mt-6 rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
                  >
                    Back to Home
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="space-y-5 rounded-xl border border-gray-100 bg-white p-8 shadow-sm"
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Name
                      </label>
                      <input
                        required
                        type="text"
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Email
                      </label>
                      <input
                        required
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        placeholder="your@email.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Subject
                    </label>
                    <input
                      required
                      type="text"
                      name="subject"
                      value={form.subject}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      placeholder="How can we help?"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Message
                    </label>
                    <textarea
                      required
                      name="message"
                      value={form.message}
                      onChange={handleChange}
                      rows={5}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      placeholder="Tell us more..."
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-xl bg-gray-900 px-7 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
                  >
                    Send Message
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
