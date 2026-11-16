// Error reports to the maintainer through Sentry (NF-12). Only the production
// build has a DSN (VITE_SENTRY_DSN); without one nothing is sent. The SDK loads
// as its own file once the page has finished loading, so it doesn't compete
// with the first screen on weak signal (NF-4); errors from before then are kept
// and sent once it has loaded. Every event goes through errorReportFilter:
// refusals the user is shown are dropped, and the rest are scrubbed of game
// records, names and emails.

import { errorReportFilter, type ErrorEvent } from "../platform/error-reports";
import { isReportable } from "./messages";

type Known = { displayName?: string; email?: string };

let sentry: typeof import("@sentry/browser") | undefined;

/** Errors caught before the SDK loaded; only the first few, so a loop can't fill memory. */
const early: unknown[] = [];
const EARLY_MAX = 10;
let enabled = false;

/** How long after the page has loaded the SDK is fetched. */
const START_DELAY_MS = 3000;

/**
 * Starts the error service once the page has loaded. `known` looks up the
 * signed-in user's display name and email when an error is about to be sent.
 */
export function startErrorReports(known: () => Promise<Known>): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  enabled = true;
  const start = async () => {
    const loaded = await import("@sentry/browser");
    loaded.init({
      dsn,
      release: __APP_VERSION__,
      // Collect nothing about the user or their requests; scrubEvent then removes anything left.
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
      // Our ErrorEvent is the part of Sentry's event that the filter reads and keeps.
      beforeSend: async (event, hint) => {
        let who: Known;
        try {
          who = await known();
        } catch {
          // Without the name the report can't be scrubbed of it, so it isn't sent.
          return null;
        }
        const filter = errorReportFilter(() => who, isReportable);
        return filter(event as unknown as ErrorEvent, hint) as unknown as typeof event | null;
      },
    });
    sentry = loaded;
    for (const error of early.splice(0)) loaded.captureException(error);
  };
  const later = () => setTimeout(() => void start(), START_DELAY_MS);
  if (document.readyState === "complete") later();
  else window.addEventListener("load", later, { once: true });
}

/** Reports an error the app caught, unless it's a refusal the user was shown. */
export function reportError(error: unknown): void {
  if (!enabled || !isReportable(error)) return;
  if (sentry) sentry.captureException(error);
  else if (early.length < EARLY_MAX) early.push(error);
}
