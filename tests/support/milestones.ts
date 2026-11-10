// Milestones (requirements section 16) and which are finished (TF-5).
// The finished list lives in package.json, `awt.finishedMilestones`. Finishing a
// milestone adds it there; removing one fails the test-change check (TF-7).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const MILESTONES = ["M1", "M2", "M3", "M4", "M5", "M6", "M7"] as const;
export type Milestone = (typeof MILESTONES)[number];

const packageJson = fileURLToPath(new URL("../../package.json", import.meta.url));
let finished: readonly string[] | undefined;

/** Read once per test process. */
export function finishedMilestones(): Set<string> {
  if (finished) return new Set(finished);
  const pkg = JSON.parse(readFileSync(packageJson, "utf8")) as { awt?: { finishedMilestones?: unknown } };
  const list = pkg.awt?.finishedMilestones;
  if (
    !Array.isArray(list) ||
    !list.every((m) => typeof m === "string" && (MILESTONES as readonly string[]).includes(m))
  ) {
    throw new Error("package.json awt.finishedMilestones must be a list of milestone IDs (M1 to M7)");
  }
  finished = list as string[];
  return new Set(finished);
}

export function milestoneNumber(m: string): number {
  const match = /^M(\d+)$/.exec(m);
  if (!match) throw new Error(`Not a milestone: ${m}`);
  return Number(match[1]);
}
