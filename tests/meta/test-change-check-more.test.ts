// More of the test-change check (TF-7): scripts npm runs by itself, and new
// code in a test file that runs at load time. M1, so these must pass.

import { expect } from "vitest";
import { packageProblems, testFileProblems } from "../../scripts/test-change-lib";
import { rule } from "../support/rule";

const TEST_FILE = `import { expect } from "vitest";
import { rule } from "../support/rule";

rule({ req: ["GR-8"], m: "M4" }, "Aldric's CM is 170", () => {
  expect(170).toBe(170);
});
`;

rule({ req: ["TF-7"], m: "M1" }, "adding or changing a script npm runs by itself is refused", () => {
  const before = JSON.stringify({ scripts: { test: "vitest run" } });
  for (const name of ["pretest", "posttest", "postinstall", "prepare", "install", "prelint"]) {
    const after = JSON.stringify({ scripts: { test: "vitest run", [name]: "node something.js" } });
    expect(packageProblems(before, after), `adding "${name}"`).toEqual([
      `package.json: the "${name}" script was changed`,
    ]);
  }
  const other = JSON.stringify({ scripts: { test: "vitest run", build: "vite build" } });
  expect(packageProblems(before, other), "adding an ordinary script").toEqual([]);
});

rule(
  { req: ["TF-7"], m: "M1" },
  "a new import run only for its effects is refused; an ordinary new import isn't",
  () => {
    const effects = TEST_FILE.replace(`import { rule }`, `import "../support/patch";\nimport { rule }`);
    expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, effects)).toEqual([
      'tests/rules/x.test.ts: new import run for its effects (import "../support/patch";) could affect existing tests',
    ]);
    const ordinary = TEST_FILE.replace(
      `import { rule }`,
      `import { fixtureSheet } from "../support/fixtures";\nimport { rule }`,
    );
    expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, ordinary)).toEqual([]);
  },
);

rule(
  { req: ["TF-7"], m: "M1" },
  "a new declaration that calls a hook at load time is refused; one that only defines a function isn't",
  () => {
    const hooked = `${TEST_FILE}\nconst _setup = beforeEach(() => undefined);\n`;
    expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, hooked)).toEqual([
      "tests/rules/x.test.ts: new code calls beforeEach(), which could affect existing tests",
    ]);
    const mocked = `${TEST_FILE}\nconst spy = vi.spyOn(Math, "random");\n`;
    expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, mocked)).toEqual([
      "tests/rules/x.test.ts: new code calls vi.spyOn(), which could affect existing tests",
    ]);
    const helper = `${TEST_FILE}\nconst setUp = () => { beforeEach(() => undefined); };\n`;
    expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, helper)).toEqual([]);
  },
);
