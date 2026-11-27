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

/** The user's own time zone, for times shown to them (NF-8). */
export function localZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * When a user can send reports again after the day's limit (SP-1): the next
 * midnight UTC, as a time in `timeZone`, with "tomorrow" when that's the next
 * day there: "7:00 PM", "9:00 AM tomorrow".
 */
export function sendMoreFrom(nowIso: string, timeZone: string, locale = "en-US"): string {
  const now = new Date(nowIso);
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(d);
  const time = new Intl.DateTimeFormat(locale, { timeZone, timeStyle: "short" }).format(reset);
  return day(reset) === day(now) ? time : `${time} tomorrow`;
}

/** A moment as stored: ISO 8601 in UTC. */
export function toStoredTime(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new ValidationError("date", "That isn't a valid date and time.");
  return date.toISOString();
}
