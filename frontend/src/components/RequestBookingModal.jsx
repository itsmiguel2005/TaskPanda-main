import { apiFetch } from "../services/api.js";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { canArriveForSameDayBooking, hasScheduleConflict } from "../utils/bookingArrival.js";
import { DEFAULT_ESTIMATED_DURATION_MINUTES, formatEstimatedDuration } from "../utils/bookingDuration.js";
import ServiceLocationPicker from "./ServiceLocationPicker.jsx";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIME_SLOTS = ["7:30 AM", "9:00 AM", "10:30 AM", "1:30 PM", "3:00 PM", "4:30 PM", "6:00 PM"];
const TIP_PRESETS = [0, 20, 50, 100];
const MIN_ESTIMATED_DURATION_MINUTES = 15;
const MAX_ESTIMATED_DURATION_MINUTES = 720;

function formatPhpAmount(amount) {
  return `₱${Number(amount || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

function roundCurrency(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function getServiceLocationKey(geoLocation) {
  const coordinates = geoLocation?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return "";
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180 || !Number.isFinite(latitude) || Math.abs(latitude) > 90) return "";
  return `${longitude},${latitude}`;
}

function ProviderAvatar({ name, profileImage }) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-800 text-sm font-bold text-white">
      {profileImage && !imageFailed ? (
        <img
          src={profileImage}
          alt={`${name} profile`}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials
      )}
    </div>
  );
}

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

function AnimatedPhpAmount({ amount }) {
  const [displayAmount, setDisplayAmount] = useState(amount);
  const displayAmountRef = useRef(amount);

  useEffect(() => {
    const start = displayAmountRef.current;
    const reducedMotion = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (reducedMotion || start === amount) {
      displayAmountRef.current = amount;
      setDisplayAmount(amount);
      return undefined;
    }

    let frameId = 0;
    const startTime = performance.now();
    const duration = 180;
    const animate = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const nextAmount = start + (amount - start) * eased;
      displayAmountRef.current = nextAmount;
      setDisplayAmount(nextAmount);
      if (progress < 1) frameId = window.requestAnimationFrame(animate);
      else displayAmountRef.current = amount;
    };
    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [amount]);

  return (
    <>
      <span className="sr-only" aria-live="polite" aria-atomic="true">{formatPhpAmount(amount)}</span>
      <span aria-hidden="true">{formatPhpAmount(displayAmount)}</span>
    </>
  );
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
    <div className="w-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          aria-label="Previous month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-900" aria-live="polite">
          {MONTHS[month]} {year}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          aria-label="Next month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1.5 text-center text-xs font-medium text-gray-500">
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
              aria-label={dateObj.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              className={`aspect-square min-h-9 rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-primary-500/40 ${
                isSelected
                  ? "bg-primary-700 font-semibold text-white"
                  : isPast
                  ? "cursor-not-allowed text-gray-300"
                  : isToday
                  ? "bg-primary-50 font-semibold text-primary-800 hover:bg-primary-100"
                  : "text-gray-700 hover:bg-gray-100"
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
  const { token, user } = useAuth();
  const initialDate = initialValues.date || "";
  const initialTime = initialValues.time || "";
  const [taskDescription, setTaskDescription] = useState(initialValues.task || "");
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedTime, setSelectedTime] = useState(initialTime);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [availabilityStatus, setAvailabilityStatus] = useState("loading");
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const [travelQuote, setTravelQuote] = useState(null);
  const [travelQuoteLocationKey, setTravelQuoteLocationKey] = useState("");
  const [travelQuoteStatus, setTravelQuoteStatus] = useState("loading");
  const [travelQuoteError, setTravelQuoteError] = useState("");
  const [travelQuoteRetry, setTravelQuoteRetry] = useState(0);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [offer, setOffer] = useState(initialValues.offer == null ? "" : String(initialValues.offer));
  const [duration, setDuration] = useState(String(initialValues.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES));
  const [serviceLocation, setServiceLocation] = useState(() => ({
    address: initialValues.address || user?.address || "",
    geoLocation: initialValues.serviceGeoLocation || user?.geoLocation || null,
  }));
  const [tipAmount, setTipAmount] = useState(String(initialValues.tipAmount ?? 0));
  const [rewards, setRewards] = useState({ vouchers: [] });
  const [rewardsStatus, setRewardsStatus] = useState("loading");
  const [rewardsError, setRewardsError] = useState("");
  const [rewardsRetry, setRewardsRetry] = useState(0);
  const [selectedVoucherId, setSelectedVoucherId] = useState("");
  const [tipFeedback, setTipFeedback] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedBooking, setSubmittedBooking] = useState(null);
  const [countdownNow, setCountdownNow] = useState(() => new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const fileInputRef = useRef(null);
  useEffect(() => {
    setSelectedDate(initialDate);
    setSelectedTime(initialTime);
  }, [provider?._id, initialDate, initialTime]);
  const estimatedDurationMinutes = Number(duration);
  const durationIsValid = Number.isInteger(estimatedDurationMinutes)
    && estimatedDurationMinutes >= MIN_ESTIMATED_DURATION_MINUTES
    && estimatedDurationMinutes <= MAX_ESTIMATED_DURATION_MINUTES
    && estimatedDurationMinutes % MIN_ESTIMATED_DURATION_MINUTES === 0;
  const serviceLocationKey = getServiceLocationKey(serviceLocation.geoLocation);
  const isTimeSlotBooked = (date, time, requestedDuration = estimatedDurationMinutes) => hasScheduleConflict({
    serviceDate: date ? `${date}T00:00:00.000Z` : "",
    timeSlot: time,
    estimatedDurationMinutes: requestedDuration,
    serviceGeoLocation: serviceLocation.geoLocation,
  }, bookedSlots);
  const isArrivalWindowTooShort = (date, time) => !canArriveForSameDayBooking({
    serviceDate: date ? `${date}T00:00:00.000Z` : "",
    timeSlot: time,
    travelDistanceKm: travelQuote?.travelDistanceKm,
  }, currentTime);
  const requestExpiresInSeconds = submittedBooking?.requestExpiresAt
    ? Math.max(0, Math.ceil((new Date(submittedBooking.requestExpiresAt).getTime() - countdownNow.getTime()) / 1000))
    : null;
  const savedDurationMinutes = Number(submittedBooking?.estimatedDurationMinutes);
  const durationWasSaved = Number.isInteger(savedDurationMinutes)
    && savedDurationMinutes === estimatedDurationMinutes;

  useEffect(() => {
    const nextPreviews = selectedFiles.map((file) => URL.createObjectURL(file));
    setPhotoPreviews(nextPreviews);
    return () => nextPreviews.forEach((preview) => URL.revokeObjectURL(preview));
  }, [selectedFiles]);

  useEffect(() => {
    if (!isSubmitted || !submittedBooking?.requestExpiresAt) return undefined;
    const timer = window.setInterval(() => setCountdownNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [isSubmitted, submittedBooking?.requestExpiresAt]);

  useEffect(() => {
    if (!provider) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [provider, onClose]);

  useEffect(() => {
    if (!token) {
      setRewards({ vouchers: [] });
      setRewardsStatus("loaded");
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setRewardsStatus("loading");
    setRewardsError("");
    apiFetch("/api/rewards", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Could not load your vouchers.");
        if (!Array.isArray(data.vouchers)) throw new Error("Your rewards could not be read. Refresh the page and try again.");
        if (!active) return;
        setRewards(data);
        setSelectedVoucherId((currentId) => currentId && data.vouchers.some((voucher) =>
          voucher.id === currentId &&
          voucher.status === "active" &&
          (!voucher.expiresAt || new Date(voucher.expiresAt) > new Date())
        ) ? currentId : "");
        setRewardsStatus("loaded");
      })
      .catch((error) => {
        if (active && error.name !== "AbortError") {
          setRewardsStatus("error");
          setRewardsError(error.message || "Could not load your vouchers.");
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [token, rewardsRetry]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!provider?._id || !token) {
      setAvailabilityStatus("loading");
      setTravelQuote(null);
      setTravelQuoteStatus("loading");
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    let isLoadingAvailability = false;
    setAvailabilityStatus("loading");
    setTravelQuote(null);
    setTravelQuoteError("");
    setTravelQuoteStatus("loading");
    const refreshAvailability = async () => {
      if (isLoadingAvailability) return;
      isLoadingAvailability = true;
      try {
        const query = new URLSearchParams();
        if (serviceLocationKey) {
          const [longitude, latitude] = serviceLocationKey.split(",");
          query.set("longitude", longitude);
          query.set("latitude", latitude);
        }
        const queryString = query.size ? `?${query}` : "";
        const response = await apiFetch(`/api/bookings/availability/${provider._id}${queryString}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Could not load provider availability.");
        if (
          typeof data.travelDistanceKm !== "number" ||
          !Number.isFinite(data.travelDistanceKm) ||
          typeof data.travelFee !== "number" ||
          !Number.isFinite(data.travelFee) ||
          data.travelDistanceKm < 0 ||
          data.travelFee < 0
        ) {
          throw new Error("The server returned an invalid travel quote. Refresh the page and retry.");
        }
        if (active) {
          setTravelQuote({
            travelDistanceKm: data.travelDistanceKm,
            travelFee: data.travelFee,
            travelBaseFee: data.travelBaseFee,
            travelFeePerKm: data.travelFeePerKm,
          });
          setTravelQuoteLocationKey(serviceLocationKey);
          setTravelQuoteStatus("loaded");
          setBookedSlots(Array.isArray(data.bookedSlots) ? data.bookedSlots : []);
          setAvailabilityStatus("loaded");
        }
      } catch (error) {
        if (active && error.name !== "AbortError") {
          setAvailabilityStatus("error");
          setTravelQuoteError(error.message || "Could not calculate the travel fare.");
          setTravelQuoteStatus("error");
        }
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
  }, [provider?._id, token, availabilityRetry, travelQuoteRetry, serviceLocationKey]);

  useEffect(() => {
    if (!selectedDate || !selectedTime) return;
    if (isPastTimeSlot(selectedDate, selectedTime, currentTime)) {
      setSelectedTime("");
      return;
    }
    if (isArrivalWindowTooShort(selectedDate, selectedTime)) {
      setSelectedTime("");
      setFormError("That time is too soon for the provider to travel to your location. Choose a later time.");
    }
  }, [currentTime, selectedDate, selectedTime, travelQuote?.travelDistanceKm]);

  useEffect(() => {
    if (availabilityStatus !== "loaded" || !selectedDate || !selectedTime) return;
    if (!durationIsValid || isTimeSlotBooked(selectedDate, selectedTime, estimatedDurationMinutes)) {
      setSelectedTime("");
      setFormError("That slot does not leave enough time for the task, travel between client locations, and the 30-minute safety buffer.");
    }
  }, [availabilityStatus, bookedSlots, selectedDate, selectedTime, estimatedDurationMinutes, durationIsValid]);

  if (!provider) return null;

  const name = provider.fullName || provider.username || provider.name || "Provider";
  const trade = provider.professions?.join(" · ") || provider.trade || "Service provider";
  const travelDistanceKm = travelQuote?.travelDistanceKm ?? null;
  const travelFee = travelQuote?.travelFee ?? 0;
  const travelFeeDescription = travelQuote
    ? `${formatPhpAmount(travelQuote.travelBaseFee)} base fare covers first 2 km + ${Math.max(0, travelDistanceKm - 2).toFixed(2)} km × ${formatPhpAmount(travelQuote.travelFeePerKm)}/km`
    : "distance-based rate";
  const availableVouchers = (rewards.vouchers || []).filter((voucher) =>
    voucher.status === "active" && (!voucher.expiresAt || new Date(voucher.expiresAt) > new Date())
  );
  const selectedVoucher = availableVouchers.find((voucher) => voucher.id === selectedVoucherId);
  const travelFeeDiscount = selectedVoucher ? Math.min(travelFee, Number(selectedVoucher.amount) || 0) : 0;
  const discountedTravelFee = Math.max(0, travelFee - travelFeeDiscount);
  const offerAmount = Number(offer);
  const adjustedTaskOffer = durationIsValid && Number.isFinite(offerAmount)
    ? roundCurrency(offerAmount * estimatedDurationMinutes / DEFAULT_ESTIMATED_DURATION_MINUTES)
    : 0;
  const selectedTip = Number(tipAmount);
  const safeTipAmount = Number.isFinite(selectedTip) && selectedTip >= 0 ? selectedTip : 0;
  const totalAmount = roundCurrency(adjustedTaskOffer + discountedTravelFee + safeTipAmount);

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

  const validateRequestDetails = () => {
    if (!taskDescription.trim()) return setFormError("Please describe the item or issue you want repaired."), false;
    if (!serviceLocation.address.trim() || serviceLocation.address.trim().length > 300) return setFormError("Choose or enter the exact service address."), false;
    if (!serviceLocationKey) return setFormError("Select a service location pin on the map to calculate travel distance."), false;
    if (!selectedDate) return setFormError("Please select a service date."), false;
    if (!selectedTime) return setFormError("Please select an available time."), false;
    if (!durationIsValid) return setFormError("Enter a duration from 15 minutes to 12 hours in 15-minute increments."), false;
    if (isPastTimeSlot(selectedDate, selectedTime, new Date())) {
      setSelectedTime("");
      return setFormError("That time has passed. Please choose another time."), false;
    }
    if (isArrivalWindowTooShort(selectedDate, selectedTime)) {
      setSelectedTime("");
      return setFormError("That time is too soon for the provider to travel to your location. Choose a later time."), false;
    }
    if (availabilityStatus !== "loaded") return setFormError("Provider availability could not be confirmed. Please try again."), false;
    if (isTimeSlotBooked(selectedDate, selectedTime, estimatedDurationMinutes)) {
      setSelectedTime("");
      return setFormError("That slot does not leave enough time for the task, travel between client locations, and the 30-minute safety buffer."), false;
    }
    if (travelQuoteStatus !== "loaded" || travelQuoteLocationKey !== serviceLocationKey || travelDistanceKm == null) return setFormError("The travel quote for this service location is not ready. Retry it above before reviewing."), false;
    if (!Number.isFinite(offerAmount) || offerAmount < 100) return setFormError("Your 60-minute baseline offer must be at least PHP 100."), false;
    if (adjustedTaskOffer < 100) return setFormError("The duration-adjusted task offer must be at least PHP 100. Increase your baseline offer or choose a longer duration."), false;
    if (!Number.isFinite(selectedTip) || selectedTip < 0 || selectedTip > 1000000) return setFormError("Enter a valid tip amount."), false;
    if (!termsAccepted) return setFormError("Please agree to the terms and cancellation policy."), false;
    setFormError("");
    return true;
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!taskDescription.trim()) {
        setFormError("Please describe the item or issue you want repaired.");
        return;
      }
      setFormError("");
      setStep(2);
      return;
    }
    if (validateRequestDetails()) setStep(3);
  };

  const handlePreviousStep = () => {
    setFormError("");
    setShowCalendar(false);
    setStep((currentStep) => Math.max(1, currentStep - 1));
  };

  const handleSubmit = async () => {
    if (!validateRequestDetails()) return;
    try {
      const booking = await onSubmit?.({
        providerId: provider._id,
        worker: name,
        cred: trade,
        task: taskDescription.trim(),
        description: taskDescription.trim(),
        date: selectedDate,
        time: selectedTime,
        offer: offerAmount,
        estimatedDurationMinutes,
        serviceGeoLocation: serviceLocation.geoLocation,
        tipAmount: selectedTip,
        voucherId: selectedVoucherId,
        urgency: "Flexible",
        photos: selectedFiles,
        address: serviceLocation.address.trim(),
        termsAccepted: true,
      });
      setCountdownNow(new Date());
      setSubmittedBooking(booking || null);
      setIsSubmitted(true);
    } catch (error) {
      setFormError(error.message || "Could not submit the booking.");
      if (selectedVoucherId) setRewardsRetry((retry) => retry + 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        className={`w-full ${step === 2 ? "max-w-lg" : "max-w-md"} max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl`}
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
          <ProviderAvatar key={provider._id || name} name={name} profileImage={provider.profileImage} />
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
                Your request has been sent to the provider. They can accept or counter your task offer.
              </p>
              {requestExpiresInSeconds != null ? (
                <p className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${requestExpiresInSeconds === 0 ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900"}`} role="timer" aria-live="off">
                  {requestExpiresInSeconds === 0
                    ? "This same-day request has expired."
                    : <>Same-day request · provider must accept within <span className="font-bold tabular-nums">{Math.floor(requestExpiresInSeconds / 60)}:{String(requestExpiresInSeconds % 60).padStart(2, "0")}</span>.</>}
                </p>
              ) : (
                <p className="mt-4 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-medium text-blue-950">
                  Future-dated request · no 15-minute expiry applies.
                </p>
              )}
              {submittedBooking && !durationWasSaved && (
                <p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
                  The server did not confirm the selected task duration. {Number.isInteger(savedDurationMinutes) ? `It saved ${formatEstimatedDuration(savedDurationMinutes)} instead of ${formatEstimatedDuration(estimatedDurationMinutes)}.` : "The saved duration is unavailable."} Restart the backend before creating another booking, then verify this booking with the provider.
                </p>
              )}
              <dl className="mx-auto mt-5 max-w-sm space-y-2 border-y border-dashed border-gray-200 py-4 text-left text-sm">
                <div className="flex justify-between gap-3"><dt className="text-gray-600">Duration-adjusted task offer</dt><dd className="font-medium tabular-nums">{formatPhpAmount(submittedBooking?.offeredPrice ?? adjustedTaskOffer)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-gray-600">Estimated duration</dt><dd className="font-medium tabular-nums">{Number.isInteger(savedDurationMinutes) ? formatEstimatedDuration(savedDurationMinutes) : "Not confirmed"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-gray-600">Travel fare{(submittedBooking?.travelDistanceKm ?? travelDistanceKm) == null ? "" : ` · ${Number(submittedBooking?.travelDistanceKm ?? travelDistanceKm).toFixed(2)} km`}</dt><dd className="font-medium tabular-nums">{formatPhpAmount(submittedBooking?.travelFeeBeforeDiscount ?? travelFee)}</dd></div>
                {Number(submittedBooking?.travelFeeDiscount ?? travelFeeDiscount) > 0 && <div className="flex justify-between gap-3 text-emerald-700"><dt>Travel-fee voucher</dt><dd className="font-semibold tabular-nums">−{formatPhpAmount(submittedBooking?.travelFeeDiscount ?? travelFeeDiscount)}</dd></div>}
                {(submittedBooking?.travelFeeDiscount ?? travelFeeDiscount) > 0 && <div className="flex justify-between gap-3"><dt className="text-gray-600">Travel fare after voucher</dt><dd className="font-medium tabular-nums">{formatPhpAmount(submittedBooking?.travelFee ?? discountedTravelFee)}</dd></div>}
                <div className="flex justify-between gap-3"><dt className="text-gray-600">Optional tip</dt><dd className="font-medium tabular-nums">{formatPhpAmount(submittedBooking?.tipAmount ?? safeTipAmount)}</dd></div>
                <div className="flex justify-between gap-3 border-t border-gray-200 pt-2 font-bold text-gray-950"><dt>Total amount due</dt><dd className="tabular-nums">{formatPhpAmount(submittedBooking?.totalPrice ?? totalAmount)}</dd></div>
              </dl>
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
          <div aria-label={`Step ${step} of 3`} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Step {step} of 3</p>
              <p className="text-xs font-medium text-gray-500">{step === 1 ? "Task details & media" : step === 2 ? "Scheduling & offer" : "Review request"}</p>
            </div>
            <div className="grid grid-cols-3 gap-2" aria-hidden="true">
              {[1, 2, 3].map((stepNumber) => <span key={stepNumber} className={`h-1 rounded-full ${step >= stepNumber ? "bg-primary-600" : "bg-gray-200"}`} />)}
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
          ) : step === 2 ? (
            <div className="space-y-4">

          <ServiceLocationPicker
            value={serviceLocation}
            onChange={setServiceLocation}
            token={token}
          />

          {/* Schedule */}
          <section className="relative rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="grid gap-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Select Date</label>
                <button
                  type="button"
                  onClick={() => setShowCalendar(!showCalendar)}
                  aria-expanded={showCalendar}
                  aria-controls="booking-date-calendar"
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
                  <div id="booking-date-calendar" className="mt-2 w-full">
                    <CalendarPicker selectedDate={selectedDate} onSelect={handleDateSelect} onClose={() => setShowCalendar(false)} />
                  </div>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium text-gray-700">Available Time</p>
                {!selectedDate && <p className="mb-2 text-xs text-gray-500">Choose a date to see available times.</p>}
                {availabilityStatus === "loading" && <p className="mb-2 text-xs text-gray-500">Checking provider availability…</p>}
                {availabilityStatus === "error" && <p role="alert" className="mb-2 text-xs text-red-600">Could not check availability. <button type="button" onClick={() => setAvailabilityRetry((retry) => retry + 1)} className="font-semibold underline">Try again</button></p>}
                <p className="mb-2 text-xs leading-5 text-gray-500">Times include the previous task duration, straight-line travel between pinned client locations estimated at 30 km/h, and a 30-minute safety buffer. Same-day slots also need enough notice for the provider's trip plus a 15-minute arrival buffer. Actual road travel may vary.</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {TIME_SLOTS.map((time) => {
                    const isPast = selectedDate && isPastTimeSlot(selectedDate, time, currentTime);
                    const arrivalWindowTooShort = selectedDate && isArrivalWindowTooShort(selectedDate, time);
                    const isBooked = selectedDate && isTimeSlotBooked(selectedDate, time);
                    const isDisabled = !selectedDate || isPast || arrivalWindowTooShort || isBooked || availabilityStatus !== "loaded";
                    const isSelected = Boolean(selectedDate) && selectedTime === time && !isPast && !arrivalWindowTooShort && !isBooked;
                    return (
                      <button
                        key={time}
                        type="button"
                        disabled={isDisabled}
                        title={!selectedDate ? "Choose a date first" : isPast ? "This time has passed" : arrivalWindowTooShort ? "Not enough time for the provider to travel to your location" : isBooked ? "Not enough time for the task, travel, and 30-minute safety buffer" : availabilityStatus !== "loaded" ? "Checking availability" : undefined}
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
                <label htmlFor="estimated-duration" className="mt-4 block text-sm font-medium text-gray-700">Estimated task duration
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      id="estimated-duration"
                      type="number"
                      min={MIN_ESTIMATED_DURATION_MINUTES}
                      max={MAX_ESTIMATED_DURATION_MINUTES}
                      step={MIN_ESTIMATED_DURATION_MINUTES}
                      value={duration}
                      onChange={(event) => { setDuration(event.target.value); setFormError(""); }}
                      className="w-32 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    />
                    <span className="text-xs text-gray-500">minutes · 15-minute increments</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600" aria-live="polite">
                    Selected duration: {formatEstimatedDuration(estimatedDurationMinutes)}
                  </p>
                </label>
              </div>
            </div>
          </section>

          {/* Booking Terms */}
          <div>
            <div>
              <label htmlFor="offer" className="mb-1.5 block text-sm font-medium text-gray-700">Your 60-minute baseline offer (PHP)</label>
              <input
                id="offer"
                type="number"
                min="100"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                placeholder="Enter baseline offer (Min. ₱100)"
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
              <p className="mt-1 text-xs text-gray-500">For {durationIsValid ? estimatedDurationMinutes : "your selected"} minutes, the task offer is {formatPhpAmount(adjustedTaskOffer)}. Travel fare and vouchers are unchanged.</p>
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

          {travelQuoteStatus === "loading" && <p className="text-xs text-gray-500" role="status">Calculating your distance-based travel fare…</p>}
          {travelQuoteStatus === "error" && <p className="text-xs text-red-700" role="alert">{travelQuoteError} <button type="button" onClick={() => setTravelQuoteRetry((retry) => retry + 1)} className="font-semibold underline underline-offset-2">Retry</button></p>}

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
              onClick={handleNextStep}
              className="flex-1 rounded-full bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Review request
            </button>
          </div>
            </div>
          ) : (
            <div className="space-y-4">
              <section className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 border-b border-dashed border-gray-200 pb-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-gray-900">Request summary</h3>
                    <p className="mt-1 text-xs text-gray-500">Review the task, schedule, and full amount before sending.</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">Cash on completion</span>
                </div>
                <dl className="space-y-2.5 py-3 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-gray-500">Service</dt><dd className="max-w-[65%] text-right font-medium text-gray-900">{trade}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-gray-500">Task</dt><dd className="max-w-[65%] whitespace-pre-wrap text-right font-medium text-gray-900">{taskDescription.trim()}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-gray-500">Schedule</dt><dd className="text-right font-medium text-gray-900">{formatDate(selectedDate)} · {selectedTime}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-gray-500">Service location</dt><dd className="max-w-[65%] text-right font-medium text-gray-900">{serviceLocation.address}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-gray-500">Estimated duration</dt><dd className="font-medium text-gray-900">{formatEstimatedDuration(estimatedDurationMinutes)}</dd></div>
                </dl>
                <div className="border-t border-dashed border-gray-200 pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Price breakdown</p>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-gray-600">Duration-adjusted task offer</dt><dd className="font-semibold tabular-nums text-gray-900">{formatPhpAmount(adjustedTaskOffer)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gray-600">Travel fare <span className="block text-xs font-normal text-gray-500">{travelDistanceKm.toFixed(2)} km · {travelFeeDescription}</span></dt><dd className="font-semibold tabular-nums text-gray-900">{formatPhpAmount(travelFee)}</dd></div>
                    {travelFeeDiscount > 0 && <div className="flex justify-between gap-3 text-emerald-700"><dt>Travel-fee voucher</dt><dd className="font-semibold tabular-nums">−{formatPhpAmount(travelFeeDiscount)}</dd></div>}
                    {travelFeeDiscount > 0 && <div className="flex justify-between gap-3"><dt className="text-gray-600">Travel fare after voucher</dt><dd className="font-semibold tabular-nums text-gray-900">{formatPhpAmount(discountedTravelFee)}</dd></div>}
                    <div className="flex justify-between gap-3"><dt className="text-gray-600">Optional tip</dt><dd className="font-semibold tabular-nums text-gray-900">{formatPhpAmount(safeTipAmount)}</dd></div>
                  </dl>
                  <div className="mt-3 border-t border-dashed border-gray-200 pt-3">
                    <label htmlFor="booking-voucher" className="block text-xs font-semibold text-gray-700">Vouchers &amp; rewards</label>
                    <select
                      id="booking-voucher"
                      value={selectedVoucherId}
                      onChange={(event) => setSelectedVoucherId(event.target.value)}
                      disabled={rewardsStatus !== "loaded" || availableVouchers.length === 0}
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:bg-gray-50 disabled:text-gray-500"
                    >
                      <option value="">{rewardsStatus === "loading" ? "Loading your vouchers…" : "No voucher"}</option>
                      {availableVouchers.map((voucher) => (
                        <option key={voucher.id} value={voucher.id}>
                          {voucher.title} · {formatPhpAmount(voucher.amount)} travel fee
                        </option>
                      ))}
                    </select>
                    {rewardsError && <p className="mt-2 text-xs text-red-700" role="alert">{rewardsError}</p>}
                    {rewardsStatus === "error" && (
                      <button
                        type="button"
                        onClick={() => setRewardsRetry((retry) => retry + 1)}
                        className="mt-1 text-xs font-semibold text-primary-700 underline underline-offset-2"
                      >
                        Retry loading vouchers
                      </button>
                    )}
                    {selectedVoucher && <p className="mt-1.5 text-xs text-emerald-800">Applied to the travel fee only. Your task offer and tip stay unchanged.</p>}
                    {!selectedVoucher && rewardsStatus === "loaded" && availableVouchers.length === 0 && <p className="mt-1.5 text-xs text-gray-500">Your next travel-fee reward will appear here.</p>}
                  </div>
                  <div className="mt-3 flex items-end justify-between border-t border-gray-200 pt-3">
                    <span className="text-sm font-semibold text-gray-700">Total amount due</span>
                    <span className="text-2xl font-bold tabular-nums text-gray-950"><AnimatedPhpAmount amount={totalAmount} /></span>
                  </div>
                </div>
              </section>

              <fieldset>
                <legend className="text-sm font-semibold text-gray-800">Add a tip <span className="font-normal text-gray-500">(optional)</span></legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TIP_PRESETS.map((amount) => {
                    const isSelected = selectedTip === amount;
                    return (
                      <button key={amount} type="button" aria-pressed={isSelected} onClick={() => { setTipAmount(String(amount)); setTipFeedback(`${amount}-${Date.now()}`); }} className={`tip-preset rounded-full border px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 active:scale-[0.97] ${isSelected ? "is-selected border-primary-700 bg-primary-700 text-white" : "border-gray-300 bg-white text-gray-700 hover:border-primary-400 hover:bg-primary-50"}`}>
                        {tipFeedback.startsWith(`${amount}-`) && <span key={tipFeedback} className="tip-ripple" aria-hidden="true" />}
                        <span className="relative z-10">{amount === 0 ? "No tip" : formatPhpAmount(amount)}</span>
                      </button>
                    );
                  })}
                </div>
                <label htmlFor="booking-tip" className="mt-3 block text-xs font-medium text-gray-600">Or enter a custom amount</label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-500">₱</span>
                  <input id="booking-tip" type="number" min="0" max="1000000" step="0.01" value={tipAmount} onChange={(event) => setTipAmount(event.target.value)} className="w-full rounded-lg border border-gray-300 py-2.5 pl-8 pr-3 text-sm tabular-nums text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                </div>
              </fieldset>

              {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
              <div className="flex gap-3 border-t border-gray-100 pt-4">
                <button type="button" onClick={handlePreviousStep} className="flex-1 rounded-full border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">Back</button>
                <button type="button" onClick={handleSubmit} className="flex-1 rounded-full bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800">Confirm request</button>
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
