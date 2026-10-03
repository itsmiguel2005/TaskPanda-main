import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { adminRequest } from "../services/adminApi.js";

const DEFAULT_SETTINGS = {
  maxTravelDistanceKm: 50,
  travelBaseFee: 20,
  travelFeePerKm: 10,
  maintenanceMode: false,
};

const BROADCAST_TEMPLATES = [
  {
    id: "scheduled-maintenance",
    title: "Scheduled maintenance",
    message: "TaskPanda will undergo scheduled maintenance. Some features may be temporarily unavailable. Please check back soon for updates.",
  },
  {
    id: "service-interruption",
    title: "Service interruption",
    message: "We’re currently addressing a service interruption affecting TaskPanda. We apologize for the inconvenience and will share updates as soon as we can.",
  },
  {
    id: "severe-weather",
    title: "Weather and safety advisory",
    message: "Severe weather may affect travel and scheduled services. Please prioritize your safety and contact the other party through TaskPanda if plans need to change.",
  },
  {
    id: "booking-update",
    title: "Booking availability update",
    message: "There may be delays in booking responses while we work through current requests. Thank you for your patience and for keeping your booking details up to date.",
  },
  {
    id: "payment-reminder",
    title: "Payment safety reminder",
    message: "Please confirm payment details only through your TaskPanda booking. Never share passwords or verification codes with anyone.",
  },
  {
    id: "security-advisory",
    title: "Account security advisory",
    message: "For your security, use a unique password and never share your sign-in or verification codes. Contact TaskPanda support if you notice unusual account activity.",
  },
];

