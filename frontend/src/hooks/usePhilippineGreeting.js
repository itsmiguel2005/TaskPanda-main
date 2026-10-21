import { useEffect, useState } from "react";

const PHILIPPINE_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function getPhilippineGreeting(date = new Date()) {
  const philippineHour = new Date(date.getTime() + PHILIPPINE_TIME_OFFSET_MS).getUTCHours();

  if (philippineHour >= 5 && philippineHour < 12) return "Good morning";
  if (philippineHour === 12) return "Good noon";
  if (philippineHour < 18 && philippineHour >= 13) return "Good afternoon";
  return "Good evening";
}

export default function usePhilippineGreeting(enabled = true) {
  const [greeting, setGreeting] = useState(() => getPhilippineGreeting());

  useEffect(() => {
    if (!enabled) return undefined;

    let timeoutId;

    const scheduleNextUpdate = () => {
      const delay = HOUR_MS - (Date.now() % HOUR_MS);
      timeoutId = window.setTimeout(() => {
        setGreeting(getPhilippineGreeting());
        scheduleNextUpdate();
      }, delay);
    };

    const refreshGreeting = () => setGreeting(getPhilippineGreeting());
    const refreshWhenVisible = () => {
      if (!document.hidden) refreshGreeting();
    };

    scheduleNextUpdate();
    window.addEventListener("focus", refreshGreeting);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("focus", refreshGreeting);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [enabled]);

  return greeting;
}
