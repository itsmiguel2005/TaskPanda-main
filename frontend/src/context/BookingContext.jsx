import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { DEFAULT_ESTIMATED_DURATION_MINUTES } from "../utils/bookingDuration.js";

const BookingContext = createContext(null);

function validBookings(value) {
  return Array.isArray(value) ? value.filter((booking) => booking && booking.id && booking.status) : [];
}

export function BookingProvider({ children }) {
  const { token, isLoggedIn, refreshProfile } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const notifySync = useCallback((detail = {}) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("taskpanda:data-sync", {
      detail: {
        source: "booking",
        timestamp: Date.now(),
        ...detail,
      },
    }));
  }, []);

  const fetchBookings = useCallback(async (signal, silent = false) => {
    if (!isLoggedIn || !token) {
      setBookings([]);
      return false;
    }
    if (!silent) setIsLoading(true);
    try {
      const response = await fetch("/api/bookings", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load bookings.");
      if (!Array.isArray(data.bookings)) throw new Error("The booking API is outdated. Restart the backend and try again.");
      const nextBookings = validBookings(data.bookings);
      let didChange = false;
      setBookings((currentBookings) => {
        const currentSnapshot = JSON.stringify(currentBookings);
        const nextSnapshot = JSON.stringify(nextBookings);
        const changed = currentSnapshot !== nextSnapshot;
        didChange = changed;
        return changed ? nextBookings : currentBookings;
      });
      setError("");
      if (didChange) {
        notifySync({ type: "bookings-fetched", count: nextBookings.length });
      }
      return true;
    } catch (requestError) {
      if (requestError.name !== "AbortError") setError(requestError.message || "Could not load bookings.");
      return false;
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [isLoggedIn, token]);

  useEffect(() => {
    const controller = new AbortController();
    fetchBookings(controller.signal);
    return () => controller.abort();
  }, [fetchBookings]);

  useEffect(() => {
    if (!isLoggedIn || !token) return undefined;
    const interval = window.setInterval(() => fetchBookings(undefined, true), 10000);
    return () => window.clearInterval(interval);
  }, [fetchBookings, isLoggedIn, token]);

  const createBooking = useCallback(async (details) => {
    const normalizedDetails = details || {};
    const payload = {
      providerId: normalizedDetails.providerId || normalizedDetails.provider_id || normalizedDetails.provider || "",
      repairDescription: normalizedDetails.description || normalizedDetails.repairDescription || normalizedDetails.task || "",
      address: normalizedDetails.address || "",
      serviceDate: normalizedDetails.serviceDate || normalizedDetails.date || "",
      timeSlot: normalizedDetails.timeSlot || normalizedDetails.time || "",
      offeredPrice: normalizedDetails.offeredPrice ?? normalizedDetails.offerPrice ?? normalizedDetails.offer ?? 0,
      estimatedDurationMinutes: normalizedDetails.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES,
      tipAmount: normalizedDetails.tipAmount ?? 0,
      voucherId: normalizedDetails.voucherId || "",
      urgency: normalizedDetails.urgency || "Flexible",
      paymentMethod: normalizedDetails.paymentMethod || "cash",
      termsAccepted: normalizedDetails.termsAccepted ?? true,
      photoCount: (normalizedDetails.photos || []).length,
    };
    console.log("[BookingContext] createBooking payload:", payload);

    const formData = new FormData();
    const providerId = normalizedDetails.providerId || normalizedDetails.provider_id || normalizedDetails.provider || "";
    const description = normalizedDetails.description || normalizedDetails.repairDescription || normalizedDetails.task || "";
    const serviceDate = normalizedDetails.serviceDate || normalizedDetails.date || "";
    const timeSlot = normalizedDetails.timeSlot || normalizedDetails.time || "";
    const offerPrice = normalizedDetails.offeredPrice ?? normalizedDetails.offerPrice ?? normalizedDetails.offer ?? 0;
    const estimatedDurationMinutes = normalizedDetails.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES;
    const tipAmount = normalizedDetails.tipAmount ?? 0;
    const paymentMethod = normalizedDetails.paymentMethod || "cash";
    const termsAccepted = normalizedDetails.termsAccepted ?? true;

    formData.append("providerId", String(providerId));
    formData.append("repairDescription", description);
    formData.append("description", description);
    formData.append("address", normalizedDetails.address || "");
    if (normalizedDetails.serviceGeoLocation) {
      formData.append("serviceGeoLocation", JSON.stringify(normalizedDetails.serviceGeoLocation));
    }
    formData.append("serviceDate", String(serviceDate));
    formData.append("date", String(serviceDate));
    formData.append("timeSlot", String(timeSlot));
    formData.append("time", String(timeSlot));
    formData.append("offeredPrice", String(offerPrice));
    formData.append("estimatedDurationMinutes", String(estimatedDurationMinutes));
    formData.append("tipAmount", String(tipAmount));
    if (normalizedDetails.voucherId) formData.append("voucherId", String(normalizedDetails.voucherId));
    formData.append("offer", String(offerPrice));
    formData.append("price", String(offerPrice));
    formData.append("paymentMethod", paymentMethod);
    formData.append("urgency", normalizedDetails.urgency || "Flexible");
    formData.append("termsAccepted", String(Boolean(termsAccepted)));
    (normalizedDetails.photos || []).forEach((photo) => formData.append("photos", photo));

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      console.log("[BookingContext] booking response:", { status: response.status, data });
      if (!response.ok) {
        const backendMessage = data?.message || data?.error || "Could not submit the booking.";
        throw new Error(backendMessage);
      }
      if (!data.booking?.id) {
        throw new Error("The server returned an invalid booking response. Restart the backend and try again.");
      }
      setBookings((current) => validBookings([data.booking, ...current]));
      notifySync({ type: "booking-created", bookingId: data.booking.id });
      return data.booking;
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not submit the booking.";
      throw new Error(message || "Could not submit the booking.");
    }
  }, [notifySync, token]);

  const updateBookingStatus = useCallback(async (id, status) => {
    const response = await fetch(`/api/bookings/${id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not update the booking status.");
    if (!data.booking?.id) throw new Error("The server returned an invalid booking response. Restart the backend and try again.");
    setBookings((current) => validBookings(current.map((booking) => booking.id === id ? data.booking : booking)));
    notifySync({ type: "booking-updated", bookingId: id });
    return data.booking;
  }, [notifySync, token]);

  const submitCompletionProof = useCallback(async (id, completionNote, photos = []) => {
    const formData = new FormData();
    formData.append("completionNote", completionNote);
    (Array.isArray(photos) ? photos : []).forEach((photo) => formData.append("photos", photo));
    const response = await fetch(`/api/bookings/${id}/completion`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not submit completion proof.");
    if (!data.booking?.id) throw new Error("The server returned an invalid completion response.");
    setBookings((current) => validBookings(current.map((booking) => booking.id === id ? data.booking : booking)));
    notifySync({ type: "booking-updated", bookingId: id });
    return data.booking;
  }, [notifySync, token]);

  const requestRevision = useCallback(async (id, note, photos = []) => {
    const formData = new FormData();
    formData.append("note", note);
    (Array.isArray(photos) ? photos : []).forEach((photo) => formData.append("photos", photo));
    const response = await fetch(`/api/bookings/${id}/revisions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not submit the revision request.");
    if (!data.booking?.id) throw new Error("The server returned an invalid revision request.");
    setBookings((current) => validBookings(current.map((booking) => booking.id === id ? data.booking : booking)));
    notifySync({ type: "booking-updated", bookingId: id });
    return data.booking;
  }, [notifySync, token]);

  const requestCancellation = useCallback(async (id, action = "request", reason = "") => {
    const response = await fetch(`/api/bookings/${id}/cancel`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, reason }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not process the cancellation.");
    if (!data.booking?.id) throw new Error("The server returned an invalid cancellation response. Restart the backend and try again.");
    setBookings((current) => validBookings(current.map((booking) => booking.id === id ? data.booking : booking)));
    notifySync({ type: "booking-updated", bookingId: id });
    if (data.booking.statusCode === "canceled") await refreshProfile();
    return data.booking;
  }, [notifySync, refreshProfile, token]);

  const submitReview = useCallback(async (id, rating, review, photos = []) => {
    const bookingId = String(id || "");
    const normalizedRating = Number(rating);
    const normalizedReview = typeof review === "string" ? review.trim() : "";
    const normalizedPhotos = Array.isArray(photos) ? photos : [];

    if (!bookingId) throw new Error("Choose a valid booking before submitting a review.");
    if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      throw new Error("Choose a rating from 1 to 5 stars.");
    }
    if (normalizedReview.length > 1000) {
      throw new Error("Review must be 1,000 characters or fewer.");
    }

    try {
      const storedRows = JSON.parse(window.localStorage.getItem("taskpanda-reviewed-bookings") || "{}");
      const existingRows = storedRows && typeof storedRows === "object" ? storedRows : {};
      if (existingRows[bookingId] === true) {
        throw new Error("This booking has already been reviewed.");
      }
    } catch (storageError) {
      if (storageError instanceof Error && storageError.message === "This booking has already been reviewed.") {
        throw storageError;
      }
    }

    const formData = new FormData();
    formData.append("rating", String(normalizedRating));
    formData.append("review", normalizedReview);
    normalizedPhotos.forEach((photo) => formData.append("photos", photo));
    const response = await fetch(`/api/bookings/${bookingId}/rate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not save the booking review.");
    if (!data.booking?.id) throw new Error("The server returned an invalid review response.");
    setBookings((current) => validBookings(current.map((booking) => booking.id === bookingId ? data.booking : booking)));
    notifySync({ type: "review-submitted", bookingId: bookingId });
    try {
      const storedRows = JSON.parse(window.localStorage.getItem("taskpanda-reviewed-bookings") || "{}");
      const nextRows = storedRows && typeof storedRows === "object" ? storedRows : {};
      nextRows[bookingId] = true;
      window.localStorage.setItem("taskpanda-reviewed-bookings", JSON.stringify(nextRows));
    } catch {
      // Ignore storage failures.
    }
    return data.booking;
  }, [token]);

  const sendProviderUpdate = useCallback(async (id, update) => {
    const response = await fetch(`/api/bookings/${id}/provider-updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(update),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not send the provider update.");
    if (!data.booking?.id) throw new Error("The server returned an invalid provider update.");
    setBookings((current) => validBookings(current.map((booking) => booking.id === id ? data.booking : booking)));
    notifySync({ type: "booking-updated", bookingId: id });
    return data.booking;
  }, [notifySync, token]);

  const reportRunningLate = useCallback(async (id, delayMinutes) => {
    const response = await fetch(`/api/bookings/${id}/running-late`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ delayMinutes }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not notify the next client about the delay.");
    if (!data.booking?.id) throw new Error("The server returned an invalid delay notification.");
    setBookings((current) => {
      const exists = current.some((booking) => booking.id === data.booking.id);
      return validBookings(exists
        ? current.map((booking) => booking.id === data.booking.id ? data.booking : booking)
        : [data.booking, ...current]);
    });
    notifySync({ type: "booking-running-late", bookingId: data.booking.id });
    return data.booking;
  }, [notifySync, token]);

  const respondToLateNotice = useCallback(async (id, action) => {
    const response = await fetch(`/api/bookings/${id}/late-notice`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not save your response to the delay notice.");
    if (!data.booking?.id) throw new Error("The server returned an invalid delay response.");
    setBookings((current) => validBookings(current.map((booking) => booking.id === id ? data.booking : booking)));
    notifySync({ type: "booking-late-notice-responded", bookingId: id, action });
    return data.booking;
  }, [notifySync, token]);

  const respondToProviderUpdate = useCallback(async (id, updateId, action) => {
    const response = await fetch(`/api/bookings/${id}/provider-updates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ updateId, action }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not respond to the schedule request.");
    if (!data.booking?.id) throw new Error("The server returned an invalid schedule response.");
    setBookings((current) => validBookings(current.map((booking) => booking.id === id ? data.booking : booking)));
    notifySync({ type: "booking-updated", bookingId: id });
    return data.booking;
  }, [notifySync, token]);

  const respondToRevision = useCallback(async (id, revisionId, action, responseNote = "") => {
    const response = await fetch(`/api/bookings/${id}/revisions/${revisionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, responseNote }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not respond to the revision request.");
    if (!data.booking?.id) throw new Error("The server returned an invalid revision response.");
    setBookings((current) => validBookings(current.map((booking) => booking.id === id ? data.booking : booking)));
    notifySync({ type: "booking-updated", bookingId: id });
    return data.booking;
  }, [notifySync, token]);

  const confirmCashSettlement = useCallback(async (bookingId, confirmation) => {
    const normalizedConfirmation = confirmation === "cash_paid" || confirmation === "cash_received" ? confirmation : null;
    if (!bookingId || !normalizedConfirmation) {
      throw new Error("Choose a valid cash confirmation before continuing.");
    }

    const listResponse = await fetch("/api/conversations?includeArchived=false", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listResponse.json().catch(() => ({}));
    if (!listResponse.ok) throw new Error(listData.message || "Could not load the booking conversation.");

    const conversations = Array.isArray(listData?.conversations) ? listData.conversations : Array.isArray(listData) ? listData : [];
    const matchingConversation = conversations.find((conversation) => {
      const storedBookingId = conversation?.bookingId || conversation?.bookingId?._id;
      return String(storedBookingId ?? "") === String(bookingId);
    });

    let conversationId = matchingConversation?.id || matchingConversation?._id;
    if (!conversationId) {
      const createResponse = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId }),
      });
      const createData = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok) throw new Error(createData.message || "Could not open the booking conversation.");
      conversationId = createData?.conversation?.id || createData?.conversation?._id;
    }
    if (!conversationId) throw new Error("This booking does not have an active conversation yet.");

    const response = await fetch(`/api/conversations/${conversationId}/payment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ confirmation: normalizedConfirmation }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not confirm the cash payment.");

    await fetchBookings(undefined, true);
    return data.conversation || data.booking || null;
  }, [fetchBookings, token]);

  const value = useMemo(() => ({
    bookings,
    isLoading,
    error,
    createBooking,
    updateBookingStatus,
    submitCompletionProof,
    requestRevision,
    requestCancellation,
    submitReview,
    sendProviderUpdate,
    reportRunningLate,
    respondToLateNotice,
    respondToProviderUpdate,
    respondToRevision,
    confirmCashSettlement,
    refreshBookings: fetchBookings,
  }), [bookings, isLoading, error, createBooking, updateBookingStatus, submitCompletionProof, requestRevision, requestCancellation, submitReview, sendProviderUpdate, reportRunningLate, respondToLateNotice, respondToProviderUpdate, respondToRevision, confirmCashSettlement, fetchBookings]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBookings() {
  return useContext(BookingContext);
}
