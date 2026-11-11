// The only way to declare a Vitest test in this project (TF-4, TF-5):
//
//   rule({ req: ["GR-8"], m: "M4" }, "Aldric's total CM is 170", () => { ... });
//
// ESLint refuses `it` and `test` imported from vitest outside tests/support, and
// tests/support/setup.ts fails any test that didn't come through here.

import { test, type TestContext } from "vitest";
import { isFinished, runForMilestone, taggedName, type Tags } from "./tags";

declare module "vitest" {
  interface TaskMeta {
    awt?: { tags: Tags; expectedFailure?: string; passedEarly?: boolean };
  }
}

export type { Tags } from "./tags";

export function rule(
  tags: Tags,
  name: string,
  body: (context: TestContext) => unknown,
  options: { timeout?: number } = {},
): void {
  const fullName = taggedName(tags, name);
  test(
    fullName,
    async (context) => {
      context.task.meta.awt = { tags };
      const expectedFailure = await runForMilestone(tags, () => body(context));
      if (expectedFailure !== undefined) context.task.meta.awt.expectedFailure = expectedFailure;
      else if (!isFinished(tags)) context.task.meta.awt.passedEarly = true;
    },
    options.timeout,
  );
}
