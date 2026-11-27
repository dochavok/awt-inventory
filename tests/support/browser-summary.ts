// Prints the browser tests' milestone table for each phone (TF-5), after
// Playwright's own list, then the tests whose result differs between the
// phones. Playwright prints a test that failed as expected as ✓, so without
// this a test failing on one phone only looks like a pass until its milestone
// finishes (it hid four WebKit failures through M3).

import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { parseTaggedName } from "./tags";

export type Outcome = "passed" | "passed early" | "failed as expected" | "failed" | "skipped";

export interface BrowserResult {
  project: string;
  /** The test file, relative to tests/browser/. */
  file: string;
  title: string;
  outcome: Outcome;
}

interface Counts {
  passed: number;
  early: number;
  expected: number;
  failed: number;
}

export interface Summary {
  /** Each phone's counts by milestone, phones in the order they first appear. */
  phones: Map<string, Map<string, Counts>>;
  /** Tests run on more than one phone whose results differ, skipped runs left out. */
  differing: { file: string; title: string; results: Record<string, Outcome> }[];
}

/** What a test's result counts as, from the annotations browserRule() adds. */
export function outcomeOf(status: TestResult["status"], annotations: { type: string }[]): Outcome {
  if (status === "skipped") return "skipped";
  if (status !== "passed") return "failed";
  if (annotations.some((a) => a.type === "expected failure")) return "failed as expected";
  if (annotations.some((a) => a.type === "passed early")) return "passed early";
  return "passed";
}

const COLUMN: Record<Exclude<Outcome, "skipped">, keyof Counts> = {
  passed: "passed",
  "passed early": "early",
  "failed as expected": "expected",
  failed: "failed",
};

export function summarise(results: BrowserResult[]): Summary {
  const phones = new Map<string, Map<string, Counts>>();
  const byTest = new Map<string, { file: string; title: string; results: Record<string, Outcome> }>();
  for (const r of results) {
    if (r.outcome === "skipped") continue;
    const milestone = parseTaggedName(r.title)?.m ?? "untagged";
    const rows = phones.get(r.project) ?? new Map<string, Counts>();
    const row = rows.get(milestone) ?? { passed: 0, early: 0, expected: 0, failed: 0 };
    row[COLUMN[r.outcome]]++;
    rows.set(milestone, row);
    phones.set(r.project, rows);
    const key = `${r.file}\n${r.title}`;
    const entry = byTest.get(key) ?? { file: r.file, title: r.title, results: {} };
    entry.results[r.project] = r.outcome;
    byTest.set(key, entry);
  }
  const differing = [...byTest.values()]
    .filter((t) => new Set(Object.values(t.results)).size > 1)
    .sort((a, b) => a.file.localeCompare(b.file) || a.title.localeCompare(b.title));
  return { phones, differing };
}

export function formatSummary(summary: Summary): string {
  const lines: string[] = [];
  for (const [phone, rows] of summary.phones) {
    lines.push("", ` ${phone}`, " Milestone   passed   passed early   failed as expected   failed");
    for (const [milestone, row] of [...rows].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(
        ` ${milestone.padEnd(10)} ${String(row.passed).padStart(7)} ${String(row.early).padStart(14)} ${String(row.expected).padStart(20)} ${String(row.failed).padStart(8)}`,
      );
    }
  }
  lines.push("");
  if (summary.phones.size < 2) {
    lines.push(" Only one phone ran, so there's nothing to compare.");
  } else if (summary.differing.length === 0) {
    lines.push(" No results differ between the phones.");
  } else {
    lines.push(" Results that differ between the phones (TF-5):");
    for (const t of summary.differing) {
      const results = Object.entries(t.results).map(([phone, outcome]) => `${phone} ${outcome}`);
      lines.push(`   ${t.title} (${t.file}): ${results.join(", ")}`);
    }
  }
  return lines.join("\n") + "\n";
}

export default class BrowserSummary implements Reporter {
  // By test and phone, so a retried test counts its last result.
  private readonly results = new Map<string, BrowserResult>();

  onTestEnd(test: TestCase, result: TestResult): void {
    this.results.set(test.id, {
      project: test.parent.project()?.name ?? "",
      // The spec file, from its suite: every test's location is browserRule()'s own file.
      file: test.titlePath()[2] ?? "",
      title: test.title,
      outcome: outcomeOf(result.status, result.annotations),
    });
  }

  onEnd(): void {
    if (this.results.size === 0) return;
    console.log(formatSummary(summarise([...this.results.values()])));
  }
}
