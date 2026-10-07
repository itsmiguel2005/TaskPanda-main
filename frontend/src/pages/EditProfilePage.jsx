import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import AccountLocationPicker from "../components/AccountLocationPicker.jsx";
import ProfessionSelector from "../components/ProfessionSelector.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const buildFullName = ({ firstName = "", middleName = "", lastName = "" } = {}) => [firstName, middleName, lastName].filter(Boolean).join(" ").trim();

const getFormFromUser = (user = {}) => {
  const rawFullName = (user.fullName || "").trim();
  const parsedParts = rawFullName ? rawFullName.split(/\s+/).filter(Boolean) : [];
  const inferredFirstName = user.firstName || parsedParts[0] || "";
  const inferredMiddleName = user.middleName || (parsedParts.length > 2 ? parsedParts.slice(1, -1).join(" ") : "");
  const inferredLastName = user.lastName || (parsedParts.length > 1 ? parsedParts.at(-1) : "");

  return {
    fullName: user.fullName || buildFullName({
      firstName: inferredFirstName,
      middleName: inferredMiddleName,
      lastName: inferredLastName,
    }),
    firstName: inferredFirstName,
    middleName: inferredMiddleName,
    lastName: inferredLastName,
    username: user.username || "",
    email: user.email || "",
    phone: user.mobileNumber || "",
    address: user.address || "",
    province: user.province || "",
    city: user.city || "",
    barangay: user.barangay || "",
    geoLocation: user.geoLocation || null,
    bio: user.bio || "",
    professions: Array.isArray(user.professions) ? [...user.professions] : [],
  };
};

const comparableForm = (values) => values;

function validateForm(form, role) {
  const errors = {};
  if (!form.lastName.trim()) errors.lastName = "Last name is required";
  if (!form.firstName.trim()) errors.firstName = "First name is required";
  if (!form.username.trim()) errors.username = "Username is required";
    else if (!/^[A-Za-z0-9_.-]{3,30}$/.test(form.username) || /^\S+@\S+\.\S+$/.test(form.username)) errors.username = "Use 3-30 letters, numbers, dots, underscores, or hyphens";
  if (!form.email.trim()) errors.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Invalid email format";
  if (form.phone && !/^09\d{9}$/.test(form.phone)) errors.phone = "Enter an 11-digit number starting with 09";
  if (!form.province || !form.city || !form.barangay) errors.location = "Confirm your barangay, city, and province.";
  else if (!Array.isArray(form.geoLocation?.coordinates) || form.geoLocation.coordinates.length !== 2) errors.location = "Pin your exact location on the map.";
  if (role === "provider" && !form.professions.some((profession) => profession.trim())) errors.professions = "Add at least one service you offer";
  if (form.bio.length > 500) errors.bio = "Maximum 500 characters";
  return errors;
}

