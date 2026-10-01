import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIME_SLOTS = ["7:30 AM", "9:00 AM", "10:30 AM", "1:30 PM", "3:00 PM", "4:30 PM", "6:00 PM"];

function isPastTimeSlot(dateValue, timeValue, now) {
  if (!dateValue || !timeValue) return false;

  const [year, month, day] = dateValue.split("-").map(Number);
  const selectedDay = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (selectedDay < today) return true;
  if (selectedDay > today) return false;

  const [time, period] = timeValue.split(" ");
  const [hour, minute] = time.split(":").map(Number);
  const slotMinutes = (hour % 12 + (period === "PM" ? 12 : 0)) * 60 + minute;
  return slotMinutes <= now.getHours() * 60 + now.getMinutes();
}

function CalendarPicker({ selectedDate, onSelect, onClose }) {
  const selectedDateParts = selectedDate ? selectedDate.split("-").map(Number) : null;
  const [viewDate, setViewDate] = useState(selectedDateParts
    ? new Date(selectedDateParts[0], selectedDateParts[1] - 1, selectedDateParts[2])
    : new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(d);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prevMonth}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Previous month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-800">
          {MONTHS[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Next month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">
            {d}
          </div>
        ))}
        {days.map((d, i) => {
          if (d === null) return <div key={`empty-${i}`} />;
          const dateObj = new Date(year, month, d);
          const isToday = dateObj.getTime() === today.getTime();
          const isPast = dateObj < today;
          const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isSelected = selectedDate === dateKey;
          return (
            <button
              key={d}
              type="button"
              disabled={isPast}
              onClick={() => { onSelect(dateKey); onClose(); }}
              className={`rounded-full py-1 text-sm transition ${
                isSelected
                  ? "bg-gray-900 text-white font-semibold"
                  : isPast
                  ? "cursor-not-allowed text-gray-300"
                  : isToday
                  ? "bg-gray-100 text-gray-900 font-semibold"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function RequestBookingModal({ provider, onClose, onSubmit, initialValues = {} }) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [taskDescription, setTaskDescription] = useState(initialValues.task || "");
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [bookedSlots, setBookedSlots] = useState([]);
  const [availabilityStatus, setAvailabilityStatus] = useState("loading");
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [urgency, setUrgency] = useState(initialValues.urgency || "Flexible");
  const [offer, setOffer] = useState(initialValues.offer == null ? "" : String(initialValues.offer));
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const nextPreviews = selectedFiles.map((file) => URL.createObjectURL(file));
    setPhotoPreviews(nextPreviews);
    return () => nextPreviews.forEach((preview) => URL.revokeObjectURL(preview));
  }, [selectedFiles]);

  useEffect(() => {
    if (!provider) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [provider, onClose]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!provider?._id || !token) {
      setAvailabilityStatus("loading");
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    let isLoadingAvailability = false;
    setAvailabilityStatus("loading");
    const refreshAvailability = async () => {
      if (isLoadingAvailability) return;
      isLoadingAvailability = true;
      try {
        const response = await fetch(`/api/bookings/availability/${provider._id}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Could not load provider availability.");
        if (active) {
          setBookedSlots(Array.isArray(data.bookedSlots) ? data.bookedSlots : []);
          setAvailabilityStatus("loaded");
        }
      } catch (error) {
        if (active && error.name !== "AbortError") setAvailabilityStatus("error");
      } finally {
        isLoadingAvailability = false;
      }
    };
    void refreshAvailability();
    const intervalId = window.setInterval(refreshAvailability, 5000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [provider?._id, token, availabilityRetry]);

  useEffect(() => {
    if (isPastTimeSlot(selectedDate, selectedTime, currentTime)) setSelectedTime("");
  }, [currentTime, selectedDate, selectedTime]);

  useEffect(() => {
    if (availabilityStatus !== "loaded" || !selectedDate || !selectedTime) return;
    if (bookedSlots.some((slot) => slot.date === selectedDate && slot.timeSlot === selectedTime)) {
      setSelectedTime("");
      setFormError("That time slot was just booked. Please choose another time.");
    }
  }, [availabilityStatus, bookedSlots, selectedDate, selectedTime]);

  if (!provider) return null;

  const name = provider.fullName || provider.username || provider.name || "Provider";
  const trade = provider.professions?.join(" · ") || provider.trade || "Service provider";

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...files]);
    }
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "Select Date";
    const [y, m, d] = dateStr.split("-");
    return `${MONTHS[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
  };

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setSelectedTime("");
    setFormError("");
  };

  const handleNextStep = () => {
    if (!taskDescription.trim()) {
      setFormError("Please describe the item or issue you want repaired.");
      return;
    }
    setFormError("");
    setStep(2);
  };

  const handlePreviousStep = () => {
    setFormError("");
    setShowCalendar(false);
    setStep(1);
  };

  const handleSubmit = async () => {
    const offerAmount = Number(offer);
    if (!taskDescription.trim()) return setFormError("Please describe the item or issue you want repaired.");
    if (!selectedDate) return setFormError("Please select a service date.");
    if (!selectedTime) return setFormError("Please select an available time.");
    if (isPastTimeSlot(selectedDate, selectedTime, new Date())) {
      setSelectedTime("");
      return setFormError("That time has passed. Please choose another time.");
    }
    if (availabilityStatus !== "loaded") return setFormError("Provider availability could not be confirmed. Please try again.");
    if (bookedSlots.some((slot) => slot.date === selectedDate && slot.timeSlot === selectedTime)) {
      setSelectedTime("");
      return setFormError("That time slot is no longer available. Please choose another time.");
    }
    if (!Number.isFinite(offerAmount) || offerAmount < 100) return setFormError("Your offer must be at least PHP 100.");
    if (!termsAccepted) return setFormError("Please agree to the terms and cancellation policy.");
    setFormError("");
    try {
      await onSubmit?.({
        providerId: provider._id,
        worker: name,
        cred: trade,
        task: taskDescription.trim(),
        description: taskDescription.trim(),
        date: selectedDate,
        time: selectedTime,
        offer: offerAmount,
        urgency,
        photos: selectedFiles,
        address: provider.address || [provider.barangay, provider.city, provider.province].filter(Boolean).join(", "),
        termsAccepted: true,
      });
      setIsSubmitted(true);
    } catch (error) {
      setFormError(error.message || "Could not submit the booking.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-lg font-bold text-gray-900">Request Booking</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Provider Summary Card */}
        <div className="mx-6 mb-5 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-800 text-sm font-bold text-white">
            {name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{name}</p>
            <p className="text-xs text-gray-500">{trade}</p>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 pb-6 space-y-4">
          {isSubmitted ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-bold text-gray-900">Offer Submitted</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                Your offer of PHP {Number(offer).toLocaleString()} with Cash on Completion has been sent to the provider. They have to accept or counter.
              </p>
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => { onClose(); navigate("/"); }} className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                  Return Home
                </button>
                <button type="button" onClick={() => { onClose(); navigate("/bookings"); }} className="flex-1 rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800">
                  View Booking Status
                </button>
              </div>
            </div>
          ) : (
            <>
          <div aria-label={`Step ${step} of 2`} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Step {step} of 2</p>
              <p className="text-xs font-medium text-gray-500">{step === 1 ? "Task details & media" : "Scheduling & confirmation"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2" aria-hidden="true">
              <span className={`h-1 rounded-full ${step >= 1 ? "bg-primary-600" : "bg-gray-200"}`} />
              <span className={`h-1 rounded-full ${step >= 2 ? "bg-primary-600" : "bg-gray-200"}`} />
            </div>
          </div>

          {step === 1 ? (
            <div className="space-y-4">
          {/* Task Description */}
          <div>
            <label htmlFor="task" className="mb-1.5 block text-sm font-medium text-gray-700">
              What do you need help with?
            </label>
            <textarea
              id="task"
              rows={3}
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Describe the exact task (e.g., Assemble a new desktop table, fix broken cabinet hinges...)"
              className="block w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>

          {/* Photo Upload */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Add photos <span className="font-normal text-gray-500">(optional)</span></p>
                <p className="mt-0.5 text-xs text-gray-500">PNG or JPG · Up to five photos</p>
              </div>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="M12 16V4m0 0L8 8m4-4 4 4" /><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg>
                Choose photos
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                multiple
                className="sr-only"
                onChange={handleFileChange}
              />
            </div>
            {selectedFiles.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {selectedFiles.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                    {photoPreviews[i] && <img src={photoPreviews[i]} alt={file.name} className="h-20 w-full object-cover" />}
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      aria-label={`Remove ${file.name}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <p className="truncate px-1.5 py-1 text-[10px] text-gray-600">{file.name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-full border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={handleNextStep} className="flex-1 rounded-full bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800">Next</button>
          </div>
            </div>
          ) : (
            <div className="space-y-4">

          {/* Schedule */}
          <section className="relative rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="relative">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Select Date</label>
                <button
                  type="button"
                  onClick={() => setShowCalendar(!showCalendar)}
                  className={`flex w-full items-center justify-between rounded-xl border bg-white px-3 py-2.5 text-left text-sm transition ${
                    selectedDate
                      ? "border-primary-500 text-gray-900"
                      : "border-gray-300 text-gray-400"
                  } focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30`}
                >
                  <span className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                    </svg>
                    {formatDate(selectedDate)}
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`h-4 w-4 transition ${showCalendar ? "rotate-180" : ""}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {showCalendar && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[17rem]">
                    <CalendarPicker selectedDate={selectedDate} onSelect={handleDateSelect} onClose={() => setShowCalendar(false)} />
                  </div>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium text-gray-700">Available Time</p>
                {!selectedDate && <p className="mb-2 text-xs text-gray-500">Choose a date to see available times.</p>}
                {availabilityStatus === "loading" && <p className="mb-2 text-xs text-gray-500">Checking provider availability…</p>}
                {availabilityStatus === "error" && <p role="alert" className="mb-2 text-xs text-red-600">Could not check availability. <button type="button" onClick={() => setAvailabilityRetry((retry) => retry + 1)} className="font-semibold underline">Try again</button></p>}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {TIME_SLOTS.map((time) => {
                    const isPast = selectedDate && isPastTimeSlot(selectedDate, time, currentTime);
                    const isBooked = selectedDate && bookedSlots.some((slot) => slot.date === selectedDate && slot.timeSlot === time);
                    const isDisabled = !selectedDate || isPast || isBooked || availabilityStatus !== "loaded";
                    const isSelected = Boolean(selectedDate) && selectedTime === time && !isPast && !isBooked;
                    return (
                      <button
                        key={time}
                        type="button"
                        disabled={isDisabled}
                        title={!selectedDate ? "Choose a date first" : isPast ? "This time has passed" : isBooked ? "This time is already booked" : availabilityStatus !== "loaded" ? "Checking availability" : undefined}
                        onClick={() => { setSelectedTime(time); setFormError(""); }}
                        className={`min-h-9 rounded-full border px-2 py-2 text-xs font-semibold transition ${
                          isSelected
                            ? "border-primary-700 bg-primary-700 text-white"
                            : isDisabled
                              ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                              : "border-gray-300 bg-white text-gray-700 hover:border-primary-400 hover:bg-primary-50"
                        }`}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Booking Terms */}
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="urgency" className="mb-1.5 block text-sm font-medium text-gray-700">Service urgency</label>
              <select
                id="urgency"
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="block w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option>Flexible</option>
                <option>Emergency</option>
              </select>
            </div>

            <div>
              <label htmlFor="offer" className="mb-1.5 block text-sm font-medium text-gray-700">Your proposed budget</label>
              <input
                id="offer"
                type="number"
                min="100"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                placeholder="Enter your proposed budget (Min. ₱100)"
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
              <p className="mt-1 text-xs text-gray-500">Offer-based pricing, not hourly.</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
            <div>
              <p className="text-xs font-medium text-gray-500">Payment method</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-800">Cash on Completion</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-emerald-800">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 10V7a4 4 0 118 0v3m-4 4v3" /></svg>
              Locked
            </span>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-700">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span>I agree to the platform&apos;s terms and the provider&apos;s cancellation policy.</span>
          </label>

          {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}

          {/* Footer Buttons */}
          <div className="flex gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={handlePreviousStep}
              className="flex-1 rounded-full border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex-1 rounded-full bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Request Booking
            </button>
          </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
