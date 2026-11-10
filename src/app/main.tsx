// The app's entry point: connects to Firebase and shows the app.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createServices } from "./services";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App services={createServices()} />
  </StrictMode>,
);
