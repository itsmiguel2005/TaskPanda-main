import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import TesdaQualificationSelector from "../components/TesdaQualificationSelector.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const MAX_CERTIFICATE_IMAGE_SIZE = 8 * 1024 * 1024;

function formatRateLimitWait(seconds) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  if (!remainingMinutes) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${hours} ${hours === 1 ? "hour" : "hours"} and ${remainingMinutes} ${remainingMinutes === 1 ? "minute" : "minutes"}`;
}

export default function TesdaCertificatePage() {
  const navigate = useNavigate();
  const { token, isVerified, updateUser, user, refreshProfile } = useAuth();
  const [trade, setTrade] = useState("");
  const [certificateFile, setCertificateFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justSubmittedTrade, setJustSubmittedTrade] = useState("");
  const [pendingCertificateOverride, setPendingCertificateOverride] = useState(null);
  const [isRefreshingProfile, setIsRefreshingProfile] = useState(true);
  const [profileRefreshError, setProfileRefreshError] = useState(false);

  useEffect(() => {
    let active = true;
    refreshProfile().then((refreshed) => {
      if (!active) return;
      setIsRefreshingProfile(false);
      setProfileRefreshError(!refreshed);
    });
    return () => {
      active = false;
    };
  }, [refreshProfile]);

  const certificates = user?.tesdaCertificates || [];
  const pendingCertificates = certificates
    .filter((certificate) => String(certificate.status || "").toLowerCase() === "pending");
  if (
    pendingCertificateOverride?.status === "pending"
    && !certificates.some((certificate) => certificate.id === pendingCertificateOverride.id)
  ) {
    pendingCertificates.push(pendingCertificateOverride);
  }
  const selectedTradeCertificate = [...certificates, ...(pendingCertificateOverride ? [pendingCertificateOverride] : [])].find((certificate) =>
    certificate.trade?.trim().toLowerCase() === trade.trim().toLowerCase()
    && String(certificate.status || "").toLowerCase() === "pending"
  );
  const approvedTradeCertificate = certificates.find((certificate) =>
    certificate.trade?.trim().toLowerCase() === trade.trim().toLowerCase()
    && String(certificate.status || "").toLowerCase() === "approved"
  );

  useEffect(() => {
    if (!certificateFile) {
      setPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(certificateFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [certificateFile]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    setError("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setCertificateFile(null);
      setError("Choose a JPEG, PNG, or WebP image of your TESDA certificate.");
      return;
    }
    if (file.size > MAX_CERTIFICATE_IMAGE_SIZE) {
      setCertificateFile(null);
      setError("The certificate image must be 8 MB or smaller.");
      return;
    }
    setCertificateFile(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setStatusNotice("");
    if (!isVerified) {
      setError("Complete identity verification before submitting a TESDA certificate.");
      return;
    }
    if (!certificateFile) {
      setError("Upload a photo of your TESDA certificate.");
      return;
    }
    if (!trade) {
      setError("Choose a TESDA qualification from the catalog.");
      return;
    }
    setSubmitting(true);
    const formData = new FormData();
    formData.append("trade", trade.trim());
    formData.append("certificate", certificateFile);

    try {
      const response = await fetch("/api/tesda-certificates", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        if (response.status === 429) {
          const retryAfterSeconds = Number(response.headers.get("Retry-After"));
          const retryMessage = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? ` Please try again in about ${formatRateLimitWait(retryAfterSeconds)}.`
            : " Please try again later.";
          setError(`${data.message || "You've reached the TESDA certificate submission limit."}${retryMessage}`);
          return;
        }
        if (response.status === 409) {
          setIsRefreshingProfile(true);
          const refreshed = await refreshProfile();
          setIsRefreshingProfile(false);
          setProfileRefreshError(!refreshed);
          const existingCertificate = data.certificate;
          if (String(existingCertificate?.status || "").toLowerCase() === "pending") {
            setPendingCertificateOverride(existingCertificate);
            setJustSubmittedTrade(existingCertificate.trade);
            setStatusNotice("");
          } else {
            setStatusNotice(refreshed
              ? data.message || "The certificate could not be submitted. Please try again."
              : data.message || "We couldn’t refresh your certificate status just now. Please try again shortly.");
          }
          if (refreshed) {
            setTrade("");
            setCertificateFile(null);
          }
          return;
        }
        setError(data.message || "Could not submit your TESDA certificate. Please try again.");
        return;
      }
      updateUser(data.user);
      setPendingCertificateOverride(data.certificate || null);
      setStatusNotice("");
      setJustSubmittedTrade(trade.trim());
      setTrade("");
      setCertificateFile(null);
    } catch (requestError) {
      console.error("TESDA certificate submission failed:", requestError);
      setError(requestError instanceof TypeError
        ? "Could not reach the verification service. Check your connection and try again."
        : requestError.message || "Could not submit your TESDA certificate. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Header showNav activeTab="Profile" role="provider" />
      <main className="dashboard-page bg-[radial-gradient(ellipse_at_top,_rgba(186,230,253,0.4),_transparent_55%),linear-gradient(180deg,_#eff6ff_0%,_#f8fbff_28rem,_#f8fafc_100%)]">
        <div className="dashboard-shell max-w-2xl">
          <button
            type="button"
            onClick={() => navigate("/provider-profile")}
            disabled={submitting}
            className="dashboard-focus mb-5 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 transition hover:text-slate-950 focus-visible:outline-blue-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02z" clipRule="evenodd" />
            </svg>
            Back to profile
          </button>

          <section className="dashboard-panel overflow-hidden">
            <div className="dashboard-panel-heading">
              <h1 className="text-xl font-extrabold tracking-tight text-slate-950">Verify a TESDA certificate</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">Add a trade credential to your provider profile. It is reviewed separately from your identity verification.</p>
            </div>

            {!isVerified ? (
              <div className="p-5 sm:p-6">
                <p className="text-sm leading-6 text-slate-700">Your identity must be verified before you can submit a TESDA certificate.</p>
                <button
                  type="button"
                  onClick={() => navigate("/provider-profile/verify")}
                  className="dashboard-secondary-button dashboard-focus mt-4 px-4 py-2.5 text-sm"
                >
                  Verify identity
                </button>
              </div>
            ) : (
              <>
                {isRefreshingProfile && (
                  <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 text-sm text-slate-700 sm:px-6" role="status" aria-live="polite">
                    <svg className="h-4 w-4 shrink-0 animate-spin text-sky-800 motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Checking your TESDA certificate review status…
                  </div>
                )}

                {profileRefreshError && !isRefreshingProfile && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm leading-5 text-amber-950 sm:px-6" role="status">
                    <span>We couldn’t refresh your certificate status. Saved submissions are shown below if available.</span>
                    <button
                      type="button"
                      onClick={async () => {
                        setIsRefreshingProfile(true);
                        const refreshed = await refreshProfile();
                        setProfileRefreshError(!refreshed);
                        setIsRefreshingProfile(false);
                      }}
                      className="dashboard-focus rounded-lg px-2 py-1 font-semibold underline underline-offset-2"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {statusNotice && (
                  <div className="border-b border-sky-200 bg-sky-50 px-5 py-3 text-sm leading-5 text-sky-950 sm:px-6" role="status">
                    {statusNotice}
                  </div>
                )}

                {(pendingCertificates.length > 0 || justSubmittedTrade) && (
                  <div className="border-b border-amber-200 bg-amber-50/80 px-5 py-5 sm:px-6" role="status" aria-live="polite">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-amber-800 ring-1 ring-amber-200" aria-hidden="true">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-sm font-extrabold text-amber-950">
                          {justSubmittedTrade ? "Your certificate is in review" : "Your TESDA certificate is under review"}
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-amber-950/90">
                          {justSubmittedTrade
                            ? `We’ve received your ${justSubmittedTrade} certificate. Our team is reviewing it; no further action is needed. You can keep using TaskPanda and we’ll update your profile when there’s a decision.`
                            : `Our team is reviewing ${pendingCertificates.length === 1 ? "your certificate" : "your certificates"}${pendingCertificates.length === 1 ? ` for ${pendingCertificates[0].trade}` : ""}. No further action is needed. You can keep using TaskPanda and we’ll update your profile when there’s a decision.`}
                        </p>
                        {pendingCertificates.length > 1 && (
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950/90">
                            {pendingCertificates.map((certificate) => <li key={certificate.id}>{certificate.trade}</li>)}
                          </ul>
                        )}
                        <button
                          type="button"
                          onClick={() => navigate("/explore")}
                          className="dashboard-focus mt-3 inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-800"
                        >
                          Continue exploring
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-6">
                <div>
                  <label htmlFor="tesda-trade" className="block text-sm font-semibold text-slate-800">TESDA trade or qualification</label>
                  <TesdaQualificationSelector value={trade} onChange={setTrade} disabled={submitting} />
                  {selectedTradeCertificate && (
                    <p className="mt-2 text-sm font-medium text-amber-900" role="status">
                      A certificate for this trade is already under review.
                    </p>
                  )}
                  {!selectedTradeCertificate && approvedTradeCertificate && (
                    <p className="mt-2 text-sm font-medium text-sky-900" role="status">
                      This qualification is already verified. Upload an updated certificate to request a new review.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="tesda-certificate-image" className="block text-sm font-semibold text-slate-800">Certificate image</label>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Upload a clear photo or scan showing the certificate details. JPEG, PNG, or WebP, up to 8 MB.</p>
                  <input
                    id="tesda-certificate-image"
                    name="certificate"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    disabled={submitting}
                    className="dashboard-focus mt-3 block w-full rounded-xl border border-slate-300 bg-white text-sm text-slate-700 file:mr-4 file:min-h-11 file:border-0 file:bg-slate-100 file:px-4 file:font-semibold file:text-slate-800 hover:file:bg-slate-200"
                  />
                  {certificateFile && <p className="mt-2 break-all text-xs text-slate-600">{certificateFile.name}</p>}
                  {certificateFile && (
                    <button
                      type="button"
                      onClick={() => setCertificateFile(null)}
                      disabled={submitting}
                      className="dashboard-focus mt-2 rounded text-xs font-semibold text-rose-700 underline underline-offset-2 hover:text-rose-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Remove selected image
                    </button>
                  )}
                  {previewUrl && (
                    <figure className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <img src={previewUrl} alt="Preview of the TESDA certificate being submitted" className="mx-auto max-h-80 w-full object-contain" />
                    </figure>
                  )}
                </div>

                {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-900">{error}</p>}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => navigate(user?.role === "provider" ? "/provider-profile" : "/profile")}
                    disabled={submitting}
                    className="dashboard-focus min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || trade.trim().length < 2 || !certificateFile || Boolean(selectedTradeCertificate)}
                    className="dashboard-primary-button dashboard-focus min-h-11 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? "Submitting…" : "Submit for review"}
                  </button>
                </div>
              </form>
              </>
            )}
          </section>

          {(user?.tesdaCertificates || []).length > 0 && (
            <section className="mt-5 dashboard-panel" aria-labelledby="tesda-history-heading">
              <div className="dashboard-panel-heading">
                <h2 id="tesda-history-heading" className="text-base font-bold text-slate-950">Your TESDA submissions</h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {user.tesdaCertificates.map((certificate) => (
                  <li key={certificate.id} className="px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{certificate.trade}</p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        certificate.status === "approved"
                          ? "bg-emerald-50 text-emerald-800"
                          : certificate.status === "rejected"
                            ? "bg-rose-50 text-rose-800"
                            : "bg-amber-50 text-amber-900"
                      }`}>
                        {certificate.status === "approved" ? "Verified" : certificate.status === "rejected" ? "Update requested" : "Pending review"}
                      </span>
                    </div>
                    {certificate.rejectionReason && <p className="mt-2 text-sm leading-5 text-rose-800">Review feedback: {certificate.rejectionReason}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
