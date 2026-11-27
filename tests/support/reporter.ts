// Prints how many tests passed, passed early, failed as expected and failed,
// by milestone (TF-5), after the usual Vitest output, then names the tests
// that passed early so a pull request can list them.

import type { Reporter, TestModule } from "vitest/node";
import { emptyCounts, milestoneTable, type Counts } from "./milestone-table";

export default class MilestoneSummary implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const rows = new Map<string, Counts>();
    const early: string[] = [];
    for (const module of modules) {
      for (const testCase of module.children.allTests()) {
        const awt = testCase.meta().awt;
        const milestone = awt?.tags.m ?? "untagged";
        const row = rows.get(milestone) ?? emptyCounts();
        const state = testCase.result().state;
        if (state === "failed") row.failed++;
        else if (state === "passed" && awt?.expectedFailure) row["failed as expected"]++;
        else if (state === "passed" && awt?.passedEarly) {
          row["passed early"]++;
          early.push(testCase.name);
        } else if (state === "passed") row.passed++;
        rows.set(milestone, row);
      }
    }
    if (rows.size === 0) return;
    const lines = ["", ...milestoneTable(rows)];
    if (early.length > 0) lines.push("", " Passed early (TF-5):", ...early.sort().map((name) => `   ${name}`));
    console.log(lines.join("\n") + "\n");
  }
}
