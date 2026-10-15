import { useEffect, useRef, useState } from "react";

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

export default function TermsPrivacyModal({
  open,
  initialTab = "terms",
  onClose,
  onAgree,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setHasScrolledToBottom(false);
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }
  }, [open, initialTab]);

  if (!open) return null;

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setHasScrolledToBottom(false);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  };

  const handleScroll = () => {
    if (contentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      if (Math.abs(scrollHeight - clientHeight - scrollTop) <= 10) {
        setHasScrolledToBottom(true);
      }
    }
  };

  const sections = activeTab === "terms" ? termsSections : privacySections;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-privacy-title"
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 rounded-t-2xl border-b px-6 py-4">
          <div
            className="flex gap-1 rounded-xl bg-gray-100 p-1"
            role="tablist"
            aria-label="Legal documents"
          >
            <button
              id="terms-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "terms"}
              aria-controls="terms-privacy-content"
              onClick={() => handleTabChange("terms")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activeTab === "terms"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Terms of Service
            </button>
            <button
              id="privacy-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "privacy"}
              aria-controls="terms-privacy-content"
              onClick={() => handleTabChange("privacy")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activeTab === "privacy"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Privacy Policy
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
            aria-label="Close legal documents"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
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

        <div
          id="terms-privacy-content"
          ref={contentRef}
          onScroll={handleScroll}
          role="tabpanel"
          aria-labelledby={activeTab === "terms" ? "terms-tab" : "privacy-tab"}
          tabIndex={0}
          className="max-h-80 overflow-y-auto px-6 py-4"
        >
          <h2 id="terms-privacy-title" className="sr-only">
            {activeTab === "terms" ? "Terms of Service" : "Privacy Policy"}
          </h2>
          <div className="space-y-4">
            {sections.map((section) => (
              <section key={section.title}>
                <h3 className="text-sm font-bold text-gray-900">
                  {section.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">
                  {section.content}
                </p>
              </section>
            ))}
          </div>
        </div>

        <div className="rounded-b-2xl border-t px-6 py-4 text-center">
          {!hasScrolledToBottom && (
            <p className="mb-2 text-xs text-gray-500">
              Please scroll to the bottom to accept
            </p>
          )}
          <button
            type="button"
            disabled={!hasScrolledToBottom}
            onClick={onAgree}
            className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
