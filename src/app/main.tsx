// Placeholder app shell for M1: it lets the phone-sized browser tests run (and
// fail as expected) before any screen exists. M2 replaces it.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <main>
      <h1>AWT Inventory</h1>
      <p>Not built yet.</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
