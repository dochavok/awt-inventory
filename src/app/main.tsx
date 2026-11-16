// The app's entry point: connects to Firebase and shows the app.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { reportError } from "./error-service";
import { createServices } from "./services";
import "./styles.css";

// NF-12: errors while drawing a screen are reported too.
createRoot(document.getElementById("root")!, {
  onUncaughtError: reportError,
  onCaughtError: reportError,
}).render(
  <StrictMode>
    <App services={createServices()} />
  </StrictMode>,
);
