import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import PHLocationPicker from "../components/PHLocationPicker.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const getFormFromUser = (user = {}) => ({
  fullName: user.fullName || [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" "),
  username: user.username || "",
  email: user.email || "",
  phone: user.mobileNumber || "",
  province: user.province || "",
  city: user.city || "",
  barangay: user.barangay || "",
  provinceCode: "",
  cityCode: "",
  barangayCode: "",
  geoLocation: user.geoLocation || null,
  bio: user.bio || "",
  professions: (user.professions || []).join(", "),
});

const comparableForm = ({ provinceCode, cityCode, barangayCode, ...values }) => values;

function validateForm(form, role) {
  const errors = {};
  if (!form.fullName.trim()) errors.fullName = "Full name is required";
  if (!form.username.trim()) errors.username = "Username is required";
    else if (!/^[A-Za-z0-9_.-]{3,30}$/.test(form.username) || /^\S+@\S+\.\S+$/.test(form.username)) errors.username = "Use 3-30 letters, numbers, dots, underscores, or hyphens";
  if (!form.email.trim()) errors.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Invalid email format";
  if (form.phone && !/^09\d{9}$/.test(form.phone)) errors.phone = "Enter an 11-digit number starting with 09";
  if (!form.province || !form.city || !form.barangay) errors.location = "Select your province, city, and barangay";
  if (role === "provider" && !form.professions.split(",").some((profession) => profession.trim())) errors.professions = "Add at least one service you offer";
  if (form.bio.length > 500) errors.bio = "Maximum 500 characters";
  return errors;
}

