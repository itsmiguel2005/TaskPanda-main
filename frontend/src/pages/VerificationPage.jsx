import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const MAX_ID_IMAGE_SIZE = 2 * 1024 * 1024;

function ImageUpload({ label, name, accept, file, preview, onSelect, onRemove, disabled }) {
  const inputRef = useRef(null);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">
        {label} <span className="text-red-500">*</span>
      </label>
      <button
        type="button"
        aria-label={`${label}: ${file ? "replace image" : "choose image"}`}
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="dashboard-focus mt-2 flex w-full items-center gap-4 rounded-2xl border border-dashed border-sky-300 bg-sky-50/55 p-4 text-left transition hover:border-sky-500 hover:bg-sky-50"
      >
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
        <div>
          <p className="text-sm font-semibold text-slate-800">{file ? "Replace image" : "Choose image"}</p>
          <p className="mt-1 text-xs text-slate-600">JPEG, PNG, or WebP · up to 2 MB</p>
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={onSelect}
      />
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
  const { verify, token, role } = useAuth();
  const profilePath = role === "provider" ? "/provider-profile" : "/profile";
  const [idFrontFile, setIdFrontFile] = useState(null);
  const [idBackFile, setIdBackFile] = useState(null);
  const [idFrontPreview, setIdFrontPreview] = useState("");
  const [idBackPreview, setIdBackPreview] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [autoVerified, setAutoVerified] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => () => {
    if (idFrontPreview) URL.revokeObjectURL(idFrontPreview);
    if (idBackPreview) URL.revokeObjectURL(idBackPreview);
  }, [idFrontPreview, idBackPreview]);

  const handleFileSelect = (setter, setPreview) => (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > MAX_ID_IMAGE_SIZE) {
        setError("Each ID image must be 2 MB or smaller. Choose a smaller image and try again.");
        e.target.value = "";
        return;
      }
      setError("");
      setPreview((currentPreview) => {
        if (currentPreview) URL.revokeObjectURL(currentPreview);
        return URL.createObjectURL(file);
      });
      setter(file);
    }
    e.target.value = "";
  };

  const handleRemove = (setter, setPreview) => () => {
    setPreview((currentPreview) => {
      if (currentPreview) URL.revokeObjectURL(currentPreview);
      return "";
    });
    setter(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!idFrontFile || !idBackFile) {
      setError("Please upload both ID front and ID back images");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("idFront", idFrontFile);
    formData.append("idBack", idBackFile);

    try {
      const res = await fetch("/api/v1/users/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Verification failed");
        setUploading(false);
        return;
      }
      verify(data);
      setAutoVerified(data.autoVerified === true);
      setSubmitted(true);
      setTimeout(() => {
        navigate(profilePath);
      }, 2000);
    } catch (err) {
      setError("Network error. Please try again.");
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

        {submitted && (
          <div className={`mt-4 rounded-2xl border p-4 text-center shadow-sm ${autoVerified ? "border-emerald-200 bg-emerald-50/90" : "border-amber-200 bg-amber-50/90"}`} role="status">
            <p className={`text-sm font-bold ${autoVerified ? "text-emerald-900" : "text-amber-950"}`}>
              {autoVerified ? "Identity verified" : "Documents sent for manual review"}
            </p>
            <p className={`mt-1 text-sm ${autoVerified ? "text-emerald-800" : "text-amber-900"}`}>
              {autoVerified ? "Your identity check passed. Returning to your profile…" : "Your account will be updated as soon as an administrator reviews your documents."}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-5 rounded-3xl border border-white/80 bg-white/75 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:p-7">
          <ImageUpload
            label="ID Front"
            name="idFront"
            accept="image/jpeg,image/png,image/webp"
            file={idFrontFile}
            preview={idFrontPreview}
            onSelect={handleFileSelect(setIdFrontFile, setIdFrontPreview)}
            onRemove={handleRemove(setIdFrontFile, setIdFrontPreview)}
            disabled={uploading || submitted}
          />

          <ImageUpload
            label="ID Back"
            name="idBack"
            accept="image/jpeg,image/png,image/webp"
            file={idBackFile}
            preview={idBackPreview}
            onSelect={handleFileSelect(setIdBackFile, setIdBackPreview)}
            onRemove={handleRemove(setIdBackFile, setIdBackPreview)}
            disabled={uploading || submitted}
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
                    We’re uploading both images, checking your ID, and saving your submission. This can take a little while; keep this page open.
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
              disabled={uploading || submitted}
              className="dashboard-focus flex-1 rounded-xl border border-slate-300 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || submitted}
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
