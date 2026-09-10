import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Captured BEFORE register(): on a first install the new worker claims the
    // page and fires controllerchange too, which would reload every new visitor.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && hadController) worker.postMessage({ type: "SKIP_WAITING" });
          });
        });

        /*
         * An installed app is RESUMED far more often than it is navigated to, and
         * a resume triggers no update check at all — so a Home Screen app can sit
         * on a months-old shell while the server has long since moved on. Ask for
         * a new worker every time it comes back to the foreground.
         */
        const checkForUpdate = () => {
          if (document.visibilityState === "visible") registration.update().catch(() => {});
        };
        document.addEventListener("visibilitychange", checkForUpdate);
        window.addEventListener("focus", checkForUpdate);
        window.addEventListener("pageshow", (event) => { if (event.persisted) checkForUpdate(); });
      })
      .catch((error) => console.warn("[pwa] service worker registration failed:", error));

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // Guarded: controllerchange can fire more than once, and a reload loop in
      // an installed app is unescapable without deleting it.
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}
