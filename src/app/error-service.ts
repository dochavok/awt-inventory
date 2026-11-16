// Error reports to the maintainer through Sentry (NF-12). Only the production
// build has a DSN (VITE_SENTRY_DSN); without one nothing is sent. The SDK loads
// as its own file after the app starts, so it never slows the first screen
// (NF-4). Every event goes through errorReportFilter: refusals the user is shown
// are dropped, and the rest are scrubbed of game records, names and emails.

import { errorReportFilter, shouldReport, type ErrorEvent } from "../platform/error-reports";

type Sentry = typeof import("@sentry/browser");

let sentry: Sentry | undefined;

/** Starts the error service; `known` gives the signed-in user's display name and email when an error happens. */
export async function startErrorReports(known: () => { displayName?: string; email?: string }): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  const loaded = await import("@sentry/browser");
  const filter = errorReportFilter(known);
  loaded.init({
    dsn,
    release: __APP_VERSION__,
    // Collect nothing about the user or their requests; scrubEvent then removes anything left.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    // Our ErrorEvent is the part of Sentry's event that the filter reads and keeps.
    beforeSend: (event, hint) => filter(event as unknown as ErrorEvent, hint) as unknown as typeof event | null,
  });
  sentry = loaded;
}

/** Reports an error the app caught, unless it's a refusal the user was shown. */
export function reportError(error: unknown): void {
  if (shouldReport(error)) sentry?.captureException(error);
}
