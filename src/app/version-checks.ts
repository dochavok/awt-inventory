// NF-14: when the app looks for a new version of itself. Kept apart from the
// service worker's registration (new-version.ts) so it can be tested alone.

/** How often the app looks again while it stays open (NF-14: at least once an hour). */
export const CHECK_EVERY_MS = 60 * 60 * 1000;

/** What the checks need from the page; the browser's own in the app. */
export interface PageState {
  online(): boolean;
  visible(): boolean;
  /** Calls the listener each time the page is hidden or shown; returns a function that stops it. */
  onVisibilityChange(listener: () => void): () => void;
}

/** Calls `check` as the app opens, when it's brought back, and every hour, with signal only. Returns a stop function. */
export function checkForNewVersions(check: () => void, page: PageState): () => void {
  const look = () => {
    if (page.online()) check();
  };
  const stopListening = page.onVisibilityChange(() => {
    if (page.visible()) look();
  });
  const timer = setInterval(look, CHECK_EVERY_MS);
  look();
  return () => {
    stopListening();
    clearInterval(timer);
  };
}

/** The browser's own page state. */
export const browserPage: PageState = {
  online: () => navigator.onLine,
  visible: () => document.visibilityState === "visible",
  onVisibilityChange(listener) {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
};
