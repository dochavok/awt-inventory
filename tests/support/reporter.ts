// Prints how many tests passed and how many failed as expected, by milestone
// (TF-5), after the usual Vitest output.

import type { Reporter, TestModule } from "vitest/node";

export default class MilestoneSummary implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const rows = new Map<string, { passed: number; expected: number; failed: number }>();
    for (const module of modules) {
      for (const testCase of module.children.allTests()) {
        const awt = testCase.meta().awt;
        const milestone = awt?.tags.m ?? "untagged";
        const row = rows.get(milestone) ?? { passed: 0, expected: 0, failed: 0 };
        const state = testCase.result().state;
        if (state === "failed") row.failed++;
        else if (state === "passed" && awt?.expectedFailure) row.expected++;
        else if (state === "passed") row.passed++;
        rows.set(milestone, row);
      }
    }
    if (rows.size === 0) return;
    const lines = ["", " Milestone   passed   failed as expected   failed"];
    for (const [milestone, row] of [...rows].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(
        ` ${milestone.padEnd(10)} ${String(row.passed).padStart(7)} ${String(row.expected).padStart(20)} ${String(row.failed).padStart(8)}`,
      );
    }
    console.log(lines.join("\n") + "\n");
  }
}
