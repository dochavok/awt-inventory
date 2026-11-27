// The test-change check (TF-7). See scripts/test-change-lib.ts for what it refuses.
//
//   npm run check:test-changes -- --base origin/main [--repo <folder>]
//
// Compares the merge base of <base> and HEAD with HEAD, in the repository in
// <folder> (by default the current directory). CI runs main's copy of this
// script from main's checkout, with --repo naming the pull request's, so
// nothing in the pull request is loaded or run: its files are only read (TF-7).
// On GitHub Actions it also writes a job summary.

import { execFileSync } from "node:child_process";
import { appendFileSync, lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "yaml";
import {
  RULE,
  appCodeProblems,
  isAppFile,
  requirementsChanged,
  testChangeProblems,
  type Change,
  type Reader,
} from "./test-change-lib";

const ARGS = parseArgs({
  args: process.argv.slice(2),
  options: { base: { type: "string" }, repo: { type: "string" } },
}).values;
const ROOT = resolve(ARGS.repo ?? ".");

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

/**
 * Repository paths of the files part 2 reads (`isAppFile`), from the files git
 * tracks (TF-7), so what git ignores, such as packages and build output, never
 * counts. Only regular files are read: a tracked file deleted but not yet
 * committed is skipped, and so is a link (`linkProblems` names those).
 */
function appFiles(tracked: TrackedPath[]): string[] {
  return tracked
    .filter(({ path, link }) => !link && isAppFile(path) && isRegularFile(join(ROOT, path)))
    .map(({ path }) => path);
}

interface TrackedPath {
  path: string;
  /** Whether git stores it as a link (mode 120000), whatever the disk holds. */
  link: boolean;
}

/** What git tracks under src/, data/ and functions/. */
function trackedAppPaths(): TrackedPath[] {
  // Each entry of `git ls-files -s` is "<mode> <object> <stage>\t<path>".
  return git("ls-files", "-s", "-z", "--", "src", "data", "functions")
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({ path: entry.slice(entry.indexOf("\t") + 1), link: entry.startsWith("120000 ") }));
}

/** Part 2 doesn't follow links, so a link git tracks in the app fails the check (TF-7). */
function linkProblems(tracked: TrackedPath[]): string[] {
  return tracked.filter(({ link }) => link).map(({ path }) => `${path}: a link, which the check doesn't follow`);
}

function isRegularFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function fixtureNames(): string[] {
  type Fixture = { character?: { name?: unknown }; displayName?: unknown; email?: unknown } | null;
  const read = (file: string) =>
    Object.values(
      (parse(readFileSync(join(ROOT, "tests", "fixtures", file), "utf8")) ?? {}) as Record<string, Fixture>,
    );
  const characters = read("characters.yaml").map((c) => c?.character?.name);
  const users = read("users.yaml").flatMap((u) => [u?.displayName, u?.email]);
  return [...new Set([...characters, ...users])].filter((n): n is string => typeof n === "string" && n !== "");
}

function main(): number {
  const baseRef = ARGS.base;
  if (!baseRef) {
    console.error("Usage: tsx scripts/check-test-changes.ts --base <git ref> [--repo <folder>]");
    return 2;
  }
  const base = git("merge-base", baseRef, "HEAD").trim();
  const changes = changedFiles(base);
  const part1 = testChangeProblems(changes, readerAt(base), readerAt("HEAD"));
  const tracked = trackedAppPaths();
  const files = new Map(appFiles(tracked).map((p) => [p, readFileSync(join(ROOT, p), "utf8")] as const));
  const part2 = [...linkProblems(tracked), ...appCodeProblems(files, fixtureNames())];
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

process.exitCode = main();
