// The only way to declare a Playwright test in this project (TF-4, TF-5):
//
//   browserRule({ req: ["NF-2"], m: "M2" }, "opens full screen from the home screen", async ({ page }) => { ... });
//
// Same tags and milestone rule as rule() for Vitest. The coverage check fails
// any listed browser test whose name has no tags.

import { test, type BrowserContext, type Page } from "@playwright/test";
import { runForMilestone, taggedName, type Tags } from "./tags";

export interface BrowserFixtures {
  page: Page;
  context: BrowserContext;
}

export function browserRule(
  tags: Tags,
  name: string,
  body: (fixtures: BrowserFixtures) => Promise<void>,
  options: { project?: "iphone" | "android" } = {},
): void {
  test(taggedName(tags, name), async ({ page, context }, testInfo) => {
    // A test about one phone only (e.g. Safari's Add to Home Screen) doesn't apply to the other.
    test.skip(options.project !== undefined && testInfo.project.name !== options.project, `${options.project} only`);
    const expectedFailure = await runForMilestone(tags, () => body({ page, context }));
    if (expectedFailure !== undefined) {
      testInfo.annotations.push({ type: "expected failure", description: expectedFailure });
    }
  });
}
