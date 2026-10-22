import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api.js";

const BOOKING_AVAILABILITY_REFRESH_MS = 30_000;

export default function useBookingAvailability() {
  const [availability, setAvailability] = useState("loading");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    let requestController = null;

    const refresh = async () => {
      if (requestController) return;
      requestController = new AbortController();
      try {
        const response = await apiFetch("/api/public/booking-availability", {
          cache: "no-store",
          signal: requestController.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Could not check booking availability.");
        if (active) setAvailability(result.bookingRequestsPaused ? "paused" : "available");
      } catch (error) {
        if (active && error.name !== "AbortError") setAvailability("unavailable");
      } finally {
        requestController = null;
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    const timerId = window.setInterval(refresh, BOOKING_AVAILABILITY_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      active = false;
      window.clearInterval(timerId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      requestController?.abort();
    };
  }, [retryKey]);

  const retry = useCallback(() => setRetryKey((key) => key + 1), []);

  return { isPaused: availability === "paused", isUnavailable: availability === "unavailable", retry };
}
