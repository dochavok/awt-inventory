// The app's entry point: connects to Firebase and shows the app.
import { StrictMode, type ErrorInfo } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { reportError } from "./error-service";
import { watchForNewVersions } from "./new-version";
import { createServices } from "./services";
import "./styles.css";

/** NF-12: errors while drawing a screen are reported, and still logged as React would. */
function renderError(error: unknown, info: ErrorInfo) {
  console.error(error, info.componentStack);
  reportError(error);
}

// Some browsers can't store the app (a private window, a page not served over https): it still runs.
const newVersion = "serviceWorker" in navigator ? watchForNewVersions() : undefined;

createRoot(document.getElementById("root")!, {
  // The app has stopped: a new version (perhaps the fix) takes over by itself (NF-14).
  onUncaughtError(error, info) {
    renderError(error, info);
    newVersion?.stopped();
  },
  onCaughtError: renderError,
}).render(
  <StrictMode>
    <App services={createServices()} newVersion={newVersion} />
  </StrictMode>,
);
