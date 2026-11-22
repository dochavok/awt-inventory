// NF-14: registers the app's service worker, looks for new versions while the
// app is open (version-checks.ts), and lets the new-version bar offer one.
// Only main.tsx imports this, since it needs the build's service worker module.

import { registerSW } from "virtual:pwa-register";
import { browserPage, checkForNewVersions } from "./version-checks";

/** What the new-version bar needs: whether one is ready, and a way to switch to it. */
export interface NewVersion {
  ready(): boolean;
  /** Calls the listener when a new version becomes ready; returns a function that stops it. */
  subscribe(listener: () => void): () => void;
  /** Switches to the new version, reloading the page. */
  reload(): Promise<void>;
}

export function watchForNewVersions(): NewVersion {
  let ready = false;
  const listeners = new Set<() => void>();
  const updateSW = registerSW({
    // Reload (below) reloads the page itself: the plugin's own reload skips a page that had no
    // service worker when it opened, such as the very first visit.
    onNeedReload() {},
    // A new version is stored on the phone and waiting: offer it, never switch by itself (NF-14).
    onNeedRefresh() {
      ready = true;
      listeners.forEach((l) => l());
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      checkForNewVersions(() => {
        registration.update().catch((error: unknown) => console.warn("Couldn't look for a new version", error));
      }, browserPage);
    },
  });
  return {
    ready: () => ready,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async reload() {
      // Once the waiting version takes over the page, load the page again from it.
      navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
      await updateSW(true);
    },
  };
}
