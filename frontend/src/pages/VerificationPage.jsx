import { apiFetch } from "../services/api.js";
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { analyzeImageQuality, checkImageSharpness } from "../utils/imageCheck.js";
import { prepareVerificationImage } from "../utils/verificationImage.js";

const MAX_ID_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_LIVE_ANALYSIS_DIMENSION = 320;
const LIVE_ANALYSIS_INTERVAL_MS = 750;

function ImageUpload({
  label,
  name,
  accept,
  file,
  preview,
  onSelect,
  onTakePhoto,
  onRemove,
  disabled,
  isChecking,
  imageError,
  imageWarnings,
}) {
  const uploadInputRef = useRef(null);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">
        {label} <span className="text-red-500">*</span>
      </label>
      <div className="mt-2 flex w-full items-center gap-4 rounded-2xl border border-dashed border-sky-300 bg-sky-50/55 p-4">
        {preview ? (
          <img src={preview} alt={`${label} preview`} className="h-16 w-24 rounded-lg object-cover ring-1 ring-slate-200" />
        ) : (
          <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg border border-sky-100 bg-white/80 text-sky-700">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 5.25A2.25 2.25 0 016.75 3h10.5A2.25 2.25 0 0119.5 5.25v13.5A2.25 2.25 0 0117.25 21H6.75a2.25 2.25 0 01-2.25-2.25V5.25z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 8h8m-8 4h5m-5 4h8" />
            </svg>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">{file ? "Replace image" : "Choose image"}</p>
          <p className="mt-1 text-xs text-slate-600">JPEG, PNG, or WebP · up to 8 MB</p>
          <div className="mt-3 flex flex-nowrap gap-1.5">
            <button
              type="button"
              onClick={onTakePhoto}
              disabled={disabled}
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
              disabled={disabled}
              className="dashboard-focus inline-flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-1.5 text-[11px] font-semibold whitespace-nowrap text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                <path d="M12 16V4m0 0L8 8m4-4 4 4" />
                <path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
              </svg>
              Upload photo
            </button>
          </div>
        </div>
      </div>
      <input
        ref={uploadInputRef}
        type="file"
        name={`${name}-upload`}
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={onSelect}
      />
      {isChecking && (
        <p className="mt-2 text-xs font-medium text-sky-800" role="status" aria-live="polite">
          Checking clarity, lighting, and resolution…
        </p>
      )}
      {imageError && (
        <p className="mt-2 text-sm font-medium text-rose-800" role="alert">
          {imageError}
        </p>
      )}
      {imageWarnings.length > 0 && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status" aria-live="polite">
          <ul className="list-disc space-y-1 pl-5">
            {imageWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
          <p className="mt-2 text-xs leading-5">
            Check that all four corners and the printed details are visible. You can retake the photo or continue if everything is readable.
          </p>
        </div>
      )}
      {file && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs text-gray-500">{file.name}</p>
            <button type="button" onClick={onRemove} disabled={disabled} className="dashboard-focus shrink-0 rounded text-xs font-semibold text-rose-700 underline underline-offset-2 hover:text-rose-900 disabled:cursor-not-allowed disabled:opacity-60">Remove</button>
          </div>
          <img src={preview} alt={`${label} full photo preview`} className="max-h-56 w-full rounded-xl bg-slate-950/5 object-contain ring-1 ring-slate-200" />
          <p className="text-xs leading-5 text-slate-700">
            Check the preview: the ID should fill most of the photo, all four corners should show, and the printed details should be readable.
          </p>
        </div>
      )}
    </div>
  );
}

