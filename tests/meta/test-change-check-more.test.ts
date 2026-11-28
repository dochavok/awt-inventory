// More of the test-change check (TF-7): scripts npm runs by itself, new code
// in an existing test file that could change how its tests run, the files it
// reads, and how CI runs it against a pull request. M1, so these must pass.

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { parse } from "yaml";
import {
  fixtureNames,
  packageProblems,
  testChangeProblems,
  testFileProblems,
  unfollowedProblems,
} from "../../scripts/test-change-lib";
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
    // Signing, hooks, the variables that point git at the outer repository (as set in a git hook)
    // and the CI job's summary file stay out of these runs.
    const outer = [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY",
      "GIT_COMMON_DIR",
      "GIT_PREFIX",
    ];
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => name !== "GITHUB_STEP_SUMMARY" && !outer.includes(name)),
    );
    const settings = ["user.name=Test", "user.email=test@example.test", "commit.gpgsign=false", "core.hooksPath="];
    const git = (...args: string[]) =>
      execFileSync("git", [...settings.flatMap((s) => ["-c", s]), ...args], {
        cwd: repo,
        env,
        stdio: "pipe",
        timeout: 5_000,
      });
    // Two checks and five git calls fit inside the test's 75 s; a timed-out check says so.
    const check = () => {
      const run = spawnSync(
        process.execPath,
        [join(root, "node_modules/tsx/dist/cli.mjs"), join(root, "scripts/check-test-changes.ts"), "--base", "main"],
        { cwd: repo, env, encoding: "utf8", timeout: 20_000 },
      );
      const error = run.error ? `\n${run.error.message}` : "";
      return { code: run.status, out: `${run.stdout ?? ""}${run.stderr ?? ""}${error}` };
    };
    try {
      write("tests/fixtures/characters.yaml", "aldric:\n  character: { name: Aldric }\n");
      write("tests/fixtures/users.yaml", "bram:\n  displayName: Bramblewick\n  email: bram@example.test\n");
      write(".gitignore", "src/generated/\n");
      write("src/app.ts", "export const app = 1;\n");
      write("src/old.ts", "export const old = 1;\n");
      git("init", "-q", "-b", "main");
      git("add", ".");
      git("commit", "-q", "-m", "start");

      // A file git ignores (here, generated output) never counts, even naming a test character.
      write("src/generated/names.ts", 'export const who = "Aldric";\n');
      const ignored = check();
      expect(ignored.out).toContain("The test-change check passed.");
      expect(ignored.code).toBe(0);

      // A tracked file naming one still fails, named. A tracked file deleted but not committed is
      // skipped, and so is one that's now a folder: only regular files are read.
      write("src/named.ts", 'export const who = "Aldric";\n');
      git("add", "src/named.ts");
      git("commit", "-q", "-m", "name");
      rmSync(join(repo, "src/app.ts"));
      rmSync(join(repo, "src/old.ts"));
      mkdirSync(join(repo, "src/old.ts"));
      const tracked = check();
      expect(tracked.code).toBe(1);
      expect(tracked.out).toContain('src/named.ts: names "Aldric", from the test fixtures');
      expect(tracked.out).not.toContain("src/generated/names.ts");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  },
  { timeout: 75_000 },
);

rule({ req: ["TF-7"], m: "M1" }, "changing or deleting the TypeScript settings is refused", () => {
  const read = () => "{}";
  expect(testChangeProblems([{ status: "M", path: "tsconfig.json" }], read, read)).toEqual([
    "tsconfig.json: changed (test settings and check scripts are protected)",
  ]);
  expect(testChangeProblems([{ status: "D", path: "tsconfig.json" }], read, read)).toEqual([
    "tsconfig.json: deleted (test settings and check scripts are protected)",
  ]);
});

rule(
  { req: ["TF-7"], m: "M1" },
  "only regular files in the app pass unnamed: links, submodules and other modes fail",
  () => {
    expect(
      unfollowedProblems([
        { path: "src/a.ts", mode: "100644" },
        { path: "src/run.sh", mode: "100755" },
        { path: "src/people.ts", mode: "120000" },
        { path: "src/vendor", mode: "160000" },
        { path: "src/odd", mode: "040000" },
      ]),
    ).toEqual([
      "src/people.ts: a link, which the check doesn't follow",
      "src/vendor: a submodule, which the check doesn't read",
      "src/odd: stored with mode 040000, which the check doesn't read",
    ]);
  },
);

