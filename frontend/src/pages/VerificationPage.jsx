import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { checkImageSharpness } from "../utils/imageCheck.js";
import { prepareVerificationImage } from "../utils/verificationImage.js";

const MAX_ID_IMAGE_SIZE = 8 * 1024 * 1024;

function ImageUpload({ label, name, accept, file, preview, onSelect, onRemove, disabled, isChecking, imageError }) {
  const uploadInputRef = useRef(null);
  const cameraInputRef = useRef(null);
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
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={disabled}
              className="dashboard-focus inline-flex min-h-9 items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 text-xs font-semibold text-sky-950 transition hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              Take photo
            </button>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={disabled}
              className="dashboard-focus inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M12 16V4m0 0L8 8m4-4 4 4" />
                <path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
              </svg>
              Upload photo
            </button>
          </div>
        </div>
      </div>
      <input
        ref={cameraInputRef}
        type="file"
        name={name}
        accept={accept}
        capture="environment"
        className="hidden"
        disabled={disabled}
        onChange={onSelect}
      />
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
          Checking clarity and preparing image for upload…
        </p>
      )}
      {imageError && (
        <p className="mt-2 text-sm font-medium text-rose-800" role="alert">
          {imageError}
        </p>
      )}
      {file && (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-gray-500 truncate max-w-[200px]">{file.name}</p>
          <button type="button" onClick={onRemove} disabled={disabled} className="dashboard-focus rounded text-xs font-semibold text-rose-700 underline underline-offset-2 hover:text-rose-900 disabled:cursor-not-allowed disabled:opacity-60">Remove</button>
        </div>
      )}
    </div>
  );
}

