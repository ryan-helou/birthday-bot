import { api } from "./api.js";

/** VAPID keys travel as base64url; PushManager wants a Uint8Array. */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

/**
 * iOS only exposes the Push API to a web app that has been added to the Home
 * Screen — in Safari itself the button can never work, so say so rather than
 * letting the user press a dead control.
 */
export function iosNeedsInstall() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
  const installed = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  return isIOS && !installed && !("PushManager" in window);
}

/**
 * `navigator.serviceWorker.ready` never resolves when no worker can be
 * registered (blocked by policy, an embedded webview, a failed registration) —
 * it does not reject, it simply hangs. Anything awaiting it would hang with it,
 * so every read of the current subscription is raced against a timeout.
 */
function serviceWorkerReady(timeoutMs = 3000) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

export async function getExistingSubscription() {
  if (!pushSupported()) return null;
  const registration = await serviceWorkerReady();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("This browser does not support push notifications.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this site. Re-allow them in your browser's site settings."
        : "Notification permission was dismissed.",
    );
  }

  const { publicKey } = await api.publicKey();
  const registration = await serviceWorkerReady(10_000);
  if (!registration) {
    throw new Error(
      "The service worker did not start, so notifications cannot be registered. " +
        "Reload the page, and check that this browser allows service workers.",
    );
  }

  let subscription = await registration.pushManager.getSubscription();

  // If the stored subscription was made with a different VAPID key it will fail
  // silently at send time, so replace it rather than reusing it.
  if (subscription) {
    const current = new Uint8Array(subscription.options.applicationServerKey ?? new ArrayBuffer(0));
    const wanted = urlBase64ToUint8Array(publicKey);
    const same = current.length === wanted.length && current.every((byte, i) => byte === wanted[i]);
    if (!same) {
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await api.saveSubscription(subscription.toJSON(), deviceLabel());
  return subscription;
}

export async function disablePush() {
  const subscription = await getExistingSubscription();
  if (!subscription) return;
  await api.removeSubscription(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "This device";
}
