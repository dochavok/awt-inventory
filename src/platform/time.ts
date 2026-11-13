// Times (NF-8, HI-3): stored as ISO 8601 UTC ("...Z"), shown in local time.

import { ValidationError } from "../errors";

/** A date and time in `timeZone` (an IANA name, e.g. "America/Chicago"), for display. */
export function formatLocal(iso: string, timeZone: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** A moment as a day on the user's own calendar, as file names use it: 2026-06-13. */
export function localDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA").format(new Date(iso));
}

/** A moment as stored: ISO 8601 in UTC. */
export function toStoredTime(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new ValidationError("date", "That isn't a valid date and time.");
  return date.toISOString();
}
