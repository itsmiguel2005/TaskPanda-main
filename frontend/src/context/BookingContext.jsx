import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext.jsx";

const BookingContext = createContext(null);

function validBookings(value) {
  return Array.isArray(value) ? value.filter((booking) => booking && booking.id && booking.status) : [];
}

export function BookingProvider({ children }) {
  const { token, isLoggedIn } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchBookings = useCallback(async (signal, silent = false) => {
    if (!isLoggedIn || !token) {
      setBookings([]);
      return;
    }
    if (!silent) setIsLoading(true);
    try {
      const response = await fetch("/api/bookings", {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load bookings.");
      if (!Array.isArray(data.bookings)) throw new Error("The booking API is outdated. Restart the backend and try again.");
      const nextBookings = validBookings(data.bookings);
      setBookings((currentBookings) => {
        const currentSnapshot = JSON.stringify(currentBookings);
        const nextSnapshot = JSON.stringify(nextBookings);
        return currentSnapshot === nextSnapshot ? currentBookings : nextBookings;
      });
      setError("");
    } catch (requestError) {
      if (requestError.name !== "AbortError") setError(requestError.message || "Could not load bookings.");
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
    const formData = new FormData();
    formData.append("providerId", details.providerId);
    formData.append("repairDescription", details.description);
    formData.append("address", details.address || "");
    formData.append("serviceDate", details.date);
    formData.append("timeSlot", details.time);
    formData.append("offeredPrice", String(details.offer));
    formData.append("urgency", details.urgency);
    formData.append("termsAccepted", String(details.termsAccepted));
    (details.photos || []).forEach((photo) => formData.append("photos", photo));
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not submit the booking.");
    if (!data.booking?.id) throw new Error("The server returned an invalid booking response. Restart the backend and try again.");
    setBookings((current) => validBookings([data.booking, ...current]));
    return data.booking;
  }, [token]);

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
    return data.booking;
  }, [token]);

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
    return data.booking;
  }, [token]);

  const value = useMemo(() => ({
    bookings,
    isLoading,
    error,
    createBooking,
    updateBookingStatus,
    requestCancellation,
    refreshBookings: fetchBookings,
  }), [bookings, isLoading, error, createBooking, updateBookingStatus, requestCancellation, fetchBookings]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBookings() {
  return useContext(BookingContext);
}
