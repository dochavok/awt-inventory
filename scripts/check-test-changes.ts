// The test-change check (TF-7). See scripts/test-change-lib.ts for what it refuses.
//
//   npm run check:test-changes -- --base origin/main
//
// Compares the merge base of <base> and HEAD with HEAD, in the repository it's
// run from (the current directory), so CI can run main's copy of this script
// against the pull request. On GitHub Actions it also writes a job summary.

import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "yaml";
import {
  RULE,
  appCodeProblems,
  requirementsChanged,
  testChangeProblems,
  type Change,
  type Reader,
} from "./test-change-lib";

const ROOT = process.cwd();

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function changedFiles(base: string): Change[] {
  return git("diff", "--name-status", "--no-renames", base, "HEAD")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split("\t");
      return { status: (status === "A" || status === "D" ? status : "M") as Change["status"], path: path! };
    });
}

function readerAt(ref: string): Reader {
  return (path) => {
    try {
      return git("show", `${ref}:${path}`);
    } catch {
      return undefined;
    }
  };
}

/** Repository paths of the files under `dir`; none if it doesn't exist. */
function filesUnder(dir: string): string[] {
  try {
    return readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => relative(ROOT, join(e.parentPath, e.name)).replaceAll("\\", "/"));
  } catch {
    return [];
  }
}

function fixtureNames(): string[] {
  const read = (file: string) =>
    parse(readFileSync(join(ROOT, "tests", "fixtures", file), "utf8")) as Record<string, Record<string, unknown>>;
  const characters = Object.values(read("characters.yaml")).map((c) => (c.character as { name: string }).name);
  const users = Object.values(read("users.yaml")).flatMap((u) => [u.displayName as string, u.email as string]);
  return [...new Set([...characters, ...users])];
}

function main(argv: string[]): number {
  const baseRef = parseArgs({ args: argv, options: { base: { type: "string" } } }).values.base;
  if (!baseRef) {
    console.error("Usage: tsx scripts/check-test-changes.ts --base <git ref>");
    return 2;
  }
  const base = git("merge-base", baseRef, "HEAD").trim();
  const changes = changedFiles(base);
  const part1 = testChangeProblems(changes, readerAt(base), readerAt("HEAD"));
  const appFiles = new Map(
    [...filesUnder("src"), ...filesUnder("data")].map((p) => [p, readFileSync(join(ROOT, p), "utf8")] as const),
  );
  const part2 = appCodeProblems(appFiles, fixtureNames());
  const problems = [...part1, ...part2];

  const lines = [`Compared ${baseRef} (${base.slice(0, 7)}) with HEAD: ${changes.length} files changed.`];
  if (requirementsChanged(changes)) {
    lines.push("The requirements document changed, so changes to existing tests are allowed (TF-6 steps 2 and 3).");
  }
  if (problems.length) {
    lines.push("", "The test-change check failed:", ...problems.map((p) => `  - ${p}`), "", RULE);
  } else {
    lines.push("The test-change check passed.");
  }
  const report = lines.join("\n");
  (problems.length ? console.error : console.log)(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Test-change check\n\n\`\`\`\n${report}\n\`\`\`\n`);
  }
  return problems.length ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
