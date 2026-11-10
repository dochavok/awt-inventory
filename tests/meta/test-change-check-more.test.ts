// More of the test-change check (TF-7): scripts npm runs by itself, and new
// code in an existing test file that could change how its tests run. M1, so
// these must pass.

import { expect } from "vitest";
import { packageProblems, testChangeProblems, testFileProblems } from "../../scripts/test-change-lib";
import { rule } from "../support/rule";

const TEST_FILE = `import { expect } from "vitest";
import { rule } from "../support/rule";

rule({ req: ["GR-8"], m: "M4" }, "Aldric's CM is 170", () => {
  expect(170).toBe(170);
});
`;

const PATH = "tests/rules/x.test.ts";
const problems = (after: string) => testFileProblems(PATH, TEST_FILE, after);

rule({ req: ["TF-7"], m: "M1" }, "adding or changing a script npm runs by itself is refused", () => {
  const before = JSON.stringify({ scripts: { test: "vitest run" } });
  for (const name of ["pretest", "posttest", "postinstall", "prepare", "install", "prepublishOnly"]) {
    const after = JSON.stringify({ scripts: { test: "vitest run", [name]: "node something.js" } });
    expect(packageProblems(before, after), `adding "${name}"`).toEqual([
      `package.json: the "${name}" script was changed`,
    ]);
  }
});

rule({ req: ["TF-7"], m: "M1" }, "ordinary scripts whose names start with pre or post can change", () => {
  const before = JSON.stringify({ scripts: { test: "vitest run", preview: "vite preview --port 4173" } });
  const after = JSON.stringify({
    scripts: {
      test: "vitest run",
      preview: "vite preview --port 5000",
      "postcss:check": "postcss --check",
      build: "vite build",
    },
  });
  expect(packageProblems(before, after), "changing preview, adding postcss:check and build").toEqual([]);
});

rule(
  { req: ["TF-7"], m: "M1" },
  "a new import run only for its effects is refused; an ordinary new import isn't",
  () => {
    const effects = TEST_FILE.replace(`import { rule }`, `import "../support/patch";\nimport { rule }`);
    expect(problems(effects)).toEqual([
      'tests/rules/x.test.ts: new import run for its effects (import "../support/patch";) could affect existing tests',
    ]);
    const ordinary = TEST_FILE.replace(
      `import { rule }`,
      `import { fixtureSheet } from "../support/fixtures";\nimport { rule }`,
    );
    expect(problems(ordinary)).toEqual([]);
  },
);

rule(
  { req: ["TF-7"], m: "M1" },
  "importing a helper added in the same change into an existing test file is refused",
  () => {
    const after = TEST_FILE.replace(
      `import { rule }`,
      `import { helper } from "../support/new-helper";\nimport { rule }`,
    );
    const changes = [
      { status: "M" as const, path: PATH },
      { status: "A" as const, path: "tests/support/new-helper.ts" },
    ];
    expect(
      testChangeProblems(
        changes,
        () => TEST_FILE,
        (p) => (p === PATH ? after : ""),
      ),
    ).toEqual([
      "tests/rules/x.test.ts: imports tests/support/new-helper.ts, added in this change, which could affect existing tests",
    ]);
  },
);

rule(
  { req: ["TF-7"], m: "M1" },
  "a new declaration that runs code when the file loads is refused, whatever it calls",
  () => {
    for (const [code, runs] of [
      [`const _setup = beforeEach(() => undefined);`, "beforeEach(() => undefined)"],
      [`const spy = vitest.spyOn(Math, "random");`, 'vitest.spyOn(Math, "random")'],
      [`const _x = (() => { beforeEach(() => undefined); })();`, "(() => { beforeEach(() => undefined); })()"],
      [`const again = useEmulator();`, "useEmulator()"],
      [`const t = (Date.now = () => 0);`, "Date.now = () => 0"],
    ] as const) {
      expect(problems(`${TEST_FILE}\n${code}\n`), code).toEqual([
        `tests/rules/x.test.ts: new code runs when the file loads (${runs}), which could affect existing tests`,
      ]);
    }
  },
);

rule({ req: ["TF-7"], m: "M1" }, "a new declaration that only defines things is allowed", () => {
  for (const code of [
    `const setUp = () => { beforeEach(() => undefined); };`,
    `function helper() { return 1; }`,
    `const NAMES = ["Aldric", "Isolde"] as const;`,
    `const LIMITS = { cm: 170, nested: { hearts: -3 } };`,
    `class Helper { static label = "made up"; run() { return 1; } }`,
  ]) {
    expect(problems(`${TEST_FILE}\n${code}\n`), code).toEqual([]);
  }
});

rule({ req: ["TF-7"], m: "M1" }, "computed names, decorators and vi.spyOn in new declarations are refused too", () => {
  for (const [code, runs] of [
    [`const spy = vi.spyOn(Math, "random");`, 'vi.spyOn(Math, "random")'],
    [`const o = { [setUp()]() {} };`, "[setUp()]"],
    [`class H { [setUp()]() {} }`, "[setUp()]"],
    [`@setUp class H {}`, "@setUp"],
  ] as const) {
    expect(problems(`${TEST_FILE}\n${code}\n`), code).toEqual([
      `tests/rules/x.test.ts: new code runs when the file loads (${runs}), which could affect existing tests`,
    ]);
  }
});

rule(
  { req: ["TF-7"], m: "M1" },
  "importing a just-added helper is refused whichever extension the import names",
  () => {
    for (const specifier of ["../support/new-helper.js", "../support/new-helper.ts", "../support/new-helper"]) {
      const after = TEST_FILE.replace(`import { rule }`, `import { helper } from "${specifier}";\nimport { rule }`);
      const changes = [
        { status: "M" as const, path: PATH },
        { status: "A" as const, path: "tests/support/new-helper.ts" },
      ];
      expect(
        testChangeProblems(
          changes,
          () => TEST_FILE,
          (p) => (p === PATH ? after : ""),
        ),
        specifier,
      ).toEqual([
        "tests/rules/x.test.ts: imports tests/support/new-helper.ts, added in this change, which could affect existing tests",
      ]);
    }
  },
);
