import Header from "./Header.jsx";
import Mascot from "./Mascot.jsx";

const accentClasses = {
  primary: {
    body: "bg-gradient-to-br from-sky-50 via-cyan-50/60 to-white",
    button: "from-primary-600 to-primary-700",
    buttonHover: "focus:ring-primary-500/40",
    border: "border-slate-200",
    inputBg: "bg-white",
    inputBorder: "border-slate-200",
    inputFocus: "focus:border-primary-500 focus:ring-primary-500/30",
    link: "text-primary-600 hover:text-primary-800",
    divider: "bg-gray-200",
  },
  green: {
    body: "bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white",
    button: "from-green-600 to-green-700",
    buttonHover: "focus:ring-green-500/40",
    border: "border-slate-200",
    inputBg: "bg-white",
    inputBorder: "border-slate-200",
    inputFocus: "focus:border-green-500 focus:ring-green-500/30",
    link: "text-green-600 hover:text-green-800",
    divider: "bg-gray-200",
  },
};

export default function Layout({ theme = "primary", children }) {
  const a = accentClasses[theme];
  return (
    <div className="auth-shell bg-white text-gray-800 antialiased">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        .auth-shell { font-family: 'Plus Jakarta Sans', sans-serif; }
        .auth-main[data-theme="primary"] { --auth-ring: rgba(2, 132, 199, 0.28); }
        .auth-main[data-theme="green"] { --auth-ring: rgba(5, 150, 105, 0.28); }
        .auth-form-area input:not([type="checkbox"]):not(.auth-inline-field),
        .auth-form-area select,
        .auth-form-area textarea {
          box-sizing: border-box;
          min-width: 0;
          height: 2.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          background-color: #fff;
          font-family: inherit;
        }
        .auth-form-area input:not([type="checkbox"]):not(.auth-inline-field):focus,
        .auth-form-area select:focus,
        .auth-form-area textarea:focus {
          outline: 2px solid var(--auth-ring);
          outline-offset: 2px;
        }
        .auth-form-area a:not(.auth-back-link),
        .auth-form-area button:not(.auth-back-link) {
          transition: all 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .auth-form-area a:not(.auth-back-link):hover,
        .auth-form-area button:not(.auth-back-link):not(:disabled):hover {
          transform: scale(1.01);
        }
        .auth-form-area a:not(.auth-back-link):active,
        .auth-form-area button:not(.auth-back-link):not(:disabled):active {
          transform: scale(0.99);
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-form-area a:not(.auth-back-link),
          .auth-form-area button:not(.auth-back-link) { transition: none; }
          .auth-form-area a:not(.auth-back-link):hover,
          .auth-form-area a:not(.auth-back-link):active,
          .auth-form-area button:not(.auth-back-link):hover,
          .auth-form-area button:not(.auth-back-link):active { transform: none; }
          .auth-form-area .auth-back-link { transition: none; }
          .auth-form-area .auth-back-link:hover,
          .auth-form-area .auth-back-link:hover svg { transform: none; }
        }
      `}</style>
      <Header logoColor={theme === "green" ? "text-emerald-700" : "text-sky-700"} />
      <main className="auth-main grid min-h-screen grid-cols-1 gap-6 bg-white lg:h-screen lg:grid-cols-2 lg:gap-0" data-theme={theme}>
        <section className={`relative isolate ${a.body} h-full min-h-0 flex flex-col items-center justify-end gap-6 overflow-hidden px-6 pt-16 pb-0 text-center md:pt-20 lg:text-left lg:px-8 lg:pt-12 xl:gap-8 xl:pt-20`}>
          <div className="mb-10 lg:mb-12">
            <h1
              className="font-extrabold leading-tight tracking-tight text-gray-900 text-3xl sm:text-4xl md:text-5xl xl:text-6xl"
            >
              Connect with skilled<br className="hidden sm:block" />local tradespeople
            </h1>
            <p className="mt-6 max-w-md text-lg/relaxed text-gray-600 md:text-xl">
              TaskPanda bridges local homeowners and independent mechanics,
              plumbers, electricians, etc. with AI-quick matching.
            </p>
          </div>
          <Mascot theme={theme} />
        </section>
        <div className="auth-form-area h-full min-w-0 bg-white">
          {typeof children === "function" ? children(a) : children}
        </div>
      </main>
    </div>
  );
}
