export default function BambooStamp({ filled }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={`h-6 w-6 ${filled ? "text-amber-600" : "text-slate-300"}`}>
      <path d="M16 26c0-6.5.2-12.5 0-19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 17c-5.8.2-9.2-2.8-9.1-7.8 5.4-.2 8.6 2.5 9.1 7.8Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M16 12c.3-4.5 3.2-7 8-6.8.1 4.7-2.7 7-8 6.8Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      {filled && <path d="M13 15 9 11m8-2 4-3" stroke="white" strokeOpacity=".78" strokeWidth="1" strokeLinecap="round" />}
    </svg>
  );
}
