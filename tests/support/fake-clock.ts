// A fake clock in UTC (TF-2). Starts on a made-up faire Saturday.

import type { Clock } from "../../src/platform/clock";

export const FAIRE_SATURDAY = "2026-06-13T15:00:00.000Z";

export class FakeClock implements Clock {
  private current: number;

  constructor(start: string = FAIRE_SATURDAY) {
    this.current = Date.parse(start);
    if (!start.endsWith("Z") || Number.isNaN(this.current)) throw new Error(`FakeClock needs a UTC time, got ${start}`);
  }

  now(): Date {
    return new Date(this.current);
  }

  iso(): string {
    return new Date(this.current).toISOString();
  }

  set(iso: string): void {
    if (!iso.endsWith("Z")) throw new Error(`FakeClock needs a UTC time, got ${iso}`);
    this.current = Date.parse(iso);
  }

  advance(ms: number): void {
    this.current += ms;
  }

  advanceSeconds(seconds: number): void {
    this.advance(seconds * 1000);
  }

  advanceDays(days: number): void {
    this.advance(days * 24 * 60 * 60 * 1000);
  }
}
