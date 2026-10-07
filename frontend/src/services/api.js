const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
const API_PATH_PATTERN = /^\/api(?:\/|$)/;

function readStoredToken() {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    const saved = storage.getItem("taskpanda_auth");
    if (!saved) continue;

    try {
      const token = JSON.parse(saved)?.token;
      if (typeof token === "string" && token) return token;
    } catch {
      continue;
    }
  }
  return "";
}

function getApiRequestUrl(input) {
  const url = String(input);
  return API_BASE_URL && url.startsWith("/") && API_PATH_PATTERN.test(url)
    ? `${API_BASE_URL}${url}`
    : url;
}

export async function apiFetch(input, options = {}) {
  const inputUrl = input instanceof Request ? input.url : String(input);
  const requestUrl = getApiRequestUrl(inputUrl);
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(options.headers).forEach((value, name) => headers.set(name, value));

  const parsedUrl = new URL(requestUrl, window.location.origin);
  const apiOrigin = API_BASE_URL ? new URL(API_BASE_URL).origin : window.location.origin;
  if (parsedUrl.origin === apiOrigin && API_PATH_PATTERN.test(parsedUrl.pathname) && !headers.has("Authorization")) {
    const token = readStoredToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const requestInput = input instanceof Request ? new Request(requestUrl, input) : requestUrl;
  return fetch(requestInput, { ...options, headers });
}
