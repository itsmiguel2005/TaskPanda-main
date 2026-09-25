import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function ImageUpload({ label, name, accept, file, preview, onSelect, onRemove, error }) {
  const inputRef = useRef(null);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">
        {label} <span className="text-red-500">*</span>
      </label>
      <div
        className="mt-1 flex cursor-pointer items-center gap-4 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4 transition hover:border-primary-400 hover:bg-primary-50"
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          <img src={preview} alt={label} className="h-16 w-16 rounded-lg object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-200 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-gray-700">Click to upload</p>
          <p className="text-xs text-gray-400">PNG, JPG, WEBP up to 5MB</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        className="hidden"
        onChange={onSelect}
      />
      {file && (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-gray-500 truncate max-w-[200px]">{file.name}</p>
          <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:text-red-700">Remove</button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

export default function VerificationPage() {
  const navigate = useNavigate();
  const { verify } = useAuth();
  const [idFrontFile, setIdFrontFile] = useState(null);
  const [idBackFile, setIdBackFile] = useState(null);
  const [idFrontPreview, setIdFrontPreview] = useState("");
  const [idBackPreview, setIdBackPreview] = useState("");
  const [certificate, setCertificate] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (setter, setPreview) => (e) => {
    const file = e.target.files[0];
    if (file) {
      setter(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleRemove = (setter, setPreview) => () => {
    setter(null);
    setPreview("");
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
    if (certificate.trim()) {
      formData.append("certificate", certificate.trim());
    }

    try {
      const res = await fetch("/api/verify", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed");
        setUploading(false);
        return;
      }
      verify();
      setSubmitted(true);
      setTimeout(() => {
        navigate("/profile");
      }, 2000);
    } catch (err) {
      setError("Network error. Please try again.");
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-16 pb-12">
      <Header showNav activeTab="Profile" />

      <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate("/profile")}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
          </svg>
          Back to Profile
        </button>

        <div className="rounded-2xl bg-white p-8 shadow-sm text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-2xl">
            🪪
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Identity Verification</h1>
          <p className="mt-2 text-sm text-gray-500">
            Upload front and back of your valid ID to unlock all features
          </p>
        </div>

        {submitted && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-center animate-fade-in">
            <span className="text-lg">&#10003;</span>
            <p className="mt-1 text-sm font-medium text-green-800">Verification submitted! Redirecting...</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <ImageUpload
            label="ID Front"
            name="idFront"
            accept="image/*"
            file={idFrontFile}
            preview={idFrontPreview}
            onSelect={handleFileSelect(setIdFrontFile, setIdFrontPreview)}
            onRemove={handleRemove(setIdFrontFile, setIdFrontPreview)}
          />

          <ImageUpload
            label="ID Back"
            name="idBack"
            accept="image/*"
            file={idBackFile}
            preview={idBackPreview}
            onSelect={handleFileSelect(setIdBackFile, setIdBackPreview)}
            onRemove={handleRemove(setIdBackFile, setIdBackPreview)}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Trade Certificate <span className="text-gray-400">(Optional)</span>
            </label>
            <input
              type="text"
              value={certificate}
              onChange={(e) => setCertificate(e.target.value)}
              placeholder="e.g. TESDA NC II, Diploma URL"
              className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
            <p className="mt-1 text-xs text-gray-400">
              Provide your trade certification if available
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate("/profile")}
              className="flex-1 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="flex-1 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Submit Verification"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
