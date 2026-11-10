// Generates and checks tests/COVERAGE.md (TF-4).
//
//   npm run coverage:write   regenerate the table
//   npm run coverage:check   fail if a Must has no test, a tag is wrong or
//                            unknown, a test is untagged, or the table is stale
//
// Requirement blocks are read from inventory-requirements.md in the form
//   **ID · Must|Should|Could · Milestone: Title.**
// A removed requirement keeps its block, written **ID · Removed · Milestone: Title.**
// Tests are listed from Vitest (every project) and Playwright, without running them.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCoverage, parseQuestions, parseRequirements, renderCoverage, type ListedTest } from "./coverage-lib";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const COVERAGE = join(ROOT, "tests", "COVERAGE.md");

function repoPath(file: string): string {
  return relative(ROOT, file).replaceAll("\\", "/");
}

function vitestTests(): ListedTest[] {
  const dir = mkdtempSync(join(tmpdir(), "awt-coverage-"));
  const out = join(dir, "list.json");
  try {
    execFileSync(
      process.execPath,
      [join(ROOT, "node_modules", "vitest", "vitest.mjs"), "list", "--staticParse=false", `--json=${out}`],
      { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] },
    );
    const listed = JSON.parse(readFileSync(out, "utf8")) as { name: string; file: string }[];
    return listed.map((t) => ({ name: t.name, file: repoPath(t.file) }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

interface PlaywrightSuite {
  /** For a top-level suite, the spec file. (A spec's own `file` is where browserRule() called test().) */
  file: string;
  specs?: { title: string }[];
  suites?: PlaywrightSuite[];
}

function playwrightTests(): ListedTest[] {
  const json = execFileSync(
    process.execPath,
    [join(ROOT, "node_modules", "@playwright", "test", "cli.js"), "test", "--list", "--reporter=json"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 * 1024 * 1024 },
  );
  const report = JSON.parse(json) as { config: { rootDir: string }; suites?: PlaywrightSuite[] };
  const found = new Map<string, ListedTest>();
  const walk = (suite: PlaywrightSuite, file: string) => {
    for (const spec of suite.specs ?? []) found.set(`${file}\n${spec.title}`, { name: spec.title, file });
    suite.suites?.forEach((child) => walk(child, file));
  };
  for (const top of report.suites ?? []) walk(top, repoPath(join(report.config.rootDir, top.file)));
  return [...found.values()];
}

function main(argv: string[]): number {
  const mode = argv.includes("--write") ? "write" : argv.includes("--check") ? "check" : undefined;
  if (!mode) {
    console.error("Usage: tsx scripts/coverage.ts --write | --check");
    return 2;
  }
  const requirements = parseRequirements(readFileSync(join(ROOT, "inventory-requirements.md"), "utf8"));
  const questions = parseQuestions(readFileSync(join(ROOT, "dm-rule-questions.md"), "utf8"));
  const coverage = buildCoverage(requirements, questions, [...vitestTests(), ...playwrightTests()]);
  const text = renderCoverage(coverage);

  if (mode === "write") writeFileSync(COVERAGE, text);
  let failed = false;
  if (coverage.problems.length) {
    console.error(`Coverage problems (TF-4):\n${coverage.problems.map((p) => `  - ${p}`).join("\n")}`);
    failed = true;
  }
  if (mode === "check") {
    let committed = "";
    try {
      committed = readFileSync(COVERAGE, "utf8");
    } catch {
      // A missing table counts as out of date.
    }
    if (committed.replaceAll("\r\n", "\n") !== text) {
      console.error("tests/COVERAGE.md is out of date: run npm run coverage:write and commit it.");
      failed = true;
    }
  }
  if (!failed) console.log(`Coverage OK: ${requirements.length} requirements.`);
  return failed ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
