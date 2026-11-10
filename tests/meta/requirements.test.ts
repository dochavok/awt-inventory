// The M1 harness against the real repository (TF-1, TF-2, TF-4): every Must
// has a test and the coverage table is current, and the rules core is pure.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { rule } from "../support/rule";
import { runScript } from "../support/run-script";

const ROOT = new URL("../../", import.meta.url);

rule(
  { req: ["TF-1", "TF-4"], m: "M1" },
  "every Must has a test, every tag is valid, and tests/COVERAGE.md is up to date",
  () => {
    const { exitCode, output } = runScript("scripts/coverage.ts", "--check");
    expect(exitCode, `npm run coverage:check said:\n${output}`).toBe(0);
  },
  { timeout: 180_000 },
);

rule({ req: ["TF-2"], m: "M1" }, "the rules core imports nothing but itself and the shared errors", () => {
  const dir = new URL("src/rules/", ROOT);
  for (const file of readdirSync(fileURLToPath(dir)).filter((f) => f.endsWith(".ts"))) {
    const source = readFileSync(new URL(file, dir), "utf8");
    const imports = [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);
    const outside = imports.filter((i) => !i.startsWith("./") && i !== "../errors");
    expect(outside, `src/rules/${file}'s imports from outside the rules core`).toEqual([]);
  }
});
