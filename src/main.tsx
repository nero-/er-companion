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
