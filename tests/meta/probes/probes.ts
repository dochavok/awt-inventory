// Probe tests for tests/meta/harness.test.ts. Not picked up by the normal run
// (the file isn't *.test.ts); the harness test runs them in a separate Vitest
// process and checks each outcome. Each probe's name says what should happen.

import { it } from "vitest"; // eslint-disable-line no-restricted-imports -- probing the untagged check
import { expect } from "vitest";
import { NotImplementedError } from "../../../src/errors";
import { rule } from "../../support/rule";

it("probe-untagged: should fail", () => {
  expect(1).toBe(1);
});

rule({ req: ["TF-5"], m: "M7" }, "probe-unfinished-stub: should pass as an expected failure", () => {
  throw new NotImplementedError("probe", "M7");
});

rule({ req: ["TF-5"], m: "M7" }, "probe-unfinished-assertion: should pass as an expected failure", () => {
  expect(2).toBe(3);
});

rule({ req: ["TF-5"], m: "M7" }, "probe-unfinished-typeerror: should fail", () => {
  const missing = undefined as unknown as { name: string };
  return missing.name;
});

rule({ req: ["TF-5"], m: "M7" }, "probe-unfinished-passes: should pass, as passed early", () => {
  expect(1).toBe(1);
});

rule({ req: ["TF-5"], m: "M1" }, "probe-finished-stub: should fail", () => {
  throw new NotImplementedError("probe", "M1");
});

rule({ req: ["TF-5"], m: "M1" }, "probe-finished-passes: should pass", () => {
  expect(1).toBe(1);
});
