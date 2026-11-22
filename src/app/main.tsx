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

const newVersion = watchForNewVersions();

createRoot(document.getElementById("root")!, {
  onUncaughtError: renderError,
  onCaughtError: renderError,
}).render(
  <StrictMode>
    <App services={createServices()} newVersion={newVersion} />
  </StrictMode>,
);
