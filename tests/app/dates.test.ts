// Dates as the app's forms take them (HI-3): a day picked in a date field
// becomes the time the store keeps. Times are the user's own (local) time, as
// the browser gives them.

import { expect, vi } from "vitest";
import { pickedDate } from "../../src/app/screens/common";
import { rule } from "../support/rule";

rule({ req: ["HI-3"], m: "M3" }, "a day picked as today means now; an earlier day means its midday", () => {
  // 9 in the morning, local time, on 12 November 2026.
  vi.useFakeTimers({ now: new Date(2026, 10, 12, 9, 0) });
  expect(pickedDate("2026-11-12"), "today, picked at 9 in the morning").toBeUndefined();
  expect(pickedDate(""), "no day picked").toBeUndefined();
  expect(pickedDate("2026-11-10"), "two days ago").toBe(new Date(2026, 10, 10, 12, 0).toISOString());
});
