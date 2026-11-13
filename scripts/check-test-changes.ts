// The test-change check (TF-7). See scripts/test-change-lib.ts for what it refuses.
//
//   npm run check:test-changes -- --base origin/main
//
// Compares the merge base of <base> and HEAD with HEAD, in the repository it's
// run from (the current directory), so CI can run main's copy of this script
// against the pull request. On GitHub Actions it also writes a job summary.

import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * Repository paths of the files under `dir` that part 2 reads (`isAppFile`);
 * none if it doesn't exist. Folders it never reads, such as node_modules,
 * aren't walked.
 */
function appFilesUnder(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((e) => {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) return isAppFile(`${path}/`) ? appFilesUnder(path) : [];
    return e.isFile() && isAppFile(path) ? [path] : [];
  });
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
    ["src", "data", "functions"].flatMap(appFilesUnder).map((p) => [p, readFileSync(join(ROOT, p), "utf8")] as const),
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
