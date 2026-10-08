export function getUsernameError(username) {
  if (!username) return "Username is required.";
  if (username.length < 4) return "Username must be at least 4 characters.";
  if (username.length > 15) return "Username must be 15 characters or fewer.";
  if (!/^[A-Za-z0-9_.-]+$/.test(username)) {
    return "Use only letters, numbers, dots, underscores, and hyphens.";
  }
  if (/^\S+@\S+\.\S+$/.test(username)) return "Username cannot be an email address.";
  return "";
}

export function getPasswordStrength(password) {
  const requirements = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Uppercase and lowercase letters", met: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { label: "At least one number", met: /\d/.test(password) },
    { label: "At least one special character", met: /[^A-Za-z0-9\s]/.test(password) },
    { label: "No spaces", met: !/\s/.test(password) },
  ];
  const score = requirements.filter(({ met }) => met).length;
  const isGood = requirements[0].met
    && requirements[4].met
    && requirements.slice(1, 4).filter(({ met }) => met).length >= 2;
  const strength = score === requirements.length
    ? "Strong"
    : isGood
      ? "Good"
      : score >= 3
        ? "Fair"
        : "Weak";

  return { requirements, score, strength, isGood };
}

export function normalizePhilippineMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  return "";
}

export function getPhilippineMobileInputValue(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const nationalDigits = digits.startsWith("63")
    ? digits.slice(2)
    : digits.startsWith("0")
      ? digits.slice(1)
      : digits;
  return nationalDigits.slice(0, 10);
}
