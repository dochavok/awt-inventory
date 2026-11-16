// Error reports to the maintainer through Sentry (NF-12). Only the production
// build has a DSN (VITE_SENTRY_DSN); without one nothing is sent. The SDK (only
// the parts in ./sentry, about 30 kB) loads as its own file while the app
// starts; errors the app catches before it's ready are kept and sent once it
// is. Every event goes through errorReportFilter: refusals the user is shown
// are dropped, and the rest are scrubbed of game records, names and emails.

import { errorReportFilter, type ErrorEvent } from "../platform/error-reports";
import { isReportable } from "./messages";

type Known = { displayName?: string; email?: string };

let sentry: typeof import("./sentry") | undefined;

/**
 * Errors caught before the SDK loaded, each with who was signed in when it
 * happened. Only the first few, so a loop can't fill memory.
 */
const early: { error: unknown; who: Promise<Known> }[] = [];
const EARLY_MAX = 10;
let lookUp: (() => Promise<Known>) | undefined;

/**
 * Starts the error service. `known` looks up the signed-in user's display name
 * and email when an error is about to be sent.
 */
export function startErrorReports(known: () => Promise<Known>): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  lookUp = known;
  import("./sentry").then(
    (loaded) => {
      loaded.init({
        dsn,
        release: __APP_VERSION__,
        // Collect nothing about the user or their requests; scrubEvent then removes anything left.
        dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
        beforeSend: async (event, hint) => {
          if (!isReportable(hint.originalException)) return null;
          let who: Known;
          try {
            who = await ((hint.data as { who?: Promise<Known> } | undefined)?.who ?? known());
          } catch {
            // Without the name the report can't be scrubbed of it, so it isn't sent.
            return null;
          }
          const filter = errorReportFilter(() => who, isReportable);
          // Our ErrorEvent is the part of Sentry's event that the filter reads and keeps.
          return filter(event as unknown as ErrorEvent, hint) as unknown as typeof event | null;
        },
      });
      sentry = loaded;
      for (const { error, who } of early.splice(0)) loaded.captureException(error, { data: { who } });
    },
    () => {
      // Only a failed load lands here (no signal for the SDK): nothing can be sent this session.
      lookUp = undefined;
      early.length = 0;
    },
  );
}

/** Reports an error the app caught, unless it's a refusal the user was shown. */
export function reportError(error: unknown): void {
  if (!lookUp || !isReportable(error)) return;
  if (sentry) sentry.captureException(error);
  else if (early.length < EARLY_MAX) {
    const who = lookUp();
    who.catch(() => undefined); // Handled when it's sent.
    early.push({ error, who });
  }
}