function AdminSystemSettings() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [savedSettings, setSavedSettings] = useState(null);
  const [draft, setDraft] = useState(DEFAULT_SETTINGS);
  const [broadcastConfigured, setBroadcastConfigured] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastTemplateSearch, setBroadcastTemplateSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!token) {
      logout();
      navigate("/login", { replace: true });
      return undefined;
    }
    const controller = new AbortController();
    setIsLoading(true);
    setError("");
    adminRequest("/api/admin/settings", token, { signal: controller.signal })
      .then((result) => {
        setSavedSettings(result.settings);
        setDraft({
          maxTravelDistanceKm: result.settings.maxTravelDistanceKm,
          travelBaseFee: result.settings.travelBaseFee,
          travelFeePerKm: result.settings.travelFeePerKm,
          maintenanceMode: result.settings.maintenanceMode,
        });
        setBroadcastConfigured(result.broadcastConfigured === true);
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        if (requestError.status === 401) {
          logout();
          navigate("/login", { replace: true });
          return;
        }
        setError(requestError.message || "Could not load global settings.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [logout, navigate, refreshKey, token]);

  const hasChanges = savedSettings && (
    Number(draft.maxTravelDistanceKm) !== Number(savedSettings.maxTravelDistanceKm)
    || Number(draft.travelBaseFee) !== Number(savedSettings.travelBaseFee)
    || Number(draft.travelFeePerKm) !== Number(savedSettings.travelFeePerKm)
    || draft.maintenanceMode !== savedSettings.maintenanceMode
  );

  const filteredBroadcastTemplates = BROADCAST_TEMPLATES.filter((template) => (
    `${template.title} ${template.message}`.toLowerCase().includes(broadcastTemplateSearch.trim().toLowerCase())
  ));
  const selectedBroadcastTemplate = BROADCAST_TEMPLATES.find((template) => (
    template.title === broadcastTitle && template.message === broadcastMessage
  ));

  const selectBroadcastTemplate = (template) => {
    setBroadcastTitle(template.title);
    setBroadcastMessage(template.message);
    setBroadcastTemplateSearch("");
    setError("");
    setNotice("");
  };

  const updateDraft = (key, value) => {
    setNotice("");
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await adminRequest("/api/admin/settings", token, {
        method: "PATCH",
        body: JSON.stringify({
          maxTravelDistanceKm: Number(draft.maxTravelDistanceKm),
          travelBaseFee: Number(draft.travelBaseFee),
          travelFeePerKm: Number(draft.travelFeePerKm),
          maintenanceMode: draft.maintenanceMode,
        }),
      });
      setSavedSettings(result.settings);
      setDraft({
        maxTravelDistanceKm: result.settings.maxTravelDistanceKm,
        travelBaseFee: result.settings.travelBaseFee,
        travelFeePerKm: result.settings.travelFeePerKm,
        maintenanceMode: result.settings.maintenanceMode,
      });
      setNotice(result.message || "Global settings saved.");
    } catch (requestError) {
      if (requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(requestError.message || "Could not save global settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const sendBroadcast = async (event) => {
    event.preventDefault();
    if (!window.confirm("Send this urgent notification to all clients and providers now?")) return;
    setIsBroadcasting(true);
    setError("");
    setNotice("");
    try {
      const result = await adminRequest("/api/admin/broadcast", token, {
        method: "POST",
        body: JSON.stringify({ title: broadcastTitle.trim(), message: broadcastMessage.trim() }),
      });
      setBroadcastTitle("");
      setBroadcastMessage("");
      setNotice(result.message || "Urgent broadcast sent.");
    } catch (requestError) {
      if (requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(requestError.message || "Could not send the urgent broadcast.");
    } finally {
      setIsBroadcasting(false);
    }
  };

  return (
    <section aria-labelledby="admin-settings-title" className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="admin-settings-title" className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Global system settings</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">Control travel pricing, service distance, booking availability, and urgent platform alerts.</p>
        </div>
        {savedSettings?.updatedAt && <p className="text-xs text-slate-600">Last saved {new Date(savedSettings.updatedAt).toLocaleString("en-PH")}</p>}
      </header>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span>{error}</span><button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="dashboard-focus rounded-lg px-2 py-1 font-semibold underline underline-offset-2">Reload settings</button></div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{notice}</div>}

      <form onSubmit={saveSettings} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
          <h2 className="text-sm font-bold text-slate-950">Travel pricing & service range</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">New quotes use the base fare plus the per-kilometer rate across the full provider distance. Existing bookings keep their original quote.</p>
        </div>
        <div className="grid gap-4 px-4 py-5 sm:grid-cols-3 sm:px-5">
          <label className="block text-sm font-semibold text-slate-800">
            Maximum travel distance
            <span className="relative mt-1.5 block">
              <input type="number" min="1" max="500" step="0.1" required value={draft.maxTravelDistanceKm} onChange={(event) => updateDraft("maxTravelDistanceKm", event.target.value)} disabled={isLoading || isSaving} aria-describedby="travel-distance-help" className="dashboard-focus h-11 w-full rounded-xl border border-slate-300 bg-white pl-3 pr-14 text-sm font-medium tabular-nums text-slate-950 disabled:bg-slate-50" />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-600">km</span>
            </span>
            <span id="travel-distance-help" className="mt-1.5 block text-xs font-normal leading-5 text-slate-600">Requests beyond this distance are declined before booking.</span>
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Travel fee baseline
            <span className="relative mt-1.5 block">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-medium text-slate-600">₱</span>
              <input type="number" min="0" max="100000" step="0.01" required value={draft.travelBaseFee} onChange={(event) => updateDraft("travelBaseFee", event.target.value)} disabled={isLoading || isSaving} aria-describedby="travel-base-help" className="dashboard-focus h-11 w-full rounded-xl border border-slate-300 bg-white pl-8 pr-3 text-sm font-medium tabular-nums text-slate-950 disabled:bg-slate-50" />
            </span>
            <span id="travel-base-help" className="mt-1.5 block text-xs font-normal leading-5 text-slate-600">Added once to each travel quote.</span>
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Per-kilometer rate
            <span className="relative mt-1.5 block">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-medium text-slate-600">₱</span>
              <input type="number" min="0" max="100000" step="0.01" required value={draft.travelFeePerKm} onChange={(event) => updateDraft("travelFeePerKm", event.target.value)} disabled={isLoading || isSaving} aria-describedby="travel-km-help" className="dashboard-focus h-11 w-full rounded-xl border border-slate-300 bg-white pl-8 pr-14 text-sm font-medium tabular-nums text-slate-950 disabled:bg-slate-50" />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-600">/ km</span>
            </span>
            <span id="travel-km-help" className="mt-1.5 block text-xs font-normal leading-5 text-slate-600">Applied to every kilometer travelled.</span>
          </label>
        </div>

        <div className={`flex flex-wrap items-center justify-between gap-4 border-t px-4 py-4 sm:px-5 ${draft.maintenanceMode ? "border-amber-200 bg-amber-50/70" : "border-slate-200 bg-slate-50/70"}`}>
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-slate-900">Pause new bookings</p>
            <p className="mt-1 text-xs leading-5 text-slate-700">Maintenance mode leaves browsing and existing bookings available, but prevents clients from submitting new requests.</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-3">
            <span className={`text-xs font-semibold ${draft.maintenanceMode ? "text-amber-900" : "text-slate-700"}`}>{draft.maintenanceMode ? "Enabled" : "Disabled"}</span>
            <input type="checkbox" role="switch" checked={draft.maintenanceMode} onChange={(event) => updateDraft("maintenanceMode", event.target.checked)} disabled={isLoading || isSaving} className="peer sr-only" aria-label="Pause new bookings" />
            <span aria-hidden="true" className="relative h-6 w-11 rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-amber-700 peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-50" />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 sm:px-5">
          <p className="text-xs text-slate-600">{isLoading ? "Loading saved configuration…" : savedSettings ? `Updated by ${savedSettings.updatedBy || "system defaults"}` : "Could not read current settings."}</p>
          <button type="submit" disabled={isLoading || isSaving || !hasChanges} className="dashboard-focus inline-flex h-10 items-center justify-center rounded-xl bg-blue-800 px-4 text-sm font-semibold text-white transition hover:bg-blue-900 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-900">{isSaving ? "Saving…" : "Save settings"}</button>
        </div>
      </form>

      <form onSubmit={sendBroadcast} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
          <h2 className="text-sm font-bold text-slate-950">Urgent broadcast</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">Post an alert to the in-app notification bell for every client and provider. Browser push is sent when OneSignal is available.</p>
        </div>
        <div className="grid gap-4 px-4 py-5 sm:px-5">
          <fieldset disabled={isBroadcasting} className="min-w-0 space-y-3 disabled:opacity-70">
            <legend className="text-sm font-semibold text-slate-800">Choose a ready-made announcement</legend>
            <p className="text-xs leading-5 text-slate-600">Search and select one to fill in the title and message. You can edit either field before sending.</p>
            <label className="relative block">
              <span className="sr-only">Search announcement templates</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="6.8" />
                <path d="m16 16 4.5 4.5" />
              </svg>
              <input
                type="search"
                value={broadcastTemplateSearch}
                onChange={(event) => setBroadcastTemplateSearch(event.target.value)}
                aria-label="Search announcement templates"
                className="dashboard-focus h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm font-normal text-slate-950 placeholder:text-slate-500"
                placeholder="Search maintenance, weather, booking…"
              />
            </label>
            {filteredBroadcastTemplates.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Announcement templates">
                {filteredBroadcastTemplates.map((template) => {
                  const isSelected = selectedBroadcastTemplate?.id === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => selectBroadcastTemplate(template)}
                      aria-pressed={isSelected}
                      className={`dashboard-focus min-w-0 rounded-xl border px-3 py-3 text-left transition ${
                        isSelected
                          ? "border-blue-700 bg-blue-50 ring-1 ring-blue-700"
                          : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">{template.title}</span>
                        {isSelected && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-blue-800">Selected</span>}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-600">{template.message}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700" role="status">
                No announcement templates match “{broadcastTemplateSearch}”. Try another search or write a custom announcement below.
              </p>
            )}
          </fieldset>
          <label className="block text-sm font-semibold text-slate-800">
            Notification title
            <input value={broadcastTitle} onChange={(event) => setBroadcastTitle(event.target.value)} maxLength={100} required disabled={isBroadcasting} className="dashboard-focus mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-950 placeholder:text-slate-500 disabled:bg-slate-50" placeholder="e.g. Service update" />
            <span className="mt-1 block text-right text-[11px] font-normal text-slate-600">{broadcastTitle.length}/100</span>
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Message
            <textarea value={broadcastMessage} onChange={(event) => setBroadcastMessage(event.target.value)} maxLength={240} required rows={3} disabled={isBroadcasting} className="dashboard-focus mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal leading-5 text-slate-950 placeholder:text-slate-500 disabled:bg-slate-50" placeholder="Share a concise, actionable service announcement." />
            <span className="mt-1 block text-right text-[11px] font-normal text-slate-600">{broadcastMessage.length}/240</span>
          </label>
          {!broadcastConfigured && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">Push delivery is not configured. Broadcasts will still appear in the in-app notification bell.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600">Recipients: every registered client and provider.</p>
            <button type="submit" disabled={isBroadcasting || !broadcastTitle.trim() || !broadcastMessage.trim()} className="dashboard-focus inline-flex h-10 items-center justify-center rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white transition hover:bg-rose-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-900">{isBroadcasting ? "Sending…" : "Send urgent broadcast"}</button>
          </div>
        </div>
      </form>
    </section>
  );
}

export default AdminSystemSettings;
