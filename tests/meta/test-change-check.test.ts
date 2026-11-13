// The test-change check (TF-7): what it refuses and what it allows. M1, so
// these must pass. The rules themselves are listed in scripts/test-change-lib.ts.

import { expect } from "vitest";
import {
  appCodeProblems,
  isAppFile,
  packageProblems,
  sameApartFromActionVersions,
  testChangeProblems,
  testFileProblems,
  yamlProblems,
  type Change,
} from "../../scripts/test-change-lib";
import { rule } from "../support/rule";

const TEST_FILE = `import { expect } from "vitest";
import { rule } from "../support/rule";

const ref = load();

rule({ req: ["GR-8"], m: "M4" }, "Aldric's CM is 170", () => {
  expect(total(ref)).toBe(170);
});
`;

const files = (contents: Record<string, string>) => (path: string) => contents[path];
const check = (changes: Change[], before: Record<string, string>, after: Record<string, string>) =>
  testChangeProblems(changes, files(before), files(after));

rule({ req: ["TF-7"], m: "M1" }, "adding a test to an existing file is allowed", () => {
  const added = `${TEST_FILE}\nrule({ req: ["GR-9"], m: "M4" }, "mitigation", () => {\n  expect(1).toBe(2);\n});\n`;
  expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, added)).toEqual([]);
});

rule({ req: ["TF-7"], m: "M1" }, "formatting and comments don't count as a change", () => {
  const reformatted = TEST_FILE.replace(
    `expect(total(ref)).toBe(170);`,
    `// the GR-8 example\n  expect( total(ref) ).toBe( 170 )`,
  );
  expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, reformatted)).toEqual([]);
});

rule(
  { req: ["TF-7", "TF-6"], m: "M1" },
  "changing an expected value in an existing test is refused, naming the test",
  () => {
    const weakened = TEST_FILE.replace("toBe(170)", "toBe(169)");
    expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, weakened)).toEqual([
      `tests/rules/x.test.ts: rule(… "Aldric's CM is 170") was changed or removed`,
    ]);
  },
);

rule({ req: ["TF-7", "TF-6"], m: "M1" }, "removing a test, or changing a shared helper, is refused", () => {
  const removed = TEST_FILE.slice(0, TEST_FILE.indexOf("rule({"));
  expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, removed)).toEqual([
    `tests/rules/x.test.ts: rule(… "Aldric's CM is 170") was changed or removed`,
  ]);
  const helper = TEST_FILE.replace("const ref = load();", "const ref = loadOther();");
  expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, helper)).toEqual([
    "tests/rules/x.test.ts: the statement at line 4 (const ref = load();) was changed or removed",
  ]);
});

rule({ req: ["TF-7"], m: "M1" }, "new names in an existing import are allowed; dropping one isn't", () => {
  const grown = TEST_FILE.replace(`import { expect } from "vitest";`, `import { expect, vi } from "vitest";`);
  expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, grown)).toEqual([]);
  const shrunk = TEST_FILE.replace(`import { rule } from "../support/rule";`, `import {} from "../support/rule";`);
  expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, shrunk)).toHaveLength(1);
});

rule({ req: ["TF-7"], m: "M1" }, "new top-level code that could affect existing tests is refused", () => {
  const hooked = `${TEST_FILE}\nbeforeEach(() => { ref.cm = 0; });\n`;
  expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, hooked)).toEqual([
    "tests/rules/x.test.ts: new beforeEach(…) could affect existing tests",
  ]);
  const mocked = `${TEST_FILE}\nvi.mock("../../src/rules");\n`;
  expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, mocked)).toEqual([
    'tests/rules/x.test.ts: new vi.mock(… "../../src/rules") could affect existing tests',
  ]);
  const redefined = TEST_FILE.replace("const ref = load();", "const ref = load();\nfunction load() { return {}; }");
  expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, redefined)).toEqual([]);
  const clash = `${TEST_FILE}\nvar ref = 0;\n`;
  expect(testFileProblems("tests/rules/x.test.ts", TEST_FILE, clash)).toEqual([
    "tests/rules/x.test.ts: new code redefines ref, which existing tests may use",
  ]);
});

