// Prints the browser tests' milestone table for each phone (TF-5), after
// Playwright's own list, then the tests whose result differs between the
// phones and the tests that passed early, with their phones. Playwright
// prints a test that failed as expected as ✓, so without this a test failing
// on one phone only looks like a pass until its milestone finishes (it hid
// four WebKit failures through M3).

import type { FullConfig, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { emptyCounts, milestoneTable, type Column, type Counts } from "./milestone-table";
import { EXPECTED_FAILURE, PASSED_EARLY, parseTaggedName } from "./tags";

export type Outcome = Column | "skipped";

export interface BrowserResult {
  project: string;
  /** The spec file, relative to tests/browser/. */
  file: string;
  title: string;
  outcome: Outcome;
}

/** One test's result on each phone it ran on. */
export interface TestResults {
  file: string;
  title: string;
  results: Record<string, Outcome>;
}

export interface Summary {
  /** Each phone's counts by milestone, phones in the configured order. */
  phones: Map<string, Map<string, Counts>>;
  /** Tests run on more than one phone whose results differ, skipped runs left out. */
  differing: TestResults[];
  /** Tests that passed early on at least one phone, so a pull request can list them (TF-5). */
  passedEarly: { file: string; title: string; phones: string[] }[];
}

/** What a test's result counts as, from the annotations browserRule() adds. */
export function outcomeOf(status: TestResult["status"], annotations: { type: string }[]): Outcome {
  if (status === "skipped") return "skipped";
  if (status !== "passed") return "failed";
  if (annotations.some((a) => a.type === EXPECTED_FAILURE)) return "failed as expected";
  if (annotations.some((a) => a.type === PASSED_EARLY)) return "passed early";
  return "passed";
}

/**
 * `phoneOrder` is the configured projects' order, so the output doesn't depend
 * on which phone finished a test first; phones not in it come after, by name.
 */
export function summarise(results: BrowserResult[], phoneOrder: string[] = []): Summary {
  const rank = (phone: string) => (phoneOrder.includes(phone) ? phoneOrder.indexOf(phone) : phoneOrder.length);
  const byPhone = (a: string, b: string) => rank(a) - rank(b) || a.localeCompare(b);
  const ordered = [...results].sort((a, b) => byPhone(a.project, b.project));
  const phones = new Map<string, Map<string, Counts>>();
  const byTest = new Map<string, TestResults>();
  for (const r of ordered) {
    if (r.outcome === "skipped") continue;
    const milestone = parseTaggedName(r.title)?.m ?? "untagged";
    const rows = phones.get(r.project) ?? new Map<string, Counts>();
    const row = rows.get(milestone) ?? emptyCounts();
    row[r.outcome]++;
    rows.set(milestone, row);
    phones.set(r.project, rows);
    const key = `${r.file}\n${r.title}`;
    const entry = byTest.get(key) ?? { file: r.file, title: r.title, results: {} };
    entry.results[r.project] = r.outcome;
    byTest.set(key, entry);
  }
  const tests = [...byTest.values()].sort((a, b) => a.file.localeCompare(b.file) || a.title.localeCompare(b.title));
  const differing = tests.filter((t) => new Set(Object.values(t.results)).size > 1);
  const passedEarly = tests
    .map(({ file, title, results }) => ({
      file,
      title,
      phones: Object.keys(results).filter((phone) => results[phone] === "passed early"),
    }))
    .filter((t) => t.phones.length > 0);
  return { phones, differing, passedEarly };
}

export function formatSummary(summary: Summary): string {
  const lines: string[] = [];
  for (const [phone, rows] of summary.phones) {
    lines.push("", ` ${phone}`, ...milestoneTable(rows));
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
  if (summary.passedEarly.length > 0) {
    lines.push("", " Passed early (TF-5):");
    for (const t of summary.passedEarly) lines.push(`   ${t.title} (${t.file}): ${t.phones.join(", ")}`);
  }
  return lines.join("\n") + "\n";
}

export default class BrowserSummary implements Reporter {
  // By test and phone, so a retried test counts its last result.
  private readonly results = new Map<string, BrowserResult>();
  private phoneOrder: string[] = [];

  onBegin(config: FullConfig): void {
    this.phoneOrder = config.projects.map((p) => p.name);
  }

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
    console.log(formatSummary(summarise([...this.results.values()], this.phoneOrder)));
  }
}
