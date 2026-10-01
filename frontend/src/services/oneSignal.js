import OneSignal from "react-onesignal";

let initializationPromise;

export function initializeOneSignal() {
  const appId = String(import.meta.env.VITE_ONESIGNAL_APP_ID || "").trim();
  if (typeof window === "undefined" || !appId) return Promise.resolve(null);

  if (!initializationPromise) {
    initializationPromise = OneSignal.init({
      appId,
      serviceWorkerPath: "OneSignalSDKWorker.js",
      serviceWorkerParam: { scope: "/" },
      allowLocalhostAsSecureOrigin: true,
      promptOptions: {
        slidedown: {
          prompts: [{ type: "push", autoPrompt: false, delay: { pageViews: 1 } }],
        },
      },
    })
      .then(() => OneSignal)
      .catch((error) => {
        initializationPromise = null;
        throw error;
      });
  }

  return initializationPromise;
}

export async function identifyOneSignalUser(user, role) {
  const oneSignal = await initializeOneSignal();
  if (!oneSignal || !user || !role) return false;

  const externalId = role === "admin"
    ? `admin:${String(user.email || "").trim().toLowerCase()}`
    : String(user._id || user.id || "").trim();
  if (!externalId || externalId === "admin:") return false;

  if (oneSignal.User.externalId !== externalId) await oneSignal.login(externalId);
  oneSignal.User.addTags({ role: String(role).toLowerCase() });
  return true;
}

export async function clearOneSignalIdentity() {
  const oneSignal = await initializeOneSignal();
  if (oneSignal?.User.externalId) await oneSignal.logout();
}

export async function promptForPushPermission() {
  const oneSignal = await initializeOneSignal();
  if (!oneSignal) return "unavailable";
  if (!oneSignal.Notifications.isPushSupported()) return "unsupported";
  await oneSignal.Slidedown.promptPush();
  return "prompted";
}