rule({ req: ["TF-7"], m: "M1" }, "test data the check can't read fails it, named, rather than giving no names", () => {
  const users = "bram:\n  displayName: Bramblewick\n  email: bram@example.test\n";
  const characters = "aldric:\n  character: { name: Aldric }\n";
  // Each file is [mode, text], as git stores it.
  const names = (files: Record<string, [string, string]>) =>
    fixtureNames(
      (path) => files[path]?.[1],
      (path) => files[path]?.[0],
    );
  const unreadable = (path: string) => `${path}: can't be read as the test data, so part 2 can't check the names in it`;
  expect(
    names({
      "tests/fixtures/characters.yaml": ["100644", characters],
      "tests/fixtures/users.yaml": ["100644", users],
    }),
  ).toEqual({ names: ["Aldric", "Bramblewick", "bram@example.test"], problems: [] });
  // Missing; and a link, whose text (its target) reads as YAML records.
  expect(names({ "tests/fixtures/users.yaml": ["120000", "bram: Bramblewick"] })).toEqual({
    names: [],
    problems: [unreadable("tests/fixtures/characters.yaml"), unreadable("tests/fixtures/users.yaml")],
  });
  // Not valid YAML (a key twice), and not a set of records.
  expect(
    names({
      "tests/fixtures/characters.yaml": ["100644", "aldric: 1\naldric: 2\n"],
      "tests/fixtures/users.yaml": ["100644", "- Bramblewick\n"],
    }),
  ).toEqual({
    names: [],
    problems: [unreadable("tests/fixtures/characters.yaml"), unreadable("tests/fixtures/users.yaml")],
  });
});

/** The step of the test-change rule workflow that runs the check: its folder and command. */
function checkStep(root: string): { cwd: string; run: string } {
  type Workflow = { jobs: Record<string, { steps: { run?: string; "working-directory"?: string }[] }> };
  const workflow = parse(readFileSync(join(root, ".github/workflows/test-change-rule.yml"), "utf8")) as Workflow;
  const steps = Object.values(workflow.jobs)
    .flatMap((job) => job.steps)
    .filter((step) => step.run?.includes("check-test-changes.ts"));
  expect(steps, "the workflow's steps that run the check").toHaveLength(1);
  const [step] = steps;
  return { cwd: step!["working-directory"] ?? ".", run: step!.run! };
}

