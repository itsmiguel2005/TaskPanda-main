export function getProfileNameFields(user = {}) {
  const rawFullName = (user.fullName || "").trim();
  const parsedParts = rawFullName ? rawFullName.split(/\s+/).filter(Boolean) : [];

  return {
    firstName: user.firstName || parsedParts[0] || "",
    middleName: user.middleName ?? (parsedParts.length > 2 ? parsedParts.slice(1, -1).join(" ") : ""),
    lastName: user.lastName || (parsedParts.length > 1 ? parsedParts.at(-1) : ""),
  };
}
