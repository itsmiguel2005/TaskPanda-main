export function getSafeInternalPath(value) {
  const pathname = typeof value === "string" ? value : value?.pathname;
  if (
    typeof pathname !== "string"
    || !pathname.startsWith("/")
    || pathname.startsWith("//")
    || pathname.includes("\\")
    || /[\u0000-\u001f\u007f]/.test(pathname)
  ) {
    return null;
  }

  const search = typeof value === "object" && typeof value.search === "string" && value.search.startsWith("?")
    ? value.search
    : "";
  const hash = typeof value === "object" && typeof value.hash === "string" && value.hash.startsWith("#")
    ? value.hash
    : "";
  const path = typeof value === "string" ? value.slice(pathname.length) : "";
  const suffix = path && (path.startsWith("?") || path.startsWith("#")) ? path : `${search}${hash}`;

  try {
    const destination = new URL(`${pathname}${suffix}`, "https://taskpanda.local");
    return destination.origin === "https://taskpanda.local" && !destination.pathname.startsWith("//")
      ? `${destination.pathname}${destination.search}${destination.hash}`
      : null;
  } catch {
    return null;
  }
}