rule(
  { req: ["TF-7"], m: "M1" },
  "CI's check runs nothing from the pull request, and names a link or submodule in the app and test data stored as a link",
  () => {
    const root = fileURLToPath(new URL("../..", import.meta.url));
    // CI's layout: main's checkout (with its packages) in base/, the pull request in pr/.
    const work = mkdtempSync(join(tmpdir(), "awt-ci-"));
    const base = join(work, "base");
    const pr = join(work, "pr");
    const ran = join(work, "ran.txt");
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(pr, path)), { recursive: true });
      writeFileSync(join(pr, path), text);
    };
    // Signing, hooks, the variables that point git at the outer repository (as set in a git hook)
    // and the CI job's summary file stay out of these runs.
    const outer = [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY",
      "GIT_COMMON_DIR",
      "GIT_PREFIX",
    ];
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => name !== "GITHUB_STEP_SUMMARY" && !outer.includes(name)),
    );
    const settings = ["user.name=Test", "user.email=test@example.test", "commit.gpgsign=false", "core.hooksPath="];
    const git = (args: string[], input?: string) =>
      execFileSync("git", [...settings.flatMap((s) => ["-c", s]), ...args], {
        cwd: pr,
        env,
        encoding: "utf8",
        stdio: "pipe",
        timeout: 5_000,
        ...(input === undefined ? {} : { input }),
      });
    // base/ is a real folder, as in CI, so "../pr" is found from it; its packages and scripts are
    // main's, linked in, and its settings are a copy of main's.
    const links = ["node_modules", "scripts"].map((name) => join(base, name));
    try {
      mkdirSync(base);
      for (const link of links) symlinkSync(join(root, basename(link)), link, "junction");
      for (const file of ["package.json", "tsconfig.json"])
        writeFileSync(join(base, file), readFileSync(join(root, file)));
      write("tests/fixtures/characters.yaml", "aldric:\n  character: { name: Aldric }\n");
      write("tests/fixtures/users.yaml", "bram:\n  displayName: Bramblewick\n  email: bram@example.test\n");
      write("src/app.ts", "export const app = 1;\n");
      write("tsconfig.json", "{}\n");
      // A test whose path has a letter outside ASCII, which git quotes unless asked not to.
      write("tests/rules/ré.test.ts", 'rule({ req: ["GR-8"], m: "M4" }, "Aldric\'s CM", () => 170);\n');
      git(["init", "-q", "-b", "main"]);
      git(["add", "."]);
      git(["commit", "-q", "-m", "start"]);

      // The pull request, on a branch of its own: settings and code of its own, a link from the app
      // into the test data (stored as a link whatever the system) and a submodule in the app.
      git(["switch", "-q", "-c", "pull-request"]);
      write("src/app.ts", 'export const app = "Bramblewick";\n');
      write(
        "tsconfig.json",
        JSON.stringify({
          compilerOptions: { baseUrl: ".", paths: { yaml: ["./own.ts"], typescript: ["./own.ts"] } },
        }),
      );
      write(
        "own.ts",
        `import { writeFileSync } from "node:fs";\n` +
          `writeFileSync(${JSON.stringify(ran)}, "ran");\n` +
          `console.log("THE PULL REQUEST'S CODE RAN");\n` +
          `export const parse = () => ({});\nexport default {};\n`,
      );
      const target = git(["hash-object", "-w", "--stdin"], "../tests/fixtures/users.yaml").trim();
      git(["update-index", "--add", "--cacheinfo", `120000,${target},src/people.ts`]);
      const start = git(["rev-parse", "HEAD"]).trim();
      git(["update-index", "--add", "--cacheinfo", `160000,${start},src/vendor`]);
      // Test data stored as a link, whose target reads as YAML records: it fails, named.
      const records = git(["hash-object", "-w", "--stdin"], "aldric: elsewhere").trim();
      git(["update-index", "--cacheinfo", `120000,${records},tests/fixtures/characters.yaml`]);
      write("tests/rules/ré.test.ts", 'rule({ req: ["GR-8"], m: "M4" }, "Aldric\'s CM", () => 171);\n');
      git(["add", "tsconfig.json", "own.ts", "src/app.ts", "tests/rules/ré.test.ts"]);
      git(["commit", "-q", "-m", "pull request"]);
      // Where git keeps links as plain files (as on Windows), the link is still never read.
      write("src/people.ts", 'export const who = "Bramblewick";\n');
      // The test data is read from git, not from the disk (where a file could be a link elsewhere):
      // an uncommitted copy with other names changes nothing.
      write("tests/fixtures/users.yaml", "bram:\n  displayName: Quillon\n");

      const step = checkStep(root);
      const [command, ...args] = step.run.replace('"$BASE_SHA"', "main").split(/\s+/).filter(Boolean);
      expect(command, step.run).toBe("node");
      const run = spawnSync(process.execPath, args, {
        cwd: join(work, step.cwd),
        env,
        encoding: "utf8",
        timeout: 20_000,
      });
      const out = `${run.stdout ?? ""}${run.stderr ?? ""}${run.error ? `\n${run.error.message}` : ""}`;
      expect(existsSync(ran), out).toBe(false);
      expect(out).not.toContain("THE PULL REQUEST'S CODE RAN");
      expect(out).toContain("src/people.ts: a link, which the check doesn't follow");
      expect(out).toContain("src/vendor: a submodule, which the check doesn't read");
      expect(out).toContain("tsconfig.json: changed (test settings and check scripts are protected)");
      expect(out).toContain('src/app.ts: names "Bramblewick", from the test fixtures');
      expect(out).not.toContain("src/people.ts: names");
      expect(out).toContain(
        "tests/fixtures/characters.yaml: can't be read as the test data, so part 2 can't check the names in it",
      );
      expect(out).toContain(`tests/rules/ré.test.ts: rule(… "Aldric's CM") was changed or removed`);
      expect(run.status, out).toBe(1);
    } finally {
      // The links to the repository go first, on their own, so the clean-up never reaches into it:
      // if one can't be removed, the error stops the clean-up here.
      for (const link of links) if (existsSync(link)) unlinkSync(link);
      rmSync(work, { recursive: true, force: true });
    }
  },
  { timeout: 60_000 },
);