rule(
  { req: ["TF-7", "TF-9"], m: "M1" },
  "a new scenario is allowed; changing or removing one is refused, naming it",
  () => {
    const before =
      "- id: cm-aldric\n  expect: { cm: { total: 170 } }\n- id: hearts\n  expect: { hearts: { total: 13 } }\n";
    expect(
      yamlProblems("tests/scenarios/t.yaml", before, `${before}- id: new-one\n  expect: { cm: { total: 1 } }\n`),
    ).toEqual([]);
    expect(yamlProblems("tests/scenarios/t.yaml", before, before.replace("170", "171"))).toEqual([
      "tests/scenarios/t.yaml: the record with id cm-aldric was changed",
    ]);
    expect(yamlProblems("tests/scenarios/t.yaml", before, before.split("- id: hearts")[0]!)).toEqual([
      "tests/scenarios/t.yaml: the record with id hearts was removed",
    ]);
  },
);

rule({ req: ["TF-7", "TF-3"], m: "M1" }, "fixtures may gain records but not change existing ones", () => {
  const before = "aldric:\n  character: { name: Aldric, level: 25 }\nbrin:\n  character: { name: Brin, level: 8 }\n";
  expect(
    yamlProblems("tests/fixtures/characters.yaml", before, `${before}wren:\n  character: { name: Wren, level: 3 }\n`),
  ).toEqual([]);
  expect(yamlProblems("tests/fixtures/characters.yaml", before, before.replace("25", "24"))).toEqual([
    'tests/fixtures/characters.yaml "aldric": changed',
  ]);
  const skills = "skills:\n  - { id: spark, tier: normal }\n";
  expect(yamlProblems("tests/fixtures/refdata/skills.yaml", skills, `${skills}  - { id: glow, tier: epic }\n`)).toEqual(
    [],
  );
  expect(yamlProblems("tests/fixtures/refdata/skills.yaml", skills, skills.replace("normal", "epic"))).toEqual([
    'tests/fixtures/refdata/skills.yaml "skills": the record with id spark was changed',
  ]);
  const chart = "Warrior:\n  levels:\n    - { level: 1, classBonus: 15 }\n";
  expect(yamlProblems("tests/fixtures/refdata/level-chart.yaml", chart, chart.replace("15", "16"))).toEqual([
    'tests/fixtures/refdata/level-chart.yaml "Warrior": changed',
  ]);
});

rule(
  { req: ["TF-7"], m: "M1" },
  "the harness, settings and check scripts can't change, but new files can be added",
  () => {
    const problems = check(
      [
        { status: "M", path: "tests/support/rule.ts" },
        { status: "D", path: "tests/fixtures/users.yaml" },
        { status: "M", path: "vitest.config.ts" },
        { status: "M", path: "scripts/test-change-lib.ts" },
        { status: "M", path: ".claude/settings.json" },
        { status: "A", path: "tests/support/new-helper.ts" },
        { status: "M", path: "tests/COVERAGE.md" },
        { status: "M", path: "src/rules/index.ts" },
      ],
      {},
      {},
    );
    expect(problems).toEqual([
      "tests/support/rule.ts: changed (the test harness can't change)",
      "tests/fixtures/users.yaml: deleted",
      "vitest.config.ts: changed (test settings and check scripts are protected)",
      "scripts/test-change-lib.ts: changed (test settings and check scripts are protected)",
      ".claude/settings.json: changed (test settings and check scripts are protected)",
    ]);
  },
);

rule({ req: ["TF-7", "TF-6"], m: "M1" }, "a change that also edits the requirements may change existing tests", () => {
  const weakened = TEST_FILE.replace("toBe(170)", "toBe(169)");
  const changes: Change[] = [
    { status: "M", path: "tests/rules/x.test.ts" },
    { status: "M", path: "inventory-requirements.md" },
  ];
  expect(check(changes, { "tests/rules/x.test.ts": TEST_FILE }, { "tests/rules/x.test.ts": weakened })).toEqual([]);
  expect(
    check([changes[0]!], { "tests/rules/x.test.ts": TEST_FILE }, { "tests/rules/x.test.ts": weakened }),
  ).toHaveLength(1);
});

rule(
  { req: ["TF-7", "TF-5"], m: "M1" },
  "package.json may gain finished milestones and packages, but not lose one or change a test script",
  () => {
    const before = JSON.stringify({
      scripts: { test: "vitest run", dev: "vite" },
      awt: { finishedMilestones: ["M1"] },
    });
    const grown = JSON.stringify({
      scripts: { test: "vitest run", dev: "vite --open" },
      awt: { finishedMilestones: ["M1", "M2"] },
      dependencies: { zod: "4" },
    });
    expect(packageProblems(before, grown)).toEqual([]);
    const worse = JSON.stringify({
      scripts: { test: "vitest run --passWithNoTests" },
      awt: { finishedMilestones: [] },
    });
    expect(packageProblems(before, worse)).toEqual([
      'package.json: the "test" script was changed',
      "package.json: finished milestone M1 was removed from awt.finishedMilestones",
    ]);
  },
);