export default function EditProfilePage() {
  const navigate = useNavigate();
  const { user, token, role, updateUser, refreshProfile, isAuthLoading } = useAuth();
  const [form, setForm] = useState(() => getFormFromUser());
  const [saved, setSaved] = useState(false);
  const [isSavedToastFading, setIsSavedToastFading] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [profileImage, setProfileImage] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoError, setPhotoError] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [dirty, setDirty] = useState(false);
  const initialFormRef = useRef(JSON.stringify(getFormFromUser()));
  const photoInputRef = useRef(null);
  const savedToastTimersRef = useRef({ fade: null, hide: null });

  const dismissSavedToast = () => {
    window.clearTimeout(savedToastTimersRef.current.fade);
    window.clearTimeout(savedToastTimersRef.current.hide);
    setSaved(false);
  };

  const showSavedToast = () => {
    window.clearTimeout(savedToastTimersRef.current.fade);
    window.clearTimeout(savedToastTimersRef.current.hide);
    setSaved(true);
    setIsSavedToastFading(false);
    savedToastTimersRef.current.fade = window.setTimeout(() => setIsSavedToastFading(true), 2300);
    savedToastTimersRef.current.hide = window.setTimeout(() => setSaved(false), 3000);
  };

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (isAuthLoading) return;
    const currentForm = getFormFromUser(user);
    const currentSnapshot = JSON.stringify(comparableForm(currentForm));
    if (currentSnapshot !== initialFormRef.current) {
      setForm(currentForm);
      initialFormRef.current = currentSnapshot;
    }
    setProfileImage(user?.profileImage || "");
  }, [isAuthLoading, user]);

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  useEffect(() => () => {
    window.clearTimeout(savedToastTimersRef.current.fade);
    window.clearTimeout(savedToastTimersRef.current.hide);
  }, []);

  useEffect(() => {
    setDirty(JSON.stringify(comparableForm(form)) !== initialFormRef.current);
  }, [form]);

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
    const nextForm = { ...form, [name]: value };
    setForm(nextForm);
    setDirty(JSON.stringify(comparableForm(nextForm)) !== initialFormRef.current);
    setServerError("");
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleCaptureLocation = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Location is not available in this browser.");
      return;
    }

    let bestPosition = null;
    let attempts = 0;

    const tryCapture = () => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const candidate = {
            longitude: Number(coords.longitude.toFixed(6)),
            latitude: Number(coords.latitude.toFixed(6)),
            accuracy: Number(coords.accuracy || 0),
          };

          if (!bestPosition || candidate.accuracy < bestPosition.accuracy) {
            bestPosition = candidate;
          }

          if (candidate.accuracy <= 50 || attempts >= 2) {
            const nextForm = {
              ...form,
              geoLocation: {
                type: "Point",
                coordinates: [bestPosition.longitude, bestPosition.latitude],
              },
            };
            setForm(nextForm);
            setDirty(JSON.stringify(comparableForm(nextForm)) !== initialFormRef.current);
            return;
          }

          attempts += 1;
          tryCapture();
        },
        () => {
          if (attempts >= 2) {
            setLocationError("Unable to get a precise location. Try again or set a nearby-search pin manually.");
            return;
          }
          attempts += 1;
          tryCapture();
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    };

    tryCapture();
  };

  const handleProfilePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 4 * 1024 * 1024) {
      setPhotoError("Choose a JPEG, PNG, WebP, or GIF image up to 4 MB.");
      return;
    }
    setSelectedPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving || (!dirty && !selectedPhoto)) return;
    const validationErrors = validateForm(form, role);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    if (!token) {
      setServerError("Your session expired. Sign in again to save profile changes.");
      return;
    }

    setIsSaving(true);
    setServerError("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: form.fullName,
          username: form.username,
          mobileNumber: form.phone,
          address: [form.barangay, form.city, form.province].filter(Boolean).join(", "),
          province: form.province,
          city: form.city,
          barangay: form.barangay,
          geoLocation: form.geoLocation || undefined,
          bio: form.bio,
          professions: form.professions.split(",").map((profession) => profession.trim()).filter(Boolean),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.field) setErrors((previous) => ({ ...previous, [data.field]: data.message }));
        setServerError(data.message || "Could not save your profile.");
        return;
      }

      let savedUser = data.user;
      if (selectedPhoto) {
        setIsUploadingPhoto(true);
        try {
          const photoFormData = new FormData();
          photoFormData.append("photo", selectedPhoto);
          const photoResponse = await fetch("/api/profile/photo", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: photoFormData,
          });
          const photoData = await photoResponse.json().catch(() => ({}));
          if (!photoResponse.ok || !photoData.user) throw new Error(photoData.message || "Could not upload your photo.");
          savedUser = photoData.user;
          setProfileImage(savedUser.profileImage || "");
          setSelectedPhoto(null);
          setPhotoPreview("");
          setPhotoError("");
        } catch (photoUploadError) {
          updateUser(data.user);
          const savedForm = getFormFromUser(data.user);
          setForm(savedForm);
          initialFormRef.current = JSON.stringify(comparableForm(savedForm));
          setDirty(false);
          setPhotoError(photoUploadError.message || "Your profile details were saved, but the photo could not be uploaded. Try saving again.");
          return;
        } finally {
          setIsUploadingPhoto(false);
        }
      }

      updateUser(savedUser);
      setLocationError(data.locationWarning || "");
      const savedForm = getFormFromUser(savedUser);
      setForm(savedForm);
      initialFormRef.current = JSON.stringify(comparableForm(savedForm));
      setDirty(false);
      showSavedToast();
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (dirty) {
      if (window.confirm("You have unsaved changes. Are you sure you want to discard them?")) {
        setForm(getFormFromUser(user));
        setErrors({});
        setDirty(false);
        navigate("/profile");
      }
    } else {
      navigate("/profile");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-16 pb-12">
      <Header showNav activeTab="Profile" role={role === "provider" ? "provider" : undefined} />

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

        <div className="rounded-2xl bg-white p-8 shadow-sm text-center">
          <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={handleProfilePhotoChange} />
          <button type="button" onClick={() => photoInputRef.current?.click()} disabled={isUploadingPhoto} aria-label="Choose profile photo" title="Choose profile photo" className={`group relative mx-auto flex aspect-square h-20 w-20 items-center justify-center overflow-hidden rounded-full text-2xl font-bold disabled:cursor-wait ${photoPreview || profileImage ? "bg-transparent text-transparent ring-0" : "bg-primary-100 text-primary-700 ring-4 ring-primary-50"}`} style={{ clipPath: "circle(50%)" }}>
            {photoPreview || profileImage
              ? <img src={photoPreview || profileImage} alt="Profile" className="block aspect-square h-full w-full shrink-0 rounded-full object-cover" style={{ clipPath: "circle(50%)", objectPosition: "center" }} />
              : <span>{form.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?"}</span>}
            <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100" style={{ clipPath: "circle(50%)" }}>{isUploadingPhoto ? "Uploading" : "Edit photo"}</span>
          </button>
          <p className="mt-2 text-xs text-gray-500">{isUploadingPhoto ? "Uploading photo..." : "Click to choose a profile photo"}</p>
          {photoError && <p role="alert" className="mt-1 text-xs text-red-600">{photoError}</p>}
          <h1 className="mt-6 text-2xl font-bold text-gray-900">{user?.fullName && user?.username ? "Edit Profile" : "Set Up Your Profile"}</h1>
          <p className="text-sm text-gray-500">{role === "provider" ? "Add your service details so clients know what you offer." : "Add your personal and location details."}</p>
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
              readOnly
              className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500 outline-none"
              required
            />
          </div>

          {role === "provider" && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Services / professions</label>
              <input
                type="text"
                name="professions"
                value={form.professions}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                placeholder="Carpentry, plumbing"
                aria-invalid={Boolean(errors.professions)}
              />
              {errors.professions ? <p className="mt-1 text-xs text-red-500">{errors.professions}</p> : <p className="mt-1 text-xs text-gray-400">Separate each service with a comma.</p>}
            </div>
          )}

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
            <p className="mb-2 block text-sm font-medium text-gray-700">
              Location <span className="text-red-500">*</span>
            </p>
            <PHLocationPicker formData={form} setFormData={setForm} />
            {errors.location && <p className="mt-1 text-xs text-red-500">{errors.location}</p>}
            <button type="button" onClick={handleCaptureLocation} className="mt-2 text-sm font-medium text-primary-700 hover:text-primary-900">
              {form.geoLocation?.coordinates ? "Update nearby-search pin" : "Set nearby-search pin"}
            </button>
            <p className="mt-1 text-xs text-gray-500">Your precise pin is used only for nearby matching and isn’t shown publicly.</p>
            {locationError && <p className="mt-1 text-xs text-red-600" role="alert">{locationError}</p>}
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

          {serverError && <p className="text-sm text-red-600" role="alert">{serverError}</p>}

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
              disabled={isSaving || (!dirty && !selectedPhoto)}
              className="flex-1 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
      {saved && (
        <div className={`fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-lg border border-green-200 bg-white px-4 py-3 text-sm text-green-800 shadow-lg transition-opacity duration-500 ${isSavedToastFading ? "opacity-0" : "opacity-100"}`} role="status" aria-live="polite">
          <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">✓</span>
          <p className="flex-1 font-semibold">Profile saved successfully!</p>
          <button type="button" onClick={dismissSavedToast} className="text-green-600 hover:text-green-900" aria-label="Dismiss notification">×</button>
        </div>
      )}
    </div>
  );
}
