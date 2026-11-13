// Times (NF-8, HI-3): stored as ISO 8601 UTC ("...Z"), shown in local time.

import { ValidationError } from "../errors";

/** A date and time in `timeZone` (an IANA name, e.g. "America/Chicago"), for display. */
export function formatLocal(iso: string, timeZone: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** A moment as a day on the user's own calendar, as file names use it: 2026-06-13. */
export function localDay(iso: string): string {
  // Built from its parts, so no browser's idea of a locale's date layout can change it.
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(
    new Date(iso),
  );
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** A moment as stored: ISO 8601 in UTC. */
export function toStoredTime(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new ValidationError("date", "That isn't a valid date and time.");
  return date.toISOString();
}
