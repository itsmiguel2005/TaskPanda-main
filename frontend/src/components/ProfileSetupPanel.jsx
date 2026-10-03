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
  const accent = "bg-blue-600";

  return (
    <section aria-labelledby="profile-setup-title" className="mt-5 border-t border-slate-100 pt-5 text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="profile-setup-title" className="text-base font-bold">
            Set up your profile
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {completed} of {requirements.length} essentials complete
          </p>
        </div>
        <button type="button" onClick={onEdit} className="dashboard-primary-button dashboard-focus rounded-lg px-4 py-2 text-sm">
          Complete setup
        </button>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/80" role="progressbar" aria-label="Profile setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
        <div className={`h-full rounded-full transition-[width] ${accent}`} style={{ width: `${percentage}%` }} />
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {requirements.map((requirement) => (
          <li key={requirement.label} className={`inline-flex items-center gap-1.5 ${requirement.complete ? "font-medium text-slate-700" : "text-slate-600"}`}>
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0">
              {requirement.complete
                ? <path d="m3.25 8.25 3 3 6.5-6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                : <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />}
            </svg>
            {requirement.label}
          </li>
        ))}
      </ul>
    </section>
  );
}