function GuidedCamera({ side, onCancel, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [liveQuality, setLiveQuality] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let analysisTimer;

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
        if (cancelled) return;
        setCameraReady(true);

        analysisTimer = window.setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
          const scale = Math.min(
            1,
            MAX_LIVE_ANALYSIS_DIMENSION / Math.max(video.videoWidth, video.videoHeight)
          );
          const width = Math.max(3, Math.round(video.videoWidth * scale));
          const height = Math.max(3, Math.round(video.videoHeight * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) return;
          context.drawImage(video, 0, 0, width, height);
          setLiveQuality(analyzeImageQuality(context.getImageData(0, 0, width, height), width, height));
        }, LIVE_ANALYSIS_INTERVAL_MS);
      } catch (error) {
        if (cancelled) return;
        const messages = {
          NotAllowedError: "Camera access is blocked. Allow camera access in your browser settings, or use Upload photo.",
          NotFoundError: "No camera was found. Use Upload photo to choose an ID image.",
          NotReadableError: "The camera is being used by another app. Close it and try again, or use Upload photo.",
          OverconstrainedError: "This camera could not start with the requested settings. Upload a photo instead.",
        };
        setCameraError(messages[error.name] || "Could not start the camera. Upload a photo instead.");
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      window.clearInterval(analysisTimer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    setCapturing(true);
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
          else reject(new Error("Could not capture a photo from this camera. Please try again."));
        }, "image/jpeg", 0.94);
      });
      onCapture(new File([blob], `id-${side}-${Date.now()}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      }));
    } catch (error) {
      setCameraError(error.message || "Could not capture a photo. Please try again.");
      setCapturing(false);
    }
  };

  const liveMessage = liveQuality?.isBlurry
    ? "Hold the phone steady and tap the screen to focus."
    : liveQuality?.isTooDark
      ? "Add more light and avoid casting a shadow over the ID."
      : liveQuality?.isOverexposed
        ? "The image looks washed out. Move away from direct light or glare."
        : "Move closer until the ID nearly fills the guide; keep all four corners inside it.";

  return (
    <section className="mt-4 rounded-2xl border border-sky-200 bg-slate-950 p-4 text-white" aria-label={`Guided camera for ${side} of ID`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold">Capture the {side} of your ID</h3>
          <p className="mt-1 text-xs leading-5 text-slate-200">
            Use even light, avoid flash reflections, and keep every edge visible.
          </p>
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
              <div className="aspect-[1.586/1] w-full max-w-120 rounded-xl border-2 border-dashed border-white shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
            </div>
          </div>
          <p className={`mt-3 text-sm ${liveQuality?.isBlurry || liveQuality?.isTooDark || liveQuality?.isOverexposed ? "text-amber-200" : "text-slate-100"}`} role="status" aria-live="polite">
            {cameraReady ? liveMessage : "Starting your camera…"}
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={capturePhoto}
              disabled={!cameraReady || capturing}
              className="dashboard-focus min-h-11 flex-1 rounded-xl bg-white px-4 text-sm font-bold text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {capturing ? "Checking photo…" : "Capture photo"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="dashboard-focus min-h-11 rounded-xl border border-white/30 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default function VerificationPage() {
  const navigate = useNavigate();
  const { verify, token, role, isVerified, user, updateUser } = useAuth();
  const profilePath = role === "provider" ? "/provider-profile" : "/profile";
  const [verificationState, setVerificationState] = useState("loading");
  const [verificationStatusError, setVerificationStatusError] = useState("");
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  const [idFrontFile, setIdFrontFile] = useState(null);
  const [idBackFile, setIdBackFile] = useState(null);
  const [idFrontPreview, setIdFrontPreview] = useState("");
  const [idBackPreview, setIdBackPreview] = useState("");
  const [checkingImages, setCheckingImages] = useState({ front: false, back: false });
  const [imageErrors, setImageErrors] = useState({ front: "", back: "" });
  const [imageWarnings, setImageWarnings] = useState({ front: [], back: [] });
  const [captureMethods, setCaptureMethods] = useState({ front: "upload", back: "upload" });
  const [cameraSide, setCameraSide] = useState("");
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [voucherAwarded, setVoucherAwarded] = useState(false);
  const [voucherAwardError, setVoucherAwardError] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => () => {
    if (idFrontPreview) URL.revokeObjectURL(idFrontPreview);
    if (idBackPreview) URL.revokeObjectURL(idBackPreview);
  }, [idFrontPreview, idBackPreview]);

  useEffect(() => {
    let active = true;

    const loadVerificationStatus = async () => {
      setVerificationState("loading");
      setVerificationStatusError("");
      try {
        const response = await apiFetch("/api/profile", {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Could not check your verification status.");
        }
        if (!data.user) {
          throw new Error("Your profile response did not include verification status.");
        }
        if (!active) return;

        updateUser(data.user);
        const status = String(data.user.verificationStatus || "").toLowerCase();
        const detailStatus = String(data.user.verificationDetailsStatus || "").toLowerCase();
        if (data.user.isVerified === true || status === "verified" || detailStatus === "active") {
          setVerificationState("verified");
        } else if (status === "pending" || detailStatus === "pending") {
          setVerificationState("pending");
        } else if (status === "rejected" || detailStatus === "rejected") {
          setVerificationState("rejected");
        } else {
          setVerificationState("unverified");
        }
      } catch (statusError) {
        console.error("Could not load identity verification status:", statusError);
        if (!active) return;
        setVerificationStatusError(statusError.message || "Could not check your verification status. Please try again.");
        setVerificationState("error");
      }
    };

    void loadVerificationStatus();
    return () => {
      active = false;
    };
  }, [token, updateUser, statusRefreshKey]);

  const processSelectedImage = async (side, file, captureMethod = "upload") => {
    if (!file) return;
    const setter = side === "front" ? setIdFrontFile : setIdBackFile;
    const setPreview = side === "front" ? setIdFrontPreview : setIdBackPreview;
    const clearImage = () => {
      setPreview((currentPreview) => {
        if (currentPreview) URL.revokeObjectURL(currentPreview);
        return "";
      });
      setter(null);
      setCaptureMethods((current) => ({ ...current, [side]: "upload" }));
      setImageWarnings((current) => ({ ...current, [side]: [] }));
    };

    if (file.size > MAX_ID_IMAGE_SIZE) {
      setError("Each ID image must be 8 MB or smaller. Choose a smaller image and try again.");
      return;
    }
    setError("");
    setImageErrors((current) => ({ ...current, [side]: "" }));
    setImageWarnings((current) => ({ ...current, [side]: [] }));
    setCheckingImages((current) => ({ ...current, [side]: true }));
    try {
      const quality = await checkImageSharpness(file);
      if (quality.isBlurry || quality.isTooSmall) {
        clearImage();
        setImageErrors((current) => ({
          ...current,
          [side]: quality.isBlurry
            ? "This photo is too blurry to read. Hold the camera steady, tap to focus, and retake it."
            : "This photo has too few pixels to read the ID. Retake it closer or choose a higher-resolution image.",
        }));
        return;
      }

      const warnings = [];
      if (quality.isLowResolution) {
        warnings.push("This image may not have enough detail. Retake it closer to the ID if the printed text looks small.");
      }
      if (quality.isTooDark) {
        warnings.push("The photo looks dark. Add even light and keep your shadow off the ID.");
      }
      if (quality.isOverexposed) {
        warnings.push("Bright areas may hide ID details. Avoid direct light and reflections.");
      }

      const preparedFile = await prepareVerificationImage(file);
      setImageWarnings((current) => ({ ...current, [side]: warnings }));
      setPreview((currentPreview) => {
        if (currentPreview) URL.revokeObjectURL(currentPreview);
        return URL.createObjectURL(preparedFile);
      });
      setter(preparedFile);
      setCaptureMethods((current) => ({ ...current, [side]: captureMethod }));
    } catch (imageError) {
      clearImage();
      setImageErrors((current) => ({
        ...current,
        [side]: imageError.message || "Could not check this image. Please choose another.",
      }));
    } finally {
      setCheckingImages((current) => ({ ...current, [side]: false }));
    }
  };

  const handleFileSelect = (side) => (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    void processSelectedImage(side, file, "upload");
  };

  const handleRemove = (side, setter, setPreview) => () => {
    setPreview((currentPreview) => {
      if (currentPreview) URL.revokeObjectURL(currentPreview);
      return "";
    });
    setter(null);
    setCaptureMethods((current) => ({ ...current, [side]: "upload" }));
    setImageErrors((current) => ({ ...current, [side]: "" }));
    setImageWarnings((current) => ({ ...current, [side]: [] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (cameraSide) {
      setError("Finish or close the live camera before submitting your ID.");
      return;
    }

    if (checkingImages.front || checkingImages.back) {
      setError("Please wait for the image clarity check to finish.");
      return;
    }

    if (!idFrontFile || !idBackFile) {
      setError("Please upload both ID front and ID back images");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("idFront", idFrontFile);
    formData.append("idBack", idBackFile);
    formData.append("idFrontCaptureMethod", captureMethods.front);
    formData.append("idBackCaptureMethod", captureMethods.back);

    try {
      if (idFrontFile.size + idBackFile.size > 3_400_000) {
        throw new Error("The two ID photos are still too large to submit. Please retake them closer to the ID or choose smaller photos.");
      }
      const res = await apiFetch("/api/v1/users/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await res.json()
        : {};
      if (!res.ok) {
        setError(res.status === 413
          ? "The upload service rejected the photos because they are too large. Please retake each side closer to the ID and try again."
          : data.message || data.error || `Verification failed (HTTP ${res.status}). Please try again.`);
        setUploading(false);
        return;
      }
      if (!data.success) {
        setError("The verification service returned an unexpected response. Please try again.");
        setUploading(false);
        return;
      }
      verify(data);
      setOcrProcessing(data.ocrProcessing === true);
      setVoucherAwarded(data.voucherAwarded === true);
      setVoucherAwardError(data.voucherAwardError === true);
      setVerificationState(data.isVerified === true ? "verified" : "pending");
      setUploading(false);
    } catch (err) {
      console.error("Identity verification submission failed:", err);
      setError(err instanceof TypeError
        ? "Could not reach the verification service. Check your connection and try again."
        : err.message || "Could not submit your verification. Please try again.");
      setUploading(false);
    }
  };

  const imagesBusy = uploading || checkingImages.front || checkingImages.back;

  return (
    <div>
      <Header showNav activeTab="Profile" role={role === "provider" ? "provider" : "client"} />

      <main className="dashboard-page bg-[radial-gradient(ellipse_at_top,rgba(186,230,253,0.4),transparent_55%),linear-gradient(180deg,#eff6ff_0%,#f8fbff_28rem,#f8fafc_100%)]">
        <div className="dashboard-shell max-w-lg">
          <button
            onClick={() => navigate(profilePath)}
            disabled={uploading}
            className="dashboard-focus mb-5 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 transition hover:text-slate-950 focus-visible:outline-blue-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
            </svg>
            Back to Profile
          </button>

        <div className="rounded-3xl border border-white/80 bg-white/75 p-7 text-center shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-9">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-800 shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-8 w-8" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <circle cx="8" cy="11" r="2" />
              <path strokeLinecap="round" d="M5.5 16c.7-1.2 1.6-1.8 2.5-1.8s1.8.6 2.5 1.8M13 10h5m-5 4h5" />
            </svg>
          </div>
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            {verificationState === "pending"
              ? "Verification under review"
              : verificationState === "verified"
                ? "Identity verified"
                : "Identity verification"}
          </h1>
          <p className="mx-auto mt-3 max-w-prose text-sm leading-6 text-slate-600">
            {verificationState === "pending"
              ? "Your documents are with our team. You can continue using TaskPanda while we review them."
              : verificationState === "verified"
                ? "Your identity is confirmed. You can continue using all available TaskPanda features."
                : "Capture or upload both sides of a valid photo ID. Use a flat surface, even light, and keep all four ID corners visible so the text can be read."}
          </p>
        </div>

        {role === "client" && !isVerified && (verificationState === "unverified" || verificationState === "rejected") && (
          <aside className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-left shadow-sm sm:p-5" aria-label="Identity verification reward">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-800 ring-1 ring-emerald-200" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M20 12v8H4v-8M2 7h20v5H2zM12 20V7" />
                  <path d="M12 7H7.5a2.5 2.5 0 1 1 2.5-2.5V7Zm0 0h4.5A2.5 2.5 0 1 0 14 4.5V7Z" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-extrabold text-emerald-950">Get a free ₱50 travel-fee voucher</h2>
                <p className="mt-1 text-sm leading-5 text-emerald-900">
                  Complete identity verification and we’ll add a one-time voucher to your wallet after approval. Use it toward a future booking’s travel fee.
                </p>
              </div>
            </div>
          </aside>
        )}

        {verificationState === "loading" && (
          <div className="mt-5 flex min-h-40 items-center justify-center rounded-3xl border border-slate-200 bg-white/80 p-6 text-sm font-medium text-slate-700 shadow-sm" role="status" aria-live="polite">
            <span className="flex items-center gap-3">
              <svg className="h-5 w-5 animate-spin text-emerald-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Checking your verification status…
            </span>
          </div>
        )}

        {verificationState === "error" && (
          <div className="mt-5 rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-sm" role="alert">
            <p className="text-sm font-semibold text-rose-900">{verificationStatusError}</p>
            <button
              type="button"
              onClick={() => setStatusRefreshKey((current) => current + 1)}
              className="dashboard-focus mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sky-800"
            >
              Try again
            </button>
          </div>
        )}

        {verificationState === "pending" && (
          <section className="relative mt-5 overflow-hidden rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-[0_16px_40px_rgba(16,185,129,0.10)] sm:p-8" role="status" aria-live="polite">
            <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/70 blur-2xl" aria-hidden="true" />
            <div className="relative mx-auto h-36 w-36">
              <div className="absolute inset-0 overflow-hidden rounded-full border-[3px] border-emerald-200 bg-white shadow-sm">
                <img
                  src="/assets/Panda Cropped.png"
                  alt="TaskPanda panda mascot"
                  className="absolute inset-0 h-full w-full object-cover object-top"
                />
              </div>
              <span className="absolute bottom-1 right-1 z-20 flex h-10 w-10 items-center justify-center rounded-full border-2 border-emerald-200 bg-white text-emerald-700 shadow-sm" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <circle cx="10.8" cy="10.8" r="6.3" />
                  <path d="m15.5 15.5 4.2 4.2" />
                </svg>
              </span>
            </div>
            <span className="relative mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-bold text-emerald-800">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              Under review
            </span>
            <h2 className="relative mt-3 text-xl font-extrabold tracking-tight text-emerald-950 sm:text-2xl">
              Hang tight! Panda is reviewing your ID documents.
            </h2>
            <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-emerald-800">
              Verification usually takes 24–48 hours. We’ll notify you once your documents are approved.
            </p>
            {ocrProcessing && (
              <p className="relative mt-2 text-xs font-medium text-emerald-700">
                Your ID images are saved securely and being checked now.
              </p>
            )}
            <button
              type="button"
              onClick={() => navigate("/explore")}
              className="dashboard-focus relative mt-5 inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sky-800"
            >
              Explore TaskPanda
            </button>
          </section>
        )}

        {verificationState === "verified" && (
          <section className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm sm:p-8" role="status">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-emerald-700 ring-1 ring-emerald-200">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8" aria-hidden="true">
                <path d="m5 12 4 4L19 6" />
              </svg>
            </div>
            <h2 className="mt-4 text-xl font-extrabold text-emerald-950">Identity verified</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-800">
              {voucherAwarded
                ? "Your identity has been verified, and your free ₱50 travel-fee voucher is in your wallet."
                : voucherAwardError
                  ? "Your identity is verified, but we couldn’t add your voucher right now. Please contact support."
                  : "Your identity has been verified. You can continue using all available TaskPanda features."}
            </p>
            <button
              type="button"
              onClick={() => navigate(profilePath)}
              className="dashboard-focus mt-5 inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sky-800"
            >
              Back to profile
            </button>
          </section>
        )}

        {(verificationState === "unverified" || verificationState === "rejected") && (
          <form onSubmit={handleSubmit} className="mt-5 space-y-5 rounded-3xl border border-white/80 bg-white/75 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:p-7">
            {verificationState === "rejected" && user?.verificationRejectionReason && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900" role="status">
                <p className="font-bold">Your previous verification was not approved.</p>
                <p className="mt-1">{user.verificationRejectionReason}</p>
                <p className="mt-1">Upload clear images of both sides to submit again.</p>
              </div>
            )}
          <ImageUpload
            label="ID Front"
            name="idFront"
            accept="image/jpeg,image/png,image/webp"
            file={idFrontFile}
            preview={idFrontPreview}
            onSelect={handleFileSelect("front")}
            onTakePhoto={() => setCameraSide("front")}
            onRemove={handleRemove("front", setIdFrontFile, setIdFrontPreview)}
            disabled={imagesBusy}
            isChecking={checkingImages.front}
            imageError={imageErrors.front}
            imageWarnings={imageWarnings.front}
          />
          {cameraSide === "front" && (
            <GuidedCamera
              side="front"
              onCancel={() => setCameraSide("")}
              onCapture={(file) => {
                setCameraSide("");
                void processSelectedImage("front", file, "guided-camera");
              }}
            />
          )}

          <ImageUpload
            label="ID Back"
            name="idBack"
            accept="image/jpeg,image/png,image/webp"
            file={idBackFile}
            preview={idBackPreview}
            onSelect={handleFileSelect("back")}
            onTakePhoto={() => setCameraSide("back")}
            onRemove={handleRemove("back", setIdBackFile, setIdBackPreview)}
            disabled={imagesBusy}
            isChecking={checkingImages.back}
            imageError={imageErrors.back}
            imageWarnings={imageWarnings.back}
          />
          {cameraSide === "back" && (
            <GuidedCamera
              side="back"
              onCancel={() => setCameraSide("")}
              onCapture={(file) => {
                setCameraSide("");
                void processSelectedImage("back", file, "guided-camera");
              }}
            />
          )}

          {uploading && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-left" role="status" aria-live="polite">
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 shrink-0 animate-spin text-sky-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Submitting your ID securely</p>
                  <p className="mt-1 text-xs leading-5 text-slate-700">
                    We’re uploading both images and saving your submission. Once they’re saved, you can leave while the ID check continues in the background.
                  </p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sky-100" aria-hidden="true">
                <div className="h-full w-1/3 rounded-full bg-sky-700 motion-safe:animate-pulse" />
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600" role="alert">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate(profilePath)}
              disabled={uploading || checkingImages.front || checkingImages.back}
              className="dashboard-focus flex-1 rounded-xl border border-slate-300 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={imagesBusy || Boolean(cameraSide)}
              className="dashboard-focus flex-1 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(15,23,42,0.15)] transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? "Uploading..." : "Submit Verification"}
            </button>
          </div>
          </form>
        )}
        </div>
      </main>
    </div>
  );
}
