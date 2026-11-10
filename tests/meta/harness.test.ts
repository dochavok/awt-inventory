// The test harness itself (TF-4, TF-5): tags, untagged tests, and expected
// failures for unfinished milestones. M1, so these must pass.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { NotImplementedError } from "../../src/errors";
import { rule } from "../support/rule";
import { isExpectedFailure, parseTaggedName, runForMilestone, taggedName } from "../support/tags";

const ROOT = new URL("../..", import.meta.url);

rule({ req: ["TF-4"], m: "M1" }, "a tagged name puts requirements, questions and milestone in front", () => {
  expect(taggedName({ req: ["EQ-2", "EQ-3"], q: ["Q2"], m: "M4" }, "blocks a second shield")).toBe(
    "[EQ-2 EQ-3 · Q2 · M4] blocks a second shield",
  );
  expect(taggedName({ req: ["GR-8"], m: "M4" }, "Aldric's CM")).toBe("[GR-8 · M4] Aldric's CM");
});

rule({ req: ["TF-4"], m: "M1" }, "tags read back from a name are the ones written", () => {
  expect(parseTaggedName("[EQ-2 EQ-3 · Q2 · M4] blocks a second shield")).toEqual({
    req: ["EQ-2", "EQ-3"],
    q: ["Q2"],
    m: "M4",
    name: "blocks a second shield",
  });
  expect(parseTaggedName("[SK-1a · M2] picker")).toEqual({ req: ["SK-1a"], m: "M2", name: "picker" });
  expect(parseTaggedName("blocks a second shield")).toBeNull();
});

rule({ req: ["TF-4"], m: "M1" }, "a test without a requirement, or with a malformed tag, is refused", () => {
  expect(() => taggedName({ req: [], m: "M4" }, "x")).toThrow(/names no requirement/);
  expect(() => taggedName({ req: ["eq-2"], m: "M4" }, "x")).toThrow(/"eq-2" isn't a requirement ID/);
  expect(() => taggedName({ req: ["EQ-2"], q: ["2"], m: "M4" }, "x")).toThrow(/"2" isn't a DM question/);
  expect(() => taggedName({ req: ["EQ-2"], m: "M9" as "M4" }, "x")).toThrow(/"M9" isn't a milestone/);
});

rule({ req: ["TF-5"], m: "M1" }, "only a stub or a failed assertion counts as an expected failure", () => {
  expect(isExpectedFailure(new NotImplementedError("x", "M4"))).toBe(true);
  const assertion = (() => {
    try {
      expect(1).toBe(2);
    } catch (error) {
      return error;
    }
  })();
  expect(isExpectedFailure(assertion)).toBe(true);
  expect(isExpectedFailure(new Error("wrapped", { cause: new NotImplementedError("x", "M4") }))).toBe(true);
  expect(isExpectedFailure(new TypeError("x is undefined"))).toBe(false);
  expect(isExpectedFailure(new Error("ENOENT: no such fixture"))).toBe(false);
  expect(isExpectedFailure("a string")).toBe(false);
});

rule(
  { req: ["TF-5"], m: "M1" },
  "an unfinished milestone's test fails as expected or passes early; any other error fails",
  async () => {
    await expect(
      runForMilestone({ req: ["TF-5"], m: "M7" }, () => undefined),
      "a test that passes early",
    ).resolves.toBeUndefined();
    await expect(
      runForMilestone({ req: ["TF-5"], m: "M7" }, () => {
        throw new NotImplementedError("computeTotals", "M4");
      }),
    ).resolves.toBe("NotImplementedError: computeTotals is not implemented yet (M4)");
    await expect(
      runForMilestone({ req: ["TF-5"], m: "M7" }, () => {
        throw new TypeError("boom");
      }),
    ).rejects.toThrow(TypeError);
  },
);

rule({ req: ["TF-5"], m: "M1" }, "a finished milestone's test must pass", async () => {
  await expect(runForMilestone({ req: ["TF-5"], m: "M1" }, () => undefined)).resolves.toBeUndefined();
  await expect(
    runForMilestone({ req: ["TF-5"], m: "M1" }, () => {
      throw new NotImplementedError("x", "M1");
    }),
  ).rejects.toThrow(NotImplementedError);
});

rule(
  { req: ["TF-4", "TF-5", "TF-8"], m: "M1" },
  "in a real Vitest run, untagged and broken tests fail, and stubs fail as expected",
  () => {
    const out = join(mkdtempSync(join(tmpdir(), "awt-probes-")), "result.json");
    try {
      execFileSync(
        process.execPath,
        [
          "node_modules/vitest/vitest.mjs",
          "run",
          "--config",
          "tests/meta/probes/vitest.probes.config.ts",
          "--reporter=json",
          `--outputFile=${out}`,
        ],
        { cwd: ROOT, stdio: "pipe" },
      );
    } catch {
      // Some probes are meant to fail, so the run exits non-zero.
    }
    const report = JSON.parse(readFileSync(out, "utf8")) as {
      testResults: { assertionResults: { title: string; status: string }[] }[];
    };
    const outcome = Object.fromEntries(
      report.testResults.flatMap((file) =>
        file.assertionResults.map((t) => [/probe-[a-z-]+/.exec(t.title)?.[0] ?? t.title, t.status]),
      ),
    );
    expect(outcome).toEqual({
      "probe-untagged": "failed",
      "probe-unfinished-stub": "passed",
      "probe-unfinished-assertion": "passed",
      "probe-unfinished-typeerror": "failed",
      "probe-unfinished-passes": "passed",
      "probe-finished-stub": "failed",
      "probe-finished-passes": "passed",
    });
  },
  { timeout: 60_000 },
);
