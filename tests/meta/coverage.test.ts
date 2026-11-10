// The coverage table's logic (TF-4): reading requirement blocks and questions,
// and refusing an uncovered Must, an unknown or removed ID, a wrong milestone
// and an untagged test. M1, so these must pass. CI's coverage job runs the
// whole check (npm run coverage:check) against the real tests.

import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { buildCoverage, parseQuestions, parseRequirements, renderCoverage } from "../../scripts/coverage-lib";
import { rule } from "../support/rule";

const SAMPLE = `
## 8. Grants and Totals

**GR-8 · Must · M4: CM.** Total CM is ...
**GR-10 · Should · M4: Hearts.** Max hearts ...
**NF-1 · Must · M2+: Phone first.** Every screen ...
**XX-3 · Removed · M2: Old idea.**

## 11. Faire-Day To-Do List

**TD-1 · Must · M7: One list per user.** The to-do list ...

## 18. Later

**TR-1 · Could · later: Listing for trade.** A user ...
`;

const questions = new Set(["Q1", "Q2"]);
const test = (name: string, file = "tests/rules/x.test.ts") => ({ name, file });
const problemsFor = (...names: string[]) =>
  buildCoverage(
    parseRequirements(SAMPLE),
    questions,
    names.map((n) => test(n)),
  ).problems;

rule(
  { req: ["TF-4"], m: "M1" },
  "requirement blocks are read with their priority, milestone, title and section",
  () => {
    expect(parseRequirements(SAMPLE)).toEqual([
      { id: "GR-8", priority: "Must", milestone: "M4", title: "CM", section: "8" },
      { id: "GR-10", priority: "Should", milestone: "M4", title: "Hearts", section: "8" },
      { id: "NF-1", priority: "Must", milestone: "M2+", title: "Phone first", section: "8" },
      { id: "XX-3", priority: "removed", milestone: "M2", title: "Old idea", section: "8" },
      { id: "TD-1", priority: "Must", milestone: "M7", title: "One list per user", section: "11" },
      { id: "TR-1", priority: "Could", milestone: "later", title: "Listing for trade", section: "18" },
    ]);
  },
);

rule({ req: ["TF-4"], m: "M1" }, "every requirement block in the real requirements document is read", () => {
  const text = readFileSync(new URL("../../inventory-requirements.md", import.meta.url), "utf8");
  const blockLines = text.split(/\r?\n/).filter((l) => /^\*\*[A-Z]{2,3}-\d+[a-z]? ·/.test(l));
  const parsed = parseRequirements(text);
  expect(
    parsed.map((r) => r.id),
    "IDs read, in order",
  ).toEqual(blockLines.map((l) => /^\*\*(\S+)/.exec(l)![1]));
  expect(
    parsed.find((r) => r.id === "GR-8"),
    "GR-8",
  ).toMatchObject({ priority: "Must", milestone: "M4" });
  expect(
    parsed.find((r) => r.id === "SK-1a"),
    "SK-1a",
  ).toMatchObject({ priority: "Must", milestone: "M2" });
  expect(
    parsed.find((r) => r.id === "TD-1"),
    "TD-1",
  ).toMatchObject({ section: "11" });
});

rule({ req: ["TF-4"], m: "M1" }, "DM questions are read from their bold numbers", () => {
  expect([...parseQuestions("**Q1. Does it?**\ntext\n**Q11. What?**\nQ3 in passing")]).toEqual(["Q1", "Q11"]);
});

rule(
  { req: ["TF-4"], m: "M1" },
  "a Must with no test is a problem, a Should or Could isn't, and section 11 is deferred",
  () => {
    expect(problemsFor("[GR-8 · M4] a")).toEqual(["NF-1 is a Must with no test (TF-4)"]);
  },
);

rule({ req: ["TF-4"], m: "M1" }, "a test naming an unknown, removed or unscheduled requirement is a problem", () => {
  const ok = ["[GR-8 · M4] a", "[NF-1 · M2] b"];
  expect(problemsFor(...ok, "[GR-99 · M4] c")).toEqual([
    'tests/rules/x.test.ts: "[GR-99 · M4] c" names GR-99, which isn\'t in the requirements',
  ]);
  expect(problemsFor(...ok, "[XX-3 · M2] c")).toEqual([
    'tests/rules/x.test.ts: "[XX-3 · M2] c" names XX-3, which is removed',
  ]);
  expect(problemsFor(...ok, "[TR-1 · M7] c")).toEqual([
    'tests/rules/x.test.ts: "[TR-1 · M7] c" names TR-1, which isn\'t scheduled (later)',
  ]);
});

rule(
  { req: ["TF-4"], m: "M1" },
  "an untagged test, an unknown question or a deferred section's test is a problem",
  () => {
    const ok = ["[GR-8 · M4] a", "[NF-1 · M2] b"];
    expect(problemsFor(...ok, "plain name")).toEqual([
      'tests/rules/x.test.ts: "plain name" has no requirement tags (TF-4)',
    ]);
    expect(problemsFor(...ok, "[GR-8 · Q7 · M4] c")).toEqual([
      'tests/rules/x.test.ts: "[GR-8 · Q7 · M4] c" names Q7, which isn\'t in dm-rule-questions.md',
    ]);
    expect(problemsFor(...ok, "[TD-1 · M7] c")).toEqual(["TD-1 has tests, but section 11 is still deferred"]);
  },
);

rule({ req: ["TF-4", "TF-5"], m: "M1" }, "a test tagged with a milestone before its requirement's is a problem", () => {
  expect(problemsFor("[GR-8 · M2] a", "[NF-1 · M3] b")).toEqual([
    'tests/rules/x.test.ts: "[GR-8 · M2] a" is tagged M2, before GR-8\'s milestone M4',
  ]);
});

rule(
  { req: ["TF-4"], m: "M1" },
  "the table lists every requirement with its tests by file, and counts the Musts",
  () => {
    const coverage = buildCoverage(parseRequirements(SAMPLE), questions, [
      test("[GR-8 · M4] a", "tests/rules/totals.test.ts"),
      test("[GR-8 GR-10 · M4] b", "tests/rules/totals.test.ts"),
      test("[GR-8 · M4] c", "tests/properties/totals.test.ts"),
    ]);
    const text = renderCoverage(coverage);
    expect(text).toContain("| GR-8 | Must | M4 | rules/totals.test.ts (2), properties/totals.test.ts (1) |");
    expect(text).toContain("| GR-10 | Should | M4 | rules/totals.test.ts (1) |");
    expect(text).toContain("| NF-1 | Must | M2+ | none |");
    expect(text).toContain("| XX-3 | *removed* | M2 | *removed* |");
    expect(text).toContain("| TD-1 | Must | M7 | tests wait for the section 11 review (TF-1) |");
    expect(text).toContain("Musts with a test: 1 of 3 (1 deferred by TF-1).");
  },
);
