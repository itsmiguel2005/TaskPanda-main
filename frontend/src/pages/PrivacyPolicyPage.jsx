import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";

const sections = [
  {
    title: "1. Information We Collect",
    content:
      "We collect information you provide directly to us, such as your name, email address, phone number, and booking details. We also collect information about your interactions with our services, including IP address, device information, and usage data.",
  },
  {
    title: "2. How We Use Your Information",
    content:
      "We use the information we collect to provide and improve our services, process bookings, communicate with you, send updates, and ensure the safety and security of our platform.",
  },
  {
    title: "3. Information Sharing",
    content:
      "We do not sell your personal information. We share information only with service providers who assist in our operations, or when required by law.",
  },
  {
    title: "4. Data Security",
    content:
      "We implement appropriate security measures to protect your data. However, no online transmission is completely secure, and we cannot guarantee absolute security.",
  },
  {
    title: "5. Your Rights",
    content:
      "You have the right to access, update, or delete your personal information. Contact us at support@taskpanda.ph for any data requests.",
  },
  {
    title: "6. Cookies",
    content:
      "We use cookies to enhance your experience. You can manage cookie settings through your browser at any time.",
  },
  {
    title: "7. Changes to This Policy",
    content:
      "We may update this Privacy Policy from time to time. The updated version will be posted on this page with a revised effective date.",
  },
  {
    title: "8. Contact Us",
    content:
      "If you have any questions about this Privacy Policy, please contact us at support@taskpanda.ph or call +63 2 1234 5678.",
  },
];

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showNav={false} />

      {/* Hero */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Last updated: September 14, 2026
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-6 rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
          >
            ← Back to Home
          </button>
        </div>
      </section>

      {/* Content */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-8">
            {sections.map((s) => (
              <div key={s.title}>
                <h2 className="text-xl font-bold text-gray-900">
                  {s.title}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-gray-600">
                  {s.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
