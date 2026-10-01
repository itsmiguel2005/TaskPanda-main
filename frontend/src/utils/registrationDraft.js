export function readRegistrationDraft(key, fallback) {
  try {
    const saved = sessionStorage.getItem(key) || localStorage.getItem(key);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...fallback, ...parsed }
      : fallback;
  } catch {
    return fallback;
  }
}

export function saveRegistrationDraft(key, value) {
  try {
    const serialized = JSON.stringify(value);
    sessionStorage.setItem(key, serialized);
    localStorage.setItem(key, serialized);
  } catch {
    // Keep the current form usable if browser storage is unavailable.
  }
}

export function clearRegistrationDraft(key) {
  try {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  } catch {
    // Registration is already complete if cleanup cannot be persisted.
  }
}