const siteKey = String(import.meta.env.VITE_RECAPTCHA_SITE_KEY || "").trim();
let scriptPromise;

function loadRecaptchaScript() {
  if (!siteKey) {
    return Promise.reject(new Error("reCAPTCHA is not configured. Please contact support."));
  }
  if (window.grecaptcha?.ready) return Promise.resolve(window.grecaptcha);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.defer = true;
    script.dataset.recaptchaV3 = "true";
    script.addEventListener("load", () => {
      if (window.grecaptcha?.ready) resolve(window.grecaptcha);
      else {
        scriptPromise = undefined;
        reject(new Error("reCAPTCHA could not be initialized. Please try again."));
      }
    }, { once: true });
    script.addEventListener("error", () => {
      scriptPromise = undefined;
      reject(new Error("reCAPTCHA could not be loaded. Check your connection and try again."));
    }, { once: true });
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export async function executeRecaptcha(actionName) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("reCAPTCHA is unavailable in this environment.");
  }

  try {
    const grecaptcha = await loadRecaptchaScript();
    await new Promise((resolve) => grecaptcha.ready(resolve));
    const token = await grecaptcha.execute(siteKey, { action: actionName });
    if (typeof token !== "string" || !token) {
      throw new Error("Google did not return a verification token.");
    }
    return token;
  } catch (error) {
    throw new Error(`reCAPTCHA verification failed. ${error.message}`);
  }
}
