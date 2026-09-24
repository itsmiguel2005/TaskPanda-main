import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";

const initialForm = {
  fullName: "Miguel",
  username: "miguel",
  email: "miguel@example.com",
  phone: "+63 912 345 6789",
  location: "Dagupan City, Pangasinan",
  bio: "Homeowner based in Dagupan. Looking for reliable local tradespeople for home repairs and maintenance.",
};

function validateForm(form) {
  const errors = {};
  if (!form.fullName.trim()) errors.fullName = "Full name is required";
  if (!form.username.trim()) errors.username = "Username is required";
  else if (form.username.length < 3) errors.username = "Minimum 3 characters";
  if (!form.email.trim()) errors.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Invalid email format";
  if (form.phone && !/^[+]?[\d\s\-()]{7,}$/.test(form.phone)) errors.phone = "Invalid phone format";
  if (!form.location.trim()) errors.location = "Location is required";
  if (form.bio.length > 500) errors.bio = "Maximum 500 characters";
  return errors;
}

export default function EditProfilePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState("");
  const [dirty, setDirty] = useState(false);
  const fileInputRef = useRef(null);
  const initialFormRef = useRef(JSON.stringify(initialForm));

  useEffect(() => {
    const handler = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setDirty(JSON.stringify(form) !== initialFormRef.current);
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("File too large. Maximum 5MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarSrc(reader.result);
        setDirty(true);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationErrors = validateForm(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    setSaved(true);
    initialFormRef.current = JSON.stringify(form);
    setDirty(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleCancel = () => {
    if (dirty) {
      if (window.confirm("You have unsaved changes. Are you sure you want to discard them?")) {
        setForm(initialForm);
        setErrors({});
        setDirty(false);
        navigate("/profile");
      }
    } else {
      navigate("/profile");
    }
  };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="min-h-screen bg-gray-50 pt-16 pb-12">
      <Header showNav activeTab="Profile" />

      <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8">
        <button
          onClick={handleCancel}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
          </svg>
          Back to Profile
        </button>

        {saved && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-center animate-fade-in">
            <span className="text-lg">✅</span>
            <p className="mt-1 text-sm font-medium text-green-800">Profile saved successfully!</p>
          </div>
        )}

        <div className="rounded-2xl bg-white p-8 shadow-sm text-center">
          <div className="relative inline-block">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary-100 text-2xl font-bold text-primary-700 ring-4 ring-primary-50 overflow-hidden">
              {avatarSrc ? (
                <img src={avatarSrc} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                form.fullName.charAt(0)
              )}
            </div>
            <button
              onClick={() => setShowPhotoUpload(!showPhotoUpload)}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm ring-2 ring-white transition hover:bg-primary-700"
              aria-label="Change photo"
              title="Change photo"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.47 13.75a.75.75 0 010-1.06l7.25-7.25a.75.75 0 011.06 0z" clipRule="evenodd" />
              </svg>
            </button>
            {showPhotoUpload && (
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 mb-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-primary-700 shadow-md ring-1 ring-gray-200 transition hover:bg-gray-50"
                >
                  Upload Photo
                </button>
              </div>
            )}
          </div>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Edit Profile</h1>
          <p className="text-sm text-gray-500">Update your personal information</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              style={{ borderColor: errors.fullName ? "#ef4444" : "#e5e7eb" }}
              required
            />
            {errors.fullName && <p className="mt-1 text-xs text-red-500">{errors.fullName}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Username <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              style={{ borderColor: errors.username ? "#ef4444" : "#e5e7eb" }}
              required
            />
            {errors.username && <p className="mt-1 text-xs text-red-500">{errors.username}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              style={{ borderColor: errors.email ? "#ef4444" : "#e5e7eb" }}
              required
            />
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Phone</label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              style={{ borderColor: errors.phone ? "#ef4444" : "#e5e7eb" }}
            />
            {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Location <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="location"
              value={form.location}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              style={{ borderColor: errors.location ? "#ef4444" : "#e5e7eb" }}
              required
            />
            {errors.location && <p className="mt-1 text-xs text-red-500">{errors.location}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Bio</label>
            <textarea
              name="bio"
              value={form.bio}
              onChange={handleChange}
              rows={4}
              className="mt-1 w-full rounded-lg border px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              style={{ borderColor: errors.bio ? "#ef4444" : "#e5e7eb" }}
              placeholder="Tell us a bit about yourself..."
            />
            <div className="mt-1 flex items-center justify-between">
              {errors.bio ? (
                <p className="text-xs text-red-500">{errors.bio}</p>
              ) : (
                <p />
              )}
              <p className={`text-xs ${form.bio.length > 450 ? "text-amber-500" : "text-gray-400"}`}>
                {form.bio.length}/500
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
