// The clock (TF-2, NF-8). Times are stored and compared in UTC as ISO 8601
// strings ending in "Z"; they're shown in the user's local time.

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
