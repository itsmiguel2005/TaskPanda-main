export default function Mascot({ theme = "primary" }) {
  const glow = theme === "green"
    ? "from-emerald-200/45 to-teal-100/10"
    : "from-sky-200/45 to-cyan-100/10";
  const border = theme === "green" ? "border-emerald-200" : "border-sky-200";

  return (
    <div className={`relative flex h-72 w-56 shrink-0 items-center justify-center overflow-hidden border-b-4 sm:h-80 sm:w-64 ${border}`}>
      <div className={`absolute inset-x-4 top-8 bottom-8 rounded-full bg-gradient-to-br blur-2xl ${glow}`} aria-hidden="true" />
      <img
        src="/assets/Panda Cropped.png"
        alt="TaskPanda mascot"
        className="relative z-10 h-72 w-auto sm:h-80"
      />
    </div>
  );
}
