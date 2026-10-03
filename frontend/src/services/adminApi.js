export async function adminRequest(path, token, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(response.ok ? "The server returned an unreadable response." : `Request failed (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const error = new Error(result.message || `Request failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return result;
}
