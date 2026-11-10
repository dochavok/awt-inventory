// The test-change check (TF-7). See scripts/test-change-lib.ts for what it refuses.
//
//   npm run check:test-changes -- --base origin/main [--repo <path>]
//
// Compares the merge base of <base> and HEAD with HEAD, in the repository at
// <path> (default: the one this script is in). CI runs main's copy of this
// script against the pull request with --repo. On GitHub Actions it also
// writes a job summary.

import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  RULE,
  appCodeProblems,
  requirementsChanged,
  testChangeProblems,
  type Change,
  type Reader,
} from "./test-change-lib";

const repoFlag = process.argv.indexOf("--repo");
const ROOT = repoFlag >= 0 ? process.argv[repoFlag + 1]! : fileURLToPath(new URL("..", import.meta.url));

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

function filesUnder(dir: string): string[] {
  const full = join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(full);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(join(ROOT, path)).isDirectory() ? filesUnder(path) : [path];
  });
}

function fixtureNames(): string[] {
  const read = (file: string) =>
    parse(readFileSync(join(ROOT, "tests", "fixtures", file), "utf8")) as Record<string, Record<string, unknown>>;
  const characters = Object.values(read("characters.yaml")).map((c) => (c.character as { name: string }).name);
  const users = Object.values(read("users.yaml")).flatMap((u) => [u.displayName as string, u.email as string]);
  return [...new Set([...characters, ...users])];
}

function main(argv: string[]): number {
  const at = argv.indexOf("--base");
  const baseRef = at >= 0 ? argv[at + 1] : undefined;
  if (!baseRef) {
    console.error("Usage: tsx scripts/check-test-changes.ts --base <git ref> [--repo <path>]");
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
