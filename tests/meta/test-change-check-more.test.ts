// More of the test-change check (TF-7): scripts npm runs by itself, and new
// code in an existing test file that could change how its tests run. M1, so
// these must pass.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

rule(
  { req: ["TF-7"], m: "M1" },
  "the check reads only the app files git tracks",
  () => {
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const repo = mkdtempSync(join(tmpdir(), "awt-check-"));
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), text);
    };
    // Nothing from the machine's git settings (signing, hooks) or the CI job's summary file reaches these runs.
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "GITHUB_STEP_SUMMARY"));
    const settings = ["user.name=Test", "user.email=test@example.test", "commit.gpgsign=false", "core.hooksPath="];
    const git = (...args: string[]) =>
      execFileSync("git", [...settings.flatMap((s) => ["-c", s]), ...args], {
        cwd: repo,
        env,
        stdio: "pipe",
        timeout: 10_000,
      });
    const check = () => {
      const run = spawnSync(
        process.execPath,
        [join(root, "node_modules/tsx/dist/cli.mjs"), join(root, "scripts/check-test-changes.ts"), "--base", "main"],
        { cwd: repo, env, encoding: "utf8", timeout: 20_000 },
      );
      return { code: run.status, out: run.stdout + run.stderr };
    };
    try {
      write("tests/fixtures/characters.yaml", "aldric:\n  character: { name: Aldric }\n");
      write("tests/fixtures/users.yaml", "bram:\n  displayName: Bramblewick\n  email: bram@example.test\n");
      write(".gitignore", "src/generated/\n");
      write("src/app.ts", "export const app = 1;\n");
      git("init", "-q", "-b", "main");
      git("add", ".");
      git("commit", "-q", "-m", "start");

      // A file git ignores (here, generated output) never counts, even naming a test character.
      write("src/generated/names.ts", 'export const who = "Aldric";\n');
      const ignored = check();
      expect(ignored.out).toContain("The test-change check passed.");
      expect(ignored.code).toBe(0);

      // A tracked file naming one still fails, named. A tracked file deleted but not committed is skipped.
      write("src/named.ts", 'export const who = "Aldric";\n');
      git("add", "src/named.ts");
      git("commit", "-q", "-m", "name");
      rmSync(join(repo, "src/app.ts"));
      const tracked = check();
      expect(tracked.code).toBe(1);
      expect(tracked.out).toContain('src/named.ts: names "Aldric", from the test fixtures');
      expect(tracked.out).not.toContain("src/generated/names.ts");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  },
  { timeout: 30_000 },
);
