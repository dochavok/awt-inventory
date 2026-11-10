// Prints how many tests passed, passed early, failed as expected and failed,
// by milestone (TF-5), after the usual Vitest output, then names the tests
// that passed early so a pull request can list them.

import type { Reporter, TestModule } from "vitest/node";

export default class MilestoneSummary implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const rows = new Map<string, { passed: number; early: number; expected: number; failed: number }>();
    const early: string[] = [];
    for (const module of modules) {
      for (const testCase of module.children.allTests()) {
        const awt = testCase.meta().awt;
        const milestone = awt?.tags.m ?? "untagged";
        const row = rows.get(milestone) ?? { passed: 0, early: 0, expected: 0, failed: 0 };
        const state = testCase.result().state;
        if (state === "failed") row.failed++;
        else if (state === "passed" && awt?.expectedFailure) row.expected++;
        else if (state === "passed" && awt?.passedEarly) {
          row.early++;
          early.push(testCase.name);
        } else if (state === "passed") row.passed++;
        rows.set(milestone, row);
      }
    }
    if (rows.size === 0) return;
    const lines = ["", " Milestone   passed   passed early   failed as expected   failed"];
    for (const [milestone, row] of [...rows].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(
        ` ${milestone.padEnd(10)} ${String(row.passed).padStart(7)} ${String(row.early).padStart(14)} ${String(row.expected).padStart(20)} ${String(row.failed).padStart(8)}`,
      );
    }
    if (early.length > 0) lines.push("", " Passed early (TF-5):", ...early.sort().map((name) => `   ${name}`));
    console.log(lines.join("\n") + "\n");
  }
}