export default function EditProfilePage() {
  const navigate = useNavigate();
  const { user, token, role, updateUser, refreshProfile, isAuthLoading } = useAuth();
  const profilePath = role === "provider" ? "/provider-profile" : "/profile";
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
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const initialFormRef = useRef(JSON.stringify(getFormFromUser()));
  const photoInputRef = useRef(null);
  const discardDialogRef = useRef(null);
  const keepEditingButtonRef = useRef(null);
  const savedToastTimersRef = useRef({ fade: null, hide: null });
  const hasUnsavedChanges = dirty || Boolean(selectedPhoto);

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
    if (!isDiscardDialogOpen) return undefined;
    keepEditingButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsDiscardDialogOpen(false);
      if (event.key !== "Tab") return;
      const buttons = discardDialogRef.current?.querySelectorAll("button:not(:disabled)");
      if (!buttons?.length) return;
      const firstButton = buttons[0];
      const lastButton = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === firstButton) {
        event.preventDefault();
        lastButton.focus();
      } else if (!event.shiftKey && document.activeElement === lastButton) {
        event.preventDefault();
        firstButton.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDiscardDialogOpen]);

  useEffect(() => {
    const handler = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const nextForm = {
      ...form,
      [name]: value,
      fullName: buildFullName({
        firstName: name === "firstName" ? value : form.firstName,
        middleName: name === "middleName" ? value : form.middleName,
        lastName: name === "lastName" ? value : form.lastName,
      }),
    };
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

  const handleProfessionsChange = (professions) => {
    const nextForm = { ...form, professions };
    setForm(nextForm);
    setDirty(JSON.stringify(comparableForm(nextForm)) !== initialFormRef.current);
    setServerError("");
    if (errors.professions) {
      setErrors((previous) => {
        const next = { ...previous };
        delete next.professions;
        return next;
      });
    }
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
          firstName: form.firstName,
          middleName: form.middleName,
          lastName: form.lastName,
          username: form.username,
          mobileNumber: form.phone,
          address: form.address,
          province: form.province,
          city: form.city,
          barangay: form.barangay,
          geoLocation: form.geoLocation || undefined,
          bio: form.bio,
          professions: form.professions.map((profession) => profession.trim()).filter(Boolean),
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
    if (hasUnsavedChanges) {
      setIsDiscardDialogOpen(true);
    } else {
      navigate(profilePath);
    }
  };

  const discardChanges = () => {
    setForm(getFormFromUser(user));
    setSelectedPhoto(null);
    setPhotoPreview("");
    setPhotoError("");
    setErrors({});
    setDirty(false);
    setIsDiscardDialogOpen(false);
    navigate(profilePath);
  };

  return (
    <div>
      <Header showNav activeTab="Profile" role={role === "provider" ? "provider" : undefined} />

      <main className="dashboard-page">
      <div className="dashboard-shell max-w-3xl">
        <button
          onClick={handleCancel}
          className="dashboard-focus mb-5 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 transition hover:text-slate-950 focus-visible:outline-blue-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
          </svg>
          Back to Profile
        </button>

        <div className="dashboard-panel flex flex-col items-center gap-4 p-5 text-center sm:flex-row sm:text-left">
          <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={handleProfilePhotoChange} />
          <button type="button" onClick={() => photoInputRef.current?.click()} disabled={isUploadingPhoto} aria-label="Choose profile photo" title="Choose profile photo" className={`avatar-shell group relative h-20 w-20 shrink-0 border-4 border-sky-50 text-2xl font-bold disabled:cursor-wait ${photoPreview || profileImage ? "bg-transparent text-transparent" : "bg-sky-100 text-sky-800"}`}>
            {photoPreview || profileImage
              ? <img src={photoPreview || profileImage} alt="Profile" className="avatar-image" />
              : <span>{form.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?"}</span>}
            <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">{isUploadingPhoto ? "Uploading" : "Edit photo"}</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-slate-950">{user?.fullName && user?.username ? "Edit profile" : "Set up your profile"}</h1>
            <p className="mt-1 text-sm leading-6 text-slate-600">{role === "provider" ? "Add your service details so local clients know what you offer." : "Keep your personal and location details up to date."}</p>
            <p className="mt-2 text-xs text-slate-600">{isUploadingPhoto ? "Uploading photo..." : "Choose a profile photo"}</p>
            {photoError && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{photoError}</p>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="dashboard-panel profile-form mt-5 space-y-5 p-5 sm:p-8">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-950">Personal information</h2>
            <p className="mt-1 text-sm text-slate-600">Fields marked with <span className="font-semibold text-red-700">*</span> are required.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                style={{ borderColor: errors.lastName ? "#ef4444" : "#e5e7eb" }}
                required
              />
              {errors.lastName && <p className="mt-1 text-xs text-red-500">{errors.lastName}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                style={{ borderColor: errors.firstName ? "#ef4444" : "#e5e7eb" }}
                required
              />
              {errors.firstName && <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Middle Name <span className="text-xs font-normal text-slate-500">(Optional)</span>
              </label>
              <input
                type="text"
                name="middleName"
                value={form.middleName}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                style={{ borderColor: errors.middleName ? "#ef4444" : "#e5e7eb" }}
              />
              {errors.middleName && <p className="mt-1 text-xs text-red-500">{errors.middleName}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              type="text"
              name="username"
              value={form.username}
              readOnly
              className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500 outline-none"
              required
            />
            <p className="mt-1 text-xs text-slate-500">Your username can't be changed.</p>
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
              <label htmlFor="professions" className="block text-sm font-medium text-gray-700">Profession / Trade</label>
              <div className="mt-1.5">
                <ProfessionSelector
                  id="professions"
                  tone="blue"
                  value={form.professions}
                  onChange={handleProfessionsChange}
                  placeholder="Type or select a profession..."
                  invalid={Boolean(errors.professions)}
                />
              </div>
              {errors.professions
                ? <p className="mt-1 text-xs font-medium text-red-700">{errors.professions}</p>
                : <p className="mt-1 text-xs text-slate-600">Choose from the list or type a custom trade. Press Enter to add.</p>}
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
            <AccountLocationPicker
              formData={form}
              setFormData={setForm}
              token={token}
              provider={role === "provider"}
            />
            {errors.location && <p className="mt-1 text-xs text-red-500">{errors.location}</p>}
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

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="dashboard-secondary-button dashboard-focus w-full px-5 py-3 text-sm sm:w-auto sm:min-w-32"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || (!dirty && !selectedPhoto)}
              className="dashboard-primary-button dashboard-focus w-full px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-40"
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
      {isDiscardDialogOpen && (
        <div
          className="fixed inset-0 z-2147483647 flex items-center justify-center bg-slate-950/55 p-4"
          onClick={() => setIsDiscardDialogOpen(false)}
        >
          <section
            ref={discardDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-profile-title"
            aria-describedby="discard-profile-description"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800" aria-hidden="true">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 8v4m0 4h.01M10.3 3.86 1.82 18.5A2 2 0 0 0 3.55 21h16.9a2 2 0 0 0 1.73-2.5L13.7 3.86a2 2 0 0 0-3.4 0Z" />
                </svg>
              </span>
              <div>
                <h2 id="discard-profile-title" className="text-lg font-bold text-slate-950">Discard unsaved changes?</h2>
                <p id="discard-profile-description" className="mt-2 text-sm leading-6 text-slate-600">
                  Your profile edits{selectedPhoto ? " and selected photo" : ""} haven’t been saved. If you leave now, those changes will be lost.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                ref={keepEditingButtonRef}
                type="button"
                onClick={() => setIsDiscardDialogOpen(false)}
                className="dashboard-secondary-button dashboard-focus w-full px-4 py-2.5 text-sm sm:w-auto"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={discardChanges}
                className="dashboard-focus w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 focus-visible:outline-red-700 sm:w-auto"
              >
                Discard changes
              </button>
            </div>
          </section>
        </div>
      )}
      </main>
    </div>
  );
}
