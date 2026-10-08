import { apiFetch } from "../services/api.js";
import { useEffect, useRef, useState } from "react";
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

function GuidedCertificateCamera({ onCancel, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Live camera capture is not supported in this browser. Upload a photo instead.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (!cancelled) setCameraReady(true);
      } catch (error) {
        if (cancelled) return;
        const messages = {
          NotAllowedError: "Camera access is blocked. Allow camera access in your browser settings, or upload a photo.",
          NotFoundError: "No camera was found. Upload a photo of your certificate instead.",
          NotReadableError: "The camera is being used by another app. Close it and try again, or upload a photo.",
        };
        setCameraError(messages[error.name] || "Could not start the camera. Upload a photo instead.");
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    setCapturing(true);
    setCameraError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not capture a photo from this camera.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("Could not capture a photo. Please try again."));
        }, "image/jpeg", 0.94);
      });
      onCapture(new File([blob], `tesda-certificate-${Date.now()}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      }));
    } catch (error) {
      setCameraError(error.message || "Could not capture a photo. Please try again.");
    } finally {
      setCapturing(false);
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-sky-200 bg-slate-950 p-4 text-white" aria-label="Guided camera for TESDA certificate">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold">Capture your certificate</h3>
          <p className="mt-1 text-xs leading-5 text-slate-200">Use even light, avoid glare, and keep the full certificate in view.</p>
        </div>
        <button type="button" onClick={onCancel} className="dashboard-focus rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-200 underline underline-offset-2 hover:text-white">
          Close camera
        </button>
      </div>

      {cameraError ? (
        <p className="mt-4 rounded-xl bg-rose-950/70 p-3 text-sm text-rose-100" role="alert">{cameraError}</p>
      ) : (
        <>
          <div className="relative mt-4 overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="max-h-[55vh] min-h-48 w-full object-contain"
              aria-label="Live camera preview"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-5" aria-hidden="true">
              <div className="aspect-[1.414/1] w-full max-w-120 rounded-xl border-2 border-dashed border-white shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-100" role="status" aria-live="polite">
            {cameraReady ? "Position the full certificate inside the guide, then capture it." : "Starting your camera…"}
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={capturePhoto}
              disabled={!cameraReady || capturing}
              className="dashboard-focus min-h-11 flex-1 rounded-xl bg-white px-4 text-sm font-bold text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {capturing ? "Capturing photo…" : "Capture photo"}
            </button>
            <button type="button" onClick={onCancel} className="dashboard-focus min-h-11 rounded-xl border border-white/30 px-4 text-sm font-semibold text-white transition hover:bg-white/10">
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default function TesdaCertificatePage() {
  const navigate = useNavigate();
  const { token, isVerified, updateUser, user, refreshProfile } = useAuth();
  const uploadInputRef = useRef(null);
  const [trade, setTrade] = useState("");
  const [certificateFile, setCertificateFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
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

  const selectCertificateFile = (file) => {
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

  const handleFileChange = (event) => {
    selectCertificateFile(event.target.files?.[0] || null);
    event.target.value = "";
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
      const response = await apiFetch("/api/tesda-certificates", {
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
      <main className="dashboard-page bg-[radial-gradient(ellipse_at_top,rgba(186,230,253,0.4),transparent_55%),linear-gradient(180deg,#eff6ff_0%,#f8fbff_28rem,#f8fafc_100%)]">
        <div className="dashboard-shell max-w-lg">
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
                  <section className="m-5 overflow-hidden rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-[0_16px_40px_rgba(16,185,129,0.10)] sm:m-6 sm:p-8" role="status" aria-live="polite">
                    <div className="mx-auto h-32 w-32 overflow-hidden rounded-full border-[3px] border-emerald-200 bg-white shadow-sm">
                      <img src="/assets/Panda Cropped.png" alt="TaskPanda panda mascot" className="h-full w-full object-cover object-top" />
                    </div>
                    <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-bold text-emerald-800">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                      Under review
                    </span>
                    <h2 className="mt-3 text-xl font-extrabold tracking-tight text-emerald-950 sm:text-2xl">
                      Hang tight! Panda is reviewing your TESDA certificate{pendingCertificates.length > 1 ? "s" : ""}.
                    </h2>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-emerald-800">
                      No further action is needed for these submissions. You can keep using TaskPanda, and we’ll update your profile when there’s a decision.
                    </p>
                    {(pendingCertificates.length > 0 || justSubmittedTrade) && (
                      <ul className="mx-auto mt-3 max-w-md space-y-1 text-sm font-semibold text-emerald-900">
                        {pendingCertificates.map((certificate) => <li key={certificate.id}>{certificate.trade}</li>)}
                        {pendingCertificates.length === 0 && justSubmittedTrade && <li>{justSubmittedTrade}</li>}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate("/explore")}
                      className="dashboard-focus mt-5 inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sky-800"
                    >
                      Continue exploring
                    </button>
                  </section>
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
                    ref={uploadInputRef}
                    id="tesda-certificate-image"
                    name="certificate"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    disabled={submitting}
                    className="hidden"
                  />
                  <div className="mt-3 flex flex-col gap-4 rounded-2xl border border-dashed border-sky-300 bg-sky-50/55 p-4 sm:flex-row sm:items-center">
                    {previewUrl ? (
                      <img src={previewUrl} alt="TESDA certificate preview" className="h-24 w-full rounded-lg object-contain ring-1 ring-slate-200 sm:h-20 sm:w-28" />
                    ) : (
                      <div className="flex h-20 w-full shrink-0 items-center justify-center rounded-lg border border-sky-100 bg-white/80 text-sky-700 sm:w-28">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-9 w-9" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 3.75h8.25L18 7.5v12.75A1.5 1.5 0 0 1 16.5 21h-10A1.5 1.5 0 0 1 5 19.5v-14A1.75 1.75 0 0 1 6.75 3.75ZM14 4v4h4m-9 4h6m-6 3h6m-6 3h4" />
                        </svg>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">{certificateFile ? "Replace certificate image" : "Add a certificate image"}</p>
                      <p className="mt-1 text-xs text-slate-600">JPEG, PNG, or WebP · up to 8 MB</p>
                      <div className="mt-3 flex flex-nowrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCameraOpen(true)}
                          disabled={submitting}
                          className="dashboard-focus inline-flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-sky-200 bg-white px-1.5 text-[11px] font-semibold whitespace-nowrap text-sky-950 transition hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                            <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
                            <circle cx="12" cy="13" r="3.5" />
                          </svg>
                          Guided camera
                        </button>
                        <button
                          type="button"
                          onClick={() => uploadInputRef.current?.click()}
                          disabled={submitting}
                          className="dashboard-focus inline-flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-1.5 text-[11px] font-semibold whitespace-nowrap text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                            <path d="M12 16V4m0 0L8 8m4-4 4 4" />
                            <path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
                          </svg>
                          Upload photo
                        </button>
                      </div>
                      {certificateFile && <p className="mt-2 break-all text-xs text-slate-600">{certificateFile.name}</p>}
                    </div>
                  </div>
                  {cameraOpen && (
                    <GuidedCertificateCamera
                      onCancel={() => setCameraOpen(false)}
                      onCapture={(file) => {
                        setCameraOpen(false);
                        selectCertificateFile(file);
                      }}
                    />
                  )}
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
                    disabled={submitting || cameraOpen || trade.trim().length < 2 || !certificateFile || Boolean(selectedTradeCertificate)}
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
