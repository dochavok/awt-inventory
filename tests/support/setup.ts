// Runs before every Vitest test file. Fails any test not declared with rule()
// (TF-4), whatever way it was imported, and puts real timers back after every
// test, so a test that fakes the clock can't change the tests after it (TF-7).

import { afterEach, vi } from "vitest";

afterEach((context) => {
  vi.useRealTimers();
  if (!context.task.meta.awt) {
    throw new Error(
      `"${context.task.name}" has no requirement tags. Declare it with rule() from tests/support/rule.ts (TF-4).`,
    );
  }
});
