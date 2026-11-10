// Test tags (TF-4, TF-5), shared by the Vitest and Playwright wrappers and the
// coverage script. A test's tags are written at the front of its name, e.g.
//   [EQ-2 EQ-3 · Q2 · M4] blocks a shield in the main hand
// so test reports show them, and the coverage table is generated from the names.

import { MILESTONES, finishedMilestones, type Milestone } from "./milestones";

export interface Tags {
  /** Requirement IDs, e.g. ["EQ-2"]. At least one. */
  req: string[];
  /** DM questions the expected result depends on, e.g. ["Q2"]. */
  q?: string[];
  /** The milestone that implements what the test checks. */
  m: Milestone;
}

const REQUIREMENT_ID = /^[A-Z]{2,3}-\d+[a-z]?$/;
const QUESTION_ID = /^Q\d+$/;
const TAGGED_NAME = /^\[([A-Z]{2,3}-\d+[a-z]?(?: [A-Z]{2,3}-\d+[a-z]?)*)(?: · (Q\d+(?: Q\d+)*))? · (M\d)\] (.+)$/s;

export function checkTags(tags: Tags, name: string): void {
  const where = `test "${name}"`;
  if (!Array.isArray(tags.req) || tags.req.length === 0) throw new Error(`${where}: names no requirement (TF-4)`);
  for (const id of tags.req) {
    if (!REQUIREMENT_ID.test(id)) throw new Error(`${where}: "${id}" isn't a requirement ID (TF-4)`);
  }
  for (const id of tags.q ?? []) {
    if (!QUESTION_ID.test(id)) throw new Error(`${where}: "${id}" isn't a DM question ID (TF-4)`);
  }
  if (!(MILESTONES as readonly string[]).includes(tags.m))
    throw new Error(`${where}: "${tags.m}" isn't a milestone (TF-5)`);
  if (name.trim() === "") throw new Error("A test needs a name");
}

export function taggedName(tags: Tags, name: string): string {
  checkTags(tags, name);
  const parts = [tags.req.join(" ")];
  if (tags.q?.length) parts.push(tags.q.join(" "));
  parts.push(tags.m);
  return `[${parts.join(" · ")}] ${name}`;
}

/** Reads the tags back from a test's name; null if it has none. */
export function parseTaggedName(fullName: string): (Tags & { name: string }) | null {
  const match = TAGGED_NAME.exec(fullName);
  if (!match) return null;
  return {
    req: match[1]!.split(" "),
    ...(match[2] ? { q: match[2].split(" ") } : {}),
    m: match[3] as Milestone,
    name: match[4]!,
  };
}

/**
 * Errors that count as the expected failure of a test for an unfinished milestone:
 * a stub that isn't implemented yet, or an assertion that doesn't hold (Vitest's
 * or Playwright's). Anything
 * else (a TypeError, a missing fixture) is a broken test and fails for real.
 */
export function isExpectedFailure(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (current.name === "NotImplementedError" || current.name === "AssertionError") return true;
    // Playwright's expect() throws a plain Error carrying its matcher result.
    if (typeof (current as { matcherResult?: unknown }).matcherResult === "object") return true;
    current = current.cause;
  }
  return false;
}

export function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message.split("\n")[0]}` : String(error);
}

/**
 * Runs a test body under its milestone's rule (TF-5). Finished: it must pass.
 * Unfinished: it must fail with an expected failure; passing is an error, so
 * a test that can't fail is caught (TF-8). Returns the expected failure, if any.
 */
export async function runForMilestone(tags: Tags, body: () => unknown): Promise<string | undefined> {
  if (finishedMilestones().has(tags.m)) {
    await body();
    return undefined;
  }
  try {
    await body();
  } catch (error) {
    if (isExpectedFailure(error)) return describeError(error);
    throw error;
  }
  throw new Error(
    `This test passed, but ${tags.m} isn't finished. A test for an unfinished milestone must fail ` +
      `until its code exists (TF-5); if the code is done, add ${tags.m} to awt.finishedMilestones.`,
  );
}
