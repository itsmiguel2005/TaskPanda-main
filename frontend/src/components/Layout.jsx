import Header from "./Header.jsx";
import Mascot from "./Mascot.jsx";

const accentClasses = {
  primary: {
    body: "bg-gradient-to-tr from-primary-50 to-primary-100",
    button: "from-primary-600 to-primary-700",
    buttonHover: "focus:ring-primary-500/40",
    border: "border-primary-200",
    inputBg: "bg-primary-50/50",
    inputBorder: "border-primary-200",
    inputFocus: "focus:border-primary-500 focus:ring-primary-500/30",
    link: "text-primary-600 hover:text-primary-800",
    divider: "bg-gray-200",
  },
  green: {
    body: "bg-gradient-to-tr from-green-50 to-green-100",
    button: "from-green-600 to-green-700",
    buttonHover: "focus:ring-green-500/40",
    border: "border-green-200",
    inputBg: "bg-green-50/50",
    inputBorder: "border-green-200",
    inputFocus: "focus:border-green-500 focus:ring-green-500/30",
    link: "text-green-600 hover:text-green-800",
    divider: "bg-gray-200",
  },
};

export default function Layout({ theme = "primary", children }) {
  const a = accentClasses[theme];
  return (
    <div className="text-gray-800 antialiased">
      <Header logoColor={theme === "green" ? "text-green-700" : "text-primary-700"} />
      <main className="grid min-h-screen grid-cols-1 gap-6 lg:h-screen lg:grid-cols-[60%_40%] lg:gap-0">
        <section className={`${a.body} h-full min-h-0 flex flex-col items-center justify-end gap-6 overflow-visible px-6 pt-16 pb-0 text-center md:pt-20 lg:text-left lg:px-8 lg:pt-12 xl:gap-8 xl:pt-20`}>
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
          <Mascot />
        </section>
        {typeof children === "function" ? children(a) : children}
      </main>
    </div>
  );
}
