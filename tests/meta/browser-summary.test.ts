// The browser tests' summary (TF-5): a milestone table for each phone, and the
// tests whose result differs between the phones, so a test that fails on only
// one phone shows before its milestone finishes. M1, so these must pass.

import type { TestCase, TestResult } from "@playwright/test/reporter";
import { expect, vi } from "vitest";
import BrowserSummary, { formatSummary, outcomeOf, summarise, type BrowserResult } from "../support/browser-summary";
import { rule } from "../support/rule";

const T1 = "[EQ-2 · M5] blocks a second shield";
const T2 = "[PV-1 · M5] lists a trade";
const T3 = "[NF-2 · M3] opens full screen";

function result(project: string, title: string, outcome: BrowserResult["outcome"], file = "a.spec.ts"): BrowserResult {
  return { project, file, title, outcome };
}

rule({ req: ["TF-5"], m: "M1" }, "a browser test's result counts as what the harness recorded", () => {
  const annotation = (type: string) => [{ type, description: "M5 isn't finished" }];
  expect(outcomeOf("passed", annotation("expected failure"))).toBe("failed as expected");
  expect(outcomeOf("passed", annotation("passed early"))).toBe("passed early");
  expect(outcomeOf("passed", [])).toBe("passed");
  expect(outcomeOf("failed", annotation("expected failure"))).toBe("failed");
  expect(outcomeOf("timedOut", [])).toBe("failed");
  expect(outcomeOf("interrupted", [])).toBe("failed");
  expect(outcomeOf("skipped", [])).toBe("skipped");
});

rule({ req: ["TF-5"], m: "M1" }, "each phone gets its own count of results by milestone", () => {
  const summary = summarise([
    result("iphone", T1, "failed as expected"),
    result("iphone", T2, "failed as expected"),
    result("iphone", T3, "passed"),
    result("android", T1, "passed early"),
    result("android", T2, "failed as expected"),
    result("android", T3, "failed"),
    result("android", "[NF-2 · M3] iPhone only", "skipped"),
  ]);
  expect(summary.phones.get("iphone")).toEqual(
    new Map([
      ["M3", { passed: 1, early: 0, expected: 0, failed: 0 }],
      ["M5", { passed: 0, early: 0, expected: 2, failed: 0 }],
    ]),
  );
  expect(summary.phones.get("android")).toEqual(
    new Map([
      ["M3", { passed: 0, early: 0, expected: 0, failed: 1 }],
      ["M5", { passed: 0, early: 1, expected: 1, failed: 0 }],
    ]),
  );
});

rule(
  { req: ["TF-5"], m: "M1" },
  "only tests whose result differs between the phones are listed, with both results",
  () => {
    const summary = summarise([
      result("iphone", T1, "failed as expected"),
      result("android", T1, "passed early"),
      // The same on both phones: not listed.
      result("iphone", T2, "failed as expected"),
      result("android", T2, "failed as expected"),
      // Skipped on one phone (a test for the other phone only): not listed.
      result("iphone", T3, "passed"),
      result("android", T3, "skipped"),
      // The same name in another file is another test.
      result("iphone", T2, "failed as expected", "b.spec.ts"),
      result("android", T2, "failed", "b.spec.ts"),
    ]);
    expect(summary.differing).toEqual([
      { file: "a.spec.ts", title: T1, results: { iphone: "failed as expected", android: "passed early" } },
      { file: "b.spec.ts", title: T2, results: { iphone: "failed as expected", android: "failed" } },
    ]);
  },
);

rule({ req: ["TF-5"], m: "M1" }, "the summary prints a table per phone, then the differing tests", () => {
  const text = formatSummary(
    summarise([
      result("iphone", T1, "failed as expected"),
      result("iphone", T3, "passed"),
      result("android", T1, "passed early"),
      result("android", T3, "passed"),
    ]),
  );
  expect(text).toBe(
    [
      "",
      " iphone",
      " Milestone   passed   passed early   failed as expected   failed",
      " M3               1              0                    0        0",
      " M5               0              0                    1        0",
      "",
      " android",
      " Milestone   passed   passed early   failed as expected   failed",
      " M3               1              0                    0        0",
      " M5               0              1                    0        0",
      "",
      " Results that differ between the phones (TF-5):",
      `   ${T1} (a.spec.ts): iphone failed as expected, android passed early`,
      "",
    ].join("\n"),
  );
  // With no differing tests, it says so rather than leaving the reader to wonder.
  expect(formatSummary(summarise([result("iphone", T3, "passed"), result("android", T3, "passed")]))).toContain(
    " No results differ between the phones.",
  );
  // With one phone run (e.g. `--project android`), there's nothing to compare, and it says that instead.
  const onePhone = formatSummary(summarise([result("android", T1, "passed early")]));
  expect(onePhone).toContain(" Only one phone ran, so there's nothing to compare.");
  expect(onePhone).not.toContain("No results differ");
});

rule({ req: ["TF-5"], m: "M1" }, "the reporter counts a retried test's last result, on each phone", () => {
  const fakeTest = (project: string, title: string) =>
    ({
      id: `${project}:${title}`,
      title,
      // As Playwright reports them: the location is browserRule()'s, the spec file is in the title path.
      location: { file: "/repo/tests/support/browser-rule.ts", line: 22, column: 3 },
      titlePath: () => ["", project, "a.spec.ts", title],
      parent: { project: () => ({ name: project }) },
    }) as unknown as TestCase;
  const fakeResult = (status: TestResult["status"], annotations: TestResult["annotations"] = []) =>
    ({ status, annotations }) as unknown as TestResult;

  const reporter = new BrowserSummary();
  reporter.onTestEnd(fakeTest("iphone", T1), fakeResult("failed"));
  reporter.onTestEnd(fakeTest("iphone", T1), fakeResult("passed", [{ type: "expected failure" }]));
  reporter.onTestEnd(fakeTest("android", T1), fakeResult("passed", [{ type: "passed early" }]));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    reporter.onEnd();
    expect(log).toHaveBeenCalledTimes(1);
    const printed = String(log.mock.calls[0]![0]);
    expect(printed).toContain(" M5               0              0                    1        0");
    expect(printed).not.toContain(" M5               0              0                    0        1");
    expect(printed).toContain(`   ${T1} (a.spec.ts): iphone failed as expected, android passed early`);
  } finally {
    log.mockRestore();
  }
});

rule({ req: ["TF-5"], m: "M1" }, "the reporter prints nothing when no browser test ran", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    new BrowserSummary().onEnd();
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
