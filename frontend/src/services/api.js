const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
const API_PATH_PATTERN = /^\/api(?:\/|$)/;
const API_GET_CACHE_TTL_MS = 12_000;
const API_GET_CACHE_MAX_ENTRIES = 80;
const API_GET_CACHE_MAX_BODY_LENGTH = 512_000;
const apiGetCache = new Map();
let apiCacheGeneration = 0;

function clearApiGetCache() {
  apiCacheGeneration += 1;
  apiGetCache.clear();
}

function isMessagingEndpoint(pathname) {
  return /^\/api\/(?:conversations|messages)(?:\/|$)/.test(pathname);
}

function isCacheableGet(pathname, method, options, input) {
  const cacheMode = options.cache || (input instanceof Request ? input.cache : "default");
  const credentials = options.credentials || (input instanceof Request ? input.credentials : "same-origin");
  const isPublicLocationLookup = pathname.startsWith("/api/auth/location/");
  const isAuthEndpoint = pathname.startsWith("/api/auth/") && !isPublicLocationLookup;

  return method === "GET"
    && cacheMode === "default"
    && credentials !== "include"
    && !isAuthEndpoint
    && !isMessagingEndpoint(pathname)
    && !pathname.startsWith("/api/cron/");
}

async function getAuthCacheKey(authorization) {
  if (!authorization) return "public";
  if (!globalThis.crypto?.subtle) return null;

  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(authorization));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createCachedResponse(entry) {
  return new Response(entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers: entry.headers,
  });
}

function pruneApiGetCache(now) {
  for (const [key, entry] of apiGetCache) {
    if (entry.expiresAt <= now) apiGetCache.delete(key);
  }
  while (apiGetCache.size > API_GET_CACHE_MAX_ENTRIES) {
    apiGetCache.delete(apiGetCache.keys().next().value);
  }
}

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

  const requestMethod = input instanceof Request ? input.method : "GET";
  const method = String(options.method || requestMethod).toUpperCase();
  const isApiRequest = parsedUrl.origin === apiOrigin && API_PATH_PATTERN.test(parsedUrl.pathname);
  const requestInput = input instanceof Request ? new Request(requestUrl, input) : requestUrl;

  if (isApiRequest && method !== "GET" && method !== "HEAD") clearApiGetCache();
  if (!isApiRequest || !isCacheableGet(parsedUrl.pathname, method, options, input)) {
    const fetchOptions = { ...options, headers };
    if (method === "GET" && isMessagingEndpoint(parsedUrl.pathname)) fetchOptions.cache = "no-store";
    return fetch(requestInput, fetchOptions);
  }
  if (options.signal?.aborted) throw new DOMException("The request was aborted.", "AbortError");

  const authorizationKey = await getAuthCacheKey(headers.get("Authorization") || "");
  if (authorizationKey === null) return fetch(requestInput, { ...options, headers });

  const cacheKey = `${authorizationKey}:${headers.get("Accept") || ""}:${parsedUrl.href}`;
  const now = Date.now();
  pruneApiGetCache(now);
  const cached = apiGetCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    apiGetCache.delete(cacheKey);
    apiGetCache.set(cacheKey, cached);
    return createCachedResponse(cached);
  }

  const generation = apiCacheGeneration;
  const response = await fetch(requestInput, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const cacheControl = response.headers.get("cache-control") || "";
  if (
    response.ok
    && contentType.includes("application/json")
    && !/\bno-store\b/i.test(cacheControl)
    && !response.headers.has("set-cookie")
    && generation === apiCacheGeneration
  ) {
    const body = await response.clone().text();
    if (body.length <= API_GET_CACHE_MAX_BODY_LENGTH) {
      try {
        JSON.parse(body);
        apiGetCache.set(cacheKey, {
          body,
          status: response.status,
          statusText: response.statusText,
          headers: [...response.headers.entries()],
          expiresAt: now + API_GET_CACHE_TTL_MS,
        });
        pruneApiGetCache(Date.now());
      } catch {
        // Only cache complete JSON responses.
      }
    }
  }

  return response;
}