export default function VerificationPage() {
  const navigate = useNavigate();
  const { verify, token, role, isVerified } = useAuth();
  const profilePath = role === "provider" ? "/provider-profile" : "/profile";
  const [idFrontFile, setIdFrontFile] = useState(null);
  const [idBackFile, setIdBackFile] = useState(null);
  const [idFrontPreview, setIdFrontPreview] = useState("");
  const [idBackPreview, setIdBackPreview] = useState("");
  const [checkingImages, setCheckingImages] = useState({ front: false, back: false });
  const [imageErrors, setImageErrors] = useState({ front: "", back: "" });
  const [submitted, setSubmitted] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [autoVerified, setAutoVerified] = useState(false);
  const [voucherAwarded, setVoucherAwarded] = useState(false);
  const [voucherAwardError, setVoucherAwardError] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => () => {
    if (idFrontPreview) URL.revokeObjectURL(idFrontPreview);
    if (idBackPreview) URL.revokeObjectURL(idBackPreview);
  }, [idFrontPreview, idBackPreview]);

  const handleFileSelect = (side, setter, setPreview) => async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) {
      if (file.size > MAX_ID_IMAGE_SIZE) {
        setError("Each ID image must be 8 MB or smaller. Choose a smaller image and try again.");
        return;
      }
      setError("");
      setImageErrors((current) => ({ ...current, [side]: "" }));
      setCheckingImages((current) => ({ ...current, [side]: true }));
      try {
        const { isBlurry } = await checkImageSharpness(file);
        if (isBlurry) {
          setPreview((currentPreview) => {
            if (currentPreview) URL.revokeObjectURL(currentPreview);
            return "";
          });
          setter(null);
          setImageErrors((current) => ({
            ...current,
            [side]: "Photo is too blurry. Please retake or upload a clearer image of your ID.",
          }));
          return;
        }

        const preparedFile = await prepareVerificationImage(file);
        setImageErrors((current) => ({ ...current, [side]: "" }));
        setPreview((currentPreview) => {
          if (currentPreview) URL.revokeObjectURL(currentPreview);
          return URL.createObjectURL(preparedFile);
        });
        setter(preparedFile);
      } catch (imageError) {
        setPreview((currentPreview) => {
          if (currentPreview) URL.revokeObjectURL(currentPreview);
          return "";
        });
        setter(null);
        setImageErrors((current) => ({
          ...current,
          [side]: imageError.message || "Could not check this image. Please choose another.",
        }));
      } finally {
        setCheckingImages((current) => ({ ...current, [side]: false }));
      }
    }
  };

  const handleRemove = (side, setter, setPreview) => () => {
    setPreview((currentPreview) => {
      if (currentPreview) URL.revokeObjectURL(currentPreview);
      return "";
    });
    setter(null);
    setImageErrors((current) => ({ ...current, [side]: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

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

    try {
      if (idFrontFile.size + idBackFile.size > 3_400_000) {
        throw new Error("The two ID photos are still too large to submit. Please retake them closer to the ID or choose smaller photos.");
      }
      const res = await fetch("/api/v1/users/verify", {
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
      setAutoVerified(data.autoVerified === true);
      setOcrProcessing(data.ocrProcessing === true);
      setVoucherAwarded(data.voucherAwarded === true);
      setVoucherAwardError(data.voucherAwardError === true);
      setSubmitted(true);
      setUploading(false);
    } catch (err) {
      console.error("Identity verification submission failed:", err);
      setError(err instanceof TypeError
        ? "Could not reach the verification service. Check your connection and try again."
        : err.message || "Could not submit your verification. Please try again.");
      setUploading(false);
    }
  };

  return (
    <div>
      <Header showNav activeTab="Profile" role={role === "provider" ? "provider" : "client"} />

      <main className="dashboard-page bg-[radial-gradient(ellipse_at_top,_rgba(186,230,253,0.4),_transparent_55%),linear-gradient(180deg,_#eff6ff_0%,_#f8fbff_28rem,_#f8fafc_100%)]">
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
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Identity verification</h1>
          <p className="mx-auto mt-3 max-w-prose text-sm leading-6 text-slate-600">
            Upload both sides of a valid photo ID. We’ll automatically verify clear matches or send your documents to our team for review.
          </p>
        </div>

        {role === "client" && !isVerified && !submitted && (
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

        {submitted && (
          <div className={`mt-4 rounded-2xl border p-4 text-center shadow-sm ${autoVerified ? "border-emerald-200 bg-emerald-50/90" : "border-amber-200 bg-amber-50/90"}`} role="status">
            <p className={`text-sm font-bold ${autoVerified ? "text-emerald-900" : "text-amber-950"}`}>
              {autoVerified ? "Identity verified" : ocrProcessing ? "ID check in progress" : "Documents sent for manual review"}
            </p>
            <p className={`mt-1 text-sm ${autoVerified ? "text-emerald-800" : "text-amber-900"}`}>
              {ocrProcessing
                ? "Your ID images are saved securely. We’re checking them in the background, so you can explore TaskPanda now. Check your profile later for the result."
                : autoVerified
                  ? voucherAwarded
                    ? "Your free ₱50 travel-fee voucher is in your wallet."
                    : voucherAwardError
                      ? "Your identity check passed, but we couldn’t add the voucher right now. Please contact support."
                      : "Your identity check passed."
                  : "Your account will be updated as soon as an administrator reviews your documents. If approved, your free ₱50 travel-fee voucher will be added to your wallet."}
            </p>
            {ocrProcessing && (
              <button
                type="button"
                onClick={() => navigate("/explore")}
                className="dashboard-focus mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sky-800"
              >
                Explore TaskPanda
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-5 rounded-3xl border border-white/80 bg-white/75 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:p-7">
          <ImageUpload
            label="ID Front"
            name="idFront"
            accept="image/jpeg,image/png,image/webp"
            file={idFrontFile}
            preview={idFrontPreview}
            onSelect={handleFileSelect("front", setIdFrontFile, setIdFrontPreview)}
            onRemove={handleRemove("front", setIdFrontFile, setIdFrontPreview)}
            disabled={uploading || submitted || checkingImages.front}
            isChecking={checkingImages.front}
            imageError={imageErrors.front}
          />

          <ImageUpload
            label="ID Back"
            name="idBack"
            accept="image/jpeg,image/png,image/webp"
            file={idBackFile}
            preview={idBackPreview}
            onSelect={handleFileSelect("back", setIdBackFile, setIdBackPreview)}
            onRemove={handleRemove("back", setIdBackFile, setIdBackPreview)}
            disabled={uploading || submitted || checkingImages.back}
            isChecking={checkingImages.back}
            imageError={imageErrors.back}
          />

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
              disabled={uploading || submitted || checkingImages.front || checkingImages.back}
              className="dashboard-focus flex-1 rounded-xl border border-slate-300 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || submitted || checkingImages.front || checkingImages.back}
              className="dashboard-focus flex-1 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(15,23,42,0.15)] transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? "Uploading..." : "Submit Verification"}
            </button>
          </div>
        </form>
        </div>
      </main>
    </div>
  );
}
