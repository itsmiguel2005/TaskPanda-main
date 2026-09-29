export default function ProfileSetupPanel({ user, role, onEdit }) {
  const requirements = [
    { label: "Profile photo", complete: Boolean(user?.profileImage?.trim()) },
    { label: "Full name", complete: Boolean(user?.fullName?.trim()) },
    { label: "Username", complete: Boolean(user?.username?.trim()) },
    { label: "Service location", complete: Boolean(user?.province && user?.city && user?.barangay) },
    { label: "Bio", complete: Boolean(user?.bio?.trim()) },
    ...(role === "provider" ? [{ label: "Services offered", complete: Boolean(user?.professions?.some((profession) => String(profession).trim())) }] : []),
  ];
  const completed = requirements.filter((requirement) => requirement.complete).length;
  const percentage = Math.round((completed / requirements.length) * 100);
  const isComplete = completed === requirements.length;
  if (isComplete) return null;
  const tone = role === "provider"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : "border-sky-200 bg-sky-50 text-sky-950";
  const accent = role === "provider" ? "bg-emerald-600" : "bg-sky-600";

  return (
    <section aria-labelledby="profile-setup-title" className={`mt-6 rounded-xl border p-5 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="profile-setup-title" className="text-base font-bold">
            Set up your profile
          </h2>
          <p className="mt-1 text-sm opacity-80">
            {completed} of {requirements.length} essentials complete
          </p>
        </div>
        <button type="button" onClick={onEdit} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
          Complete setup
        </button>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/80" role="progressbar" aria-label="Profile setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
        <div className={`h-full rounded-full transition-[width] ${accent}`} style={{ width: `${percentage}%` }} />
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {requirements.map((requirement) => (
          <li key={requirement.label} className={requirement.complete ? "font-medium" : "opacity-70"}>
            <span aria-hidden="true">{requirement.complete ? "✓" : "○"}</span> {requirement.label}
          </li>
        ))}
      </ul>
    </section>
  );
}