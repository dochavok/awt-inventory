// A test can't change how the tests after it run (TF-7): Vitest undoes every
// spy and stubbed global after each test (vitest.config.ts). These two tests
// run in order; the second checks that the first one's fakes are gone. M1.

import { expect, vi } from "vitest";
import { rule } from "../support/rule";

const realRandom = Math.random;

rule({ req: ["TF-7"], m: "M1" }, "a test that fakes Math.random and a global leaves them faked during the test", () => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.stubGlobal("awtLeak", "left behind");
  expect(Math.random(), "Math.random inside the faking test").toBe(0.5);
  expect((globalThis as { awtLeak?: string }).awtLeak, "the stubbed global inside the faking test").toBe("left behind");
});

rule({ req: ["TF-7"], m: "M1" }, "the next test gets the real Math.random back, and no stubbed global", () => {
  expect(vi.isMockFunction(Math.random), "Math.random is still a spy").toBe(false);
  expect(Math.random, "Math.random is the real one").toBe(realRandom);
  expect("awtLeak" in globalThis, "the stubbed global is still there").toBe(false);
});
