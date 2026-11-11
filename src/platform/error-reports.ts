// Error reports to the maintainer (NF-12). Every event passes through
// scrubEvent before it's sent. M1 stub.

import { NotImplementedError } from "../errors";

/** The parts of an error event the app sends (a subset of Sentry's event). */
export interface ErrorEvent {
  message?: string;
  exception?: { values?: { type?: string; value?: string; stacktrace?: unknown }[] };
  user?: Record<string, unknown>;
  request?: { url?: string; data?: unknown; headers?: Record<string, string> };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
  tags?: Record<string, string>;
}

/**
 * Removes game records, display names and email addresses (NF-12). `known`
 * holds the signed-in user's display name and email, to strip wherever they
 * appear in text.
 */
export function scrubEvent(_event: ErrorEvent, _known: { displayName?: string; email?: string }): ErrorEvent {
  throw NotImplementedError.stub("scrubEvent", "M3");
}