rule({ req: ["TF-7"], m: "M1" }, "a workflow may only change the versions of the actions it uses", () => {
  const before = "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v5\n      - run: npm test\n";
  expect(sameApartFromActionVersions(before, before.replace("@v5", "@v6"))).toBe(true);
  expect(sameApartFromActionVersions(before, before.replace("npm test", "npm test || true"))).toBe(false);
  expect(sameApartFromActionVersions(before, before.replace("actions/checkout", "someone/checkout"))).toBe(false);
  expect(check([{ status: "D", path: ".github/workflows/ci.yml" }], {}, {})).toEqual([
    ".github/workflows/ci.yml: a CI workflow was deleted",
  ]);
});

rule({ req: ["TF-7"], m: "M1" }, "app code may not import the tests or test tools, or name a test character", () => {
  const app = new Map([
    ["src/rules/a.ts", `import { fixtureSheet } from "../../tests/support/fixtures";\nexport const x = 1;`],
    ["src/data/b.ts", `import fc from "fast-check";\nconst y = await import("vitest");`],
    ["src/data/c.ts", `export const greeting = "Hello, Aldric";`],
    ["data/skills.yaml", "- { id: ok, name: Bramblewick's Bane }"],
    [
      "src/rules/fine.ts",
      `import { z } from "zod";\n// Aldricson is a different word\nexport const tests = "contests";`,
    ],
  ]);
  expect(appCodeProblems(app, ["Aldric", "Bramblewick"])).toEqual([
    "src/rules/a.ts: imports ../../tests/support/fixtures, from the tests",
    "src/data/b.ts: imports fast-check, a test tool",
    "src/data/b.ts: imports vitest, a test tool",
    'src/data/c.ts: names "Aldric", from the test fixtures',
    'data/skills.yaml: names "Bramblewick", from the test fixtures',
  ]);
});

rule(
  { req: ["TF-7"], m: "M1" },
  "the server code in functions/ may not import the tests or test tools, however it imports them, or name a test character",
  () => {
    const app = new Map([
      ["functions/src/index.ts", `import { users } from "../../tests/fixtures/users.yaml";\nexport const x = users;`],
      ["functions/src/dynamic.ts", `export const load = () => import("../../tests/support/fake-auth");`],
      ["functions/src/folder.ts", `export * from "../../tests";`],
      ["functions/src/tool.js", `const fc = require("fast-check");\nmodule.exports = fc;`],
      ["functions/src/greet.ts", `export const greeting = "Hello, Aldric";`],
      [
        "functions/src/fine.ts",
        `import { deliverReport } from "../../src/server/reports";\n` +
          `import { onSchedule } from "firebase-functions/v2/scheduler";\nexport const run = [deliverReport, onSchedule];`,
      ],
    ]);
    expect(appCodeProblems(app, ["Aldric"])).toEqual([
      "functions/src/index.ts: imports ../../tests/fixtures/users.yaml, from the tests",
      "functions/src/dynamic.ts: imports ../../tests/support/fake-auth, from the tests",
      "functions/src/folder.ts: imports ../../tests, from the tests",
      "functions/src/tool.js: imports fast-check, a test tool",
      'functions/src/greet.ts: names "Aldric", from the test fixtures',
    ]);
  },
);

rule(
  { req: ["TF-7"], m: "M1" },
  "the app code checked is src/, data/ and functions/, without functions/' packages, lockfile or build output",
  () => {
    const paths = [
      "src/app/App.tsx",
      "data/skills.yaml",
      "functions/src/index.ts",
      "functions/package.json",
      "functions/package-lock.json",
      "functions/node_modules/vitest/index.js",
      "functions/lib/index.js",
      "tests/support/rule.ts",
      "scripts/coverage.ts",
      "build/help-pages.ts",
    ];
    expect(paths.filter((p) => isAppFile(p))).toEqual([
      "src/app/App.tsx",
      "data/skills.yaml",
      "functions/src/index.ts",
      "functions/package.json",
    ]);
  },
);
