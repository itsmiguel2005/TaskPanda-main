const draftKeys = {
  client: ["clientNameStep", "clientLocationStep", "clientPhoneStep"],
  worker: ["workerNameStep", "workerProfessionStep", "workerLocationStep", "workerDobStep", "workerPhoneStep"],
};

function getStepKey(role) {
  return role === "worker" ? "workerStep1" : "clientStep1";
}

function getRoleForDraft(key) {
  if (key.startsWith("worker")) return "worker";
  if (key.startsWith("client")) return "client";
  return null;
}

function getBrowserStorage(name) {
  if (typeof window === "undefined") return null;
  try {
    return window[name];
  } catch {
    return null;
  }
}

function getStorageValue(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setStorageValue(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Registration can continue if browser storage is unavailable.
  }
}

function removeStorageValue(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Registration can continue if browser storage is unavailable.
  }
}

function createDraftId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getAttemptIndexKey(role, email) {
  let firstHash = 2166136261;
  let secondHash = 5381;
  for (const character of email.trim().toLowerCase()) {
    const code = character.codePointAt(0);
    firstHash = Math.imul(firstHash ^ code, 16777619);
    secondHash = Math.imul(secondHash, 33) ^ code;
  }
  return `taskpanda_registration_attempt:${role}:${(firstHash >>> 0).toString(36)}:${(secondHash >>> 0).toString(36)}`;
}

function readIndexedDraftId(role, email) {
  return getStorageValue(getBrowserStorage("localStorage"), getAttemptIndexKey(role, email));
}

function saveIndexedDraftId(role, email, draftId) {
  setStorageValue(getBrowserStorage("localStorage"), getAttemptIndexKey(role, email), draftId);
}

function readStep(role) {
  const stepKey = getStepKey(role);
  const raw = getStorageValue(getBrowserStorage("sessionStorage"), stepKey)
    || getStorageValue(getBrowserStorage("localStorage"), stepKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function migrateLegacyDrafts(role, draftId) {
  for (const key of draftKeys[role]) {
    const sessionStorage = getBrowserStorage("sessionStorage");
    const localStorage = getBrowserStorage("localStorage");
    const legacyValue = getStorageValue(sessionStorage, key) || getStorageValue(localStorage, key);
    if (!legacyValue) continue;
    const scopedKey = `${key}:${draftId}`;
    setStorageValue(sessionStorage, scopedKey, legacyValue);
    setStorageValue(localStorage, scopedKey, legacyValue);
    removeStorageValue(sessionStorage, key);
    removeStorageValue(localStorage, key);
  }
}

function persistStep(role, step) {
  const stepKey = getStepKey(role);
  setStorageValue(getBrowserStorage("sessionStorage"), stepKey, JSON.stringify(step));
  removeStorageValue(getBrowserStorage("localStorage"), stepKey);
}

function getRegistrationAttempt(role) {
  const step = readStep(role);
  if (!step?.email) return null;
  if (step.draftId) return step;

  const migratedStep = { ...step, draftId: createDraftId() };
  migrateLegacyDrafts(role, migratedStep.draftId);
  persistStep(role, migratedStep);
  saveIndexedDraftId(role, migratedStep.email, migratedStep.draftId);
  return migratedStep;
}

export function startRegistrationAttempt(role, step) {
  getRegistrationAttempt(role);
  const sessionStorage = getBrowserStorage("sessionStorage");
  const localStorage = getBrowserStorage("localStorage");
  for (const key of draftKeys[role]) {
    removeStorageValue(sessionStorage, key);
    removeStorageValue(localStorage, key);
  }

  const attempt = { ...step, draftId: createDraftId() };
  persistStep(role, attempt);
  saveIndexedDraftId(role, attempt.email, attempt.draftId);
  return attempt;
}

export function resumeRegistrationAttempt(role, step) {
  const existingAttempt = getRegistrationAttempt(role);
  const normalizedEmail = typeof step.email === "string" ? step.email.trim().toLowerCase() : "";
  const existingEmail = typeof existingAttempt?.email === "string"
    ? existingAttempt.email.trim().toLowerCase()
    : "";
  const sameEmail = Boolean(normalizedEmail) && existingEmail === normalizedEmail;
  const indexedDraftId = normalizedEmail ? readIndexedDraftId(role, normalizedEmail) : null;
  const attempt = {
    ...(sameEmail ? existingAttempt : {}),
    ...step,
    draftId: sameEmail ? existingAttempt.draftId : indexedDraftId || createDraftId(),
  };
  persistStep(role, attempt);
  if (normalizedEmail) saveIndexedDraftId(role, normalizedEmail, attempt.draftId);
  return attempt;
}

function getScopedDraftKey(key) {
  const role = getRoleForDraft(key);
  if (!role) return null;
  const attempt = getRegistrationAttempt(role);
  return attempt ? `${key}:${attempt.draftId}` : null;
}

export function readRegistrationDraft(key, fallback) {
  try {
    const scopedKey = getScopedDraftKey(key);
    if (!scopedKey) return fallback;
    const saved = getStorageValue(getBrowserStorage("sessionStorage"), scopedKey)
      || getStorageValue(getBrowserStorage("localStorage"), scopedKey);
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
    const scopedKey = getScopedDraftKey(key);
    if (!scopedKey) return;
    const serialized = JSON.stringify(value);
    setStorageValue(getBrowserStorage("sessionStorage"), scopedKey, serialized);
    setStorageValue(getBrowserStorage("localStorage"), scopedKey, serialized);
  } catch {
    // Keep the current form usable if browser storage is unavailable.
  }
}

export function clearRegistrationAttemptDrafts(role) {
  const attempt = getRegistrationAttempt(role);
  const sessionStorage = getBrowserStorage("sessionStorage");
  const localStorage = getBrowserStorage("localStorage");
  if (attempt) {
    for (const key of draftKeys[role]) {
      removeStorageValue(sessionStorage, `${key}:${attempt.draftId}`);
      removeStorageValue(localStorage, `${key}:${attempt.draftId}`);
    }
    const indexKey = getAttemptIndexKey(role, attempt.email);
    if (getStorageValue(localStorage, indexKey) === attempt.draftId) {
      removeStorageValue(localStorage, indexKey);
    }
  }
  for (const key of draftKeys[role]) {
    removeStorageValue(sessionStorage, key);
    removeStorageValue(localStorage, key);
  }
}
