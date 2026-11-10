// The requirement coverage table (TF-4): pure functions, used by
// scripts/coverage.ts and tested in tests/meta/coverage.test.ts.

import { milestoneNumber } from "../tests/support/milestones";
import { parseTaggedName } from "../tests/support/tags";

export type Priority = "Must" | "Should" | "Could";

export interface Requirement {
  id: string;
  priority: Priority | "removed";
  /** As written: "M2", "M2+", "later". */
  milestone: string;
  title: string;
  section: string;
}

export interface ListedTest {
  name: string;
  /** Repository-relative path. */
  file: string;
}

/** Requirements whose tests are deliberately not written yet, by section, with the reason (TF-1). */
export const DEFERRED_SECTIONS: Record<string, string> = {
  "11": "tests wait for the section 11 review (TF-1)",
};

/** Requirements about how the work is done, checked in review rather than by a test (TF-4). */
export const CHECKED_IN_REVIEW = new Set(["TF-12", "TF-14", "DOC-3"]);
const REVIEW_CELL = "checked in review (TF-4)";

/** Why a requirement needs no test yet (shown in its Tests cell), or undefined if it does. */
function exemption(requirement: Requirement): string | undefined {
  if (CHECKED_IN_REVIEW.has(requirement.id)) return REVIEW_CELL;
  return DEFERRED_SECTIONS[requirement.section];
}

const BLOCK = /^\*\*([A-Z]{2,3}-\d+[a-z]?) · (Must|Should|Could|Removed) · ([^:]+?): (.+?)\*\*/;
const SECTION = /^## (\d+)\./;

export function parseRequirements(text: string): Requirement[] {
  const found: Requirement[] = [];
  let section = "";
  for (const line of text.split(/\r?\n/)) {
    const heading = SECTION.exec(line);
    if (heading) section = heading[1]!;
    const block = BLOCK.exec(line);
    if (!block) continue;
    const [, id, priority, milestone, title] = block;
    found.push({
      id: id!,
      priority: priority === "Removed" ? "removed" : (priority as Priority),
      milestone: milestone!.trim(),
      title: title!.replace(/\.$/, ""),
      section,
    });
  }
  return found;
}

export function parseQuestions(text: string): Set<string> {
  return new Set([...text.matchAll(/^\*\*(Q\d+)\./gm)].map((m) => m[1]!));
}

/** The lowest milestone number a requirement's tests may be tagged with; null if it can't have tests yet. */
function earliestMilestone(requirement: Requirement): number | null {
  const match = /^M(\d+)\+?$/.exec(requirement.milestone);
  return match ? Number(match[1]) : null;
}

export interface Coverage {
  rows: { requirement: Requirement; tests: ListedTest[] }[];
  problems: string[];
}

export function buildCoverage(requirements: Requirement[], questions: Set<string>, tests: ListedTest[]): Coverage {
  const problems: string[] = [];
  const byId = new Map<string, Requirement>();
  for (const r of requirements) {
    if (byId.has(r.id)) problems.push(`${r.id} appears twice in the requirements (IDs are permanent and unique, TF-4)`);
    byId.set(r.id, r);
  }
  const testsOf = new Map<string, ListedTest[]>();
  for (const t of tests) {
    const tags = parseTaggedName(t.name.split(" > ").at(-1)!);
    if (!tags) {
      problems.push(`${t.file}: "${t.name}" has no requirement tags (TF-4)`);
      continue;
    }
    for (const id of tags.req) {
      const r = byId.get(id);
      if (!r) {
        problems.push(`${t.file}: "${t.name}" names ${id}, which isn't in the requirements`);
        continue;
      }
      if (r.priority === "removed") problems.push(`${t.file}: "${t.name}" names ${id}, which is removed`);
      const earliest = earliestMilestone(r);
      if (earliest === null) {
        problems.push(`${t.file}: "${t.name}" names ${id}, which isn't scheduled (${r.milestone})`);
      } else if (milestoneNumber(tags.m) < earliest) {
        problems.push(`${t.file}: "${t.name}" is tagged ${tags.m}, before ${id}'s milestone ${r.milestone}`);
      }
      testsOf.set(id, [...(testsOf.get(id) ?? []), t]);
    }
    for (const q of tags.q ?? []) {
      if (!questions.has(q)) problems.push(`${t.file}: "${t.name}" names ${q}, which isn't in dm-rule-questions.md`);
    }
  }
  const rows = requirements.map((requirement) => ({ requirement, tests: testsOf.get(requirement.id) ?? [] }));
  for (const { requirement, tests: covering } of rows) {
    if (requirement.priority === "Must" && covering.length === 0 && !exemption(requirement)) {
      problems.push(`${requirement.id} is a Must with no test (TF-4)`);
    }
    if (DEFERRED_SECTIONS[requirement.section] && covering.length > 0) {
      problems.push(`${requirement.id} has tests, but section ${requirement.section} is still deferred`);
    }
  }
  return { rows, problems };
}

function testsCell(requirement: Requirement, tests: ListedTest[]): string {
  if (tests.length === 0) {
    if (requirement.priority === "removed") return "*removed*";
    return exemption(requirement) ?? "none";
  }
  const files = new Map<string, number>();
  for (const t of tests) files.set(t.file, (files.get(t.file) ?? 0) + 1);
  return [...files]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, n]) => `${file.replace(/^tests\//, "")} (${n})`)
    .join(", ");
}

export function renderCoverage(coverage: Coverage): string {
  const lines = [
    "# Requirement coverage",
    "",
    "Generated by `npm run coverage:write` from the requirement blocks in",
    "`inventory-requirements.md` and the tags on every test (TF-4). Don't edit by",
    "hand: CI fails if this file is out of date.",
    "",
    "Tests shows each file with the number of its tests that name the requirement.",
    "",
    "| ID | Priority | Milestone | Tests |",
    "|---|---|---|---|",
  ];
  for (const { requirement, tests } of coverage.rows) {
    const priority = requirement.priority === "removed" ? "*removed*" : requirement.priority;
    lines.push(`| ${requirement.id} | ${priority} | ${requirement.milestone} | ${testsCell(requirement, tests)} |`);
  }
  const musts = coverage.rows.filter((r) => r.requirement.priority === "Must");
  const covered = musts.filter((r) => r.tests.length > 0).length;
  const exempt = musts.filter((r) => r.tests.length === 0).map((r) => exemption(r.requirement));
  const deferred = exempt.filter((e) => e !== undefined && e !== REVIEW_CELL).length;
  const reviewed = exempt.filter((e) => e === REVIEW_CELL).length;
  lines.push(
    "",
    `Musts with a test: ${covered} of ${musts.length} (${deferred} deferred by TF-1, ${reviewed} checked in review).`,
    "",
  );
  return lines.join("\n");
}
