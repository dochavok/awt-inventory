// NF-14: registers the app's service worker, looks for new versions while the
// app is open (version-checks.ts), and lets the new-version bar offer one.
// Only main.tsx imports this, since it needs the build's service worker module.

import { registerSW } from "virtual:pwa-register";
import { checkForNewVersions, type PageState } from "./version-checks";

/** The browser's own page state, for the checks. */
const browserPage: PageState = {
  online: () => navigator.onLine,
  visible: () => document.visibilityState === "visible",
  onVisibilityChange(listener) {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
  onOnline(listener) {
    window.addEventListener("online", listener);
    return () => window.removeEventListener("online", listener);
  },
};

/** How long Reload waits for the new version to take over before reloading anyway. */
const SWITCH_WAIT_MS = 3_000;

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
  let registration: ServiceWorkerRegistration | undefined;
  let switching = false;
  const listeners = new Set<() => void>();
  const offer = () => {
    if (ready) return;
    ready = true;
    listeners.forEach((l) => l());
  };

  // A new version is stored on the phone and waiting behind an older one: offer it, never switch
  // by itself (NF-14). Followed here rather than through the plugin's events, which miss a version
  // already installing when the page registers, and stop after one that fails.
  const offerIfWaiting = () => {
    if (registration?.waiting && registration.active) offer();
  };
  // Another window switched to a new version while this one wasn't looking: this page still runs
  // the old one, so offer the reload too.
  const hadController = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController && !switching) offer();
  });
  const follow = (worker: ServiceWorker | null) => {
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed") offerIfWaiting();
    });
  };

  const updateSW = registerSW({
    // Reload (below) reloads the page itself: the plugin's own reload skips a page that had no
    // service worker when it opened, such as the very first visit.
    onNeedReload() {},
    onRegisteredSW(_url, found) {
      if (!found) return;
      registration = found;
      found.addEventListener("updatefound", () => follow(found.installing));
      follow(found.installing);
      offerIfWaiting();
      checkForNewVersions(() => {
        found.update().catch((error: unknown) => console.warn("Couldn't look for a new version", error));
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
      // Nothing waiting: the new version already took over (from another window), so this page
      // only has to load again.
      if (!registration?.waiting) {
        window.location.reload();
        return;
      }
      // Once the waiting version takes over the page, load the page again from it; if it hasn't
      // taken over in a few seconds (it was replaced, or the message was lost), reload anyway.
      switching = true;
      navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
      await updateSW(true);
      setTimeout(() => window.location.reload(), SWITCH_WAIT_MS);
    },
  };
}
