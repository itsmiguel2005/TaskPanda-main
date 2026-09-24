import { useState } from "react";

const termsSections = [
  {
    title: "1. Acceptance of Terms",
    content:
      "By accessing and using TaskPanda, you agree to be bound by these Terms of Service. If you do not agree to all parts, you may not use our services.",
  },
  {
    title: "2. User Accounts",
    content:
      "You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use of your account.",
  },
  {
    title: "3. Services",
    content:
      "TaskPanda provides a platform to connect clients with service providers. We do not perform the services ourselves. All bookings are arranged between users.",
  },
  {
    title: "4. Payment",
    content:
      "Payment terms are agreed upon directly between clients and providers. TaskPanda facilitates the connection but does not handle payment processing at this time.",
  },
  {
    title: "5. User Conduct",
    content:
      "Users agree to use the platform responsibly. Harassment, fraud, or illegal activity is prohibited and may result in account termination.",
  },
  {
    title: "6. Limitation of Liability",
    content:
      "TaskPanda is not liable for damages arising from interactions between users. We facilitate connections but do not guarantee outcomes.",
  },
  {
    title: "7. Termination",
    content:
      "We reserve the right to suspend or terminate accounts that violate these terms. Users may also delete their accounts at any time.",
  },
  {
    title: "8. Changes to Terms",
    content:
      "We may update these Terms of Service from time to time. Continued use of the platform after changes constitutes acceptance of the updated terms.",
  },
  {
    title: "9. Contact Us",
    content:
      "For questions about these terms, contact us at support@taskpanda.ph or call +63 2 1234 5678.",
  },
];

const privacySections = [
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

export default function TermsModal({ open, onClose }) {
  const [tab, setTab] = useState("terms");

  if (!open) return null;

  const sections = tab === "terms" ? termsSections : privacySections;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between rounded-t-2xl border-b px-6 py-4">
          <div className="flex gap-1">
            <button
              onClick={() => setTab("terms")}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                tab === "terms"
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              Terms of Service
            </button>
            <button
              onClick={() => setTab("privacy")}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                tab === "privacy"
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              Privacy Policy
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 focus:outline-none"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {sections.map((s) => (
              <div key={s.title}>
                <h3 className="text-sm font-bold text-gray-900">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">
                  {s.content}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="rounded-b-2xl border-t px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
