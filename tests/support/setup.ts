// Runs before every Vitest test file. Fails any test not declared with rule()
// (TF-4), whatever way it was imported.

import { afterEach } from "vitest";

afterEach((context) => {
  if (!context.task.meta.awt) {
    throw new Error(
      `"${context.task.name}" has no requirement tags. Declare it with rule() from tests/support/rule.ts (TF-4).`,
    );
  }
});
