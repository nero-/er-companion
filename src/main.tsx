import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { flushPersistence } from "./lib/store";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

window.addEventListener("pagehide", flushPersistence);

// A new service worker takes control on the next navigation; reload once so the
// running tab is never left on stale JS after an update (progress is persisted).
if ("serviceWorker" in navigator && !("__TAURI_INTERNALS__" in window)) {
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}
