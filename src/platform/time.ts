// Times (NF-8, HI-3): stored as ISO 8601 UTC ("...Z"), shown in local time.
// M1 stub.

import { NotImplementedError } from "../errors";

/** A date and time in `timeZone` (an IANA name, e.g. "America/Chicago"), for display. */
export function formatLocal(_iso: string, _timeZone: string, _locale = "en-US"): string {
  throw new NotImplementedError("formatLocal", "M2");
}

/** A moment as stored: ISO 8601 in UTC. */
export function toStoredTime(_date: Date): string {
  throw new NotImplementedError("toStoredTime", "M2");
}
