// Operations (NF-5, NF-10, NF-11, NF-15): what delivers them is configuration and
// documents, so these tests check those. Files that don't exist yet fail as
// expected (an assertion), never with a crash.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { expect } from "vitest";
import { parse } from "yaml";
import { backupPlan } from "../../src/server/backup";
import { rule } from "../support/rule";
import { exportRequest } from "../../src/server/backup";

const ROOT = new URL("../../", import.meta.url);

function read(path: string): string {
  expect(existsSync(new URL(path, ROOT)), `${path} exists`).toBe(true);
  return readFileSync(new URL(path, ROOT), "utf8");
}

rule(
  { req: ["NF-11"], m: "M3" },
  "deploying runs only from main, only after CI passes, through the production environment",
  () => {
    const deploy = parse(read(".github/workflows/deploy.yml")) as {
      on: Record<string, { workflows?: string[]; types?: string[]; branches?: string[] }>;
      jobs: Record<string, { environment?: string | { name: string }; if?: string }>;
    };
    expect(Object.keys(deploy.on), "what starts a deploy").toEqual(["workflow_run"]);
    expect(deploy.on.workflow_run, "the deploy trigger").toMatchObject({
      workflows: ["CI"],
      types: ["completed"],
      branches: ["main"],
    });
    const jobs = Object.values(deploy.jobs);
    expect(jobs.length, "deploy jobs").toBeGreaterThan(0);
    for (const job of jobs) {
      const environment = typeof job.environment === "string" ? job.environment : job.environment?.name;
      expect(environment, "the deploy job's environment").toBe("production");
      expect(job.if ?? "", "the deploy job's condition").toContain("conclusion == 'success'");
    }
  },
);

rule(
  { req: ["NF-11", "NF-7"], m: "M3" },
  "no workflow holds a secret in plain text; deploy credentials come from secrets",
  () => {
    const deploy = read(".github/workflows/deploy.yml");
    expect(deploy, "the deploy workflow").toMatch(/\$\{\{\s*secrets\./);
    for (const file of ["deploy.yml", "ci.yml"]) {
      const text = read(`.github/workflows/${file}`);
      expect(text, `${file} with a private key`).not.toMatch(/BEGIN (RSA |EC )?PRIVATE KEY/);
      expect(text, `${file} with a token`).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}/);
    }
  },
);

rule(
  { req: ["NF-11"], m: "M3" },
  "Dependabot updates every package ecosystem, the Cloud Functions folder included",
  () => {
    const config = parse(read(".github/dependabot.yml")) as {
      updates: { "package-ecosystem": string; directory: string }[];
    };
    const entries = config.updates.map((u) => `${u["package-ecosystem"]} ${u.directory}`).sort();
    expect(entries, "Dependabot's update entries").toEqual(["github-actions /", "npm /", "npm /functions"]);
  },
);

rule(
  { req: ["NF-11"], m: "M3" },
  "every workflow refers to each action by a full commit SHA, with its version in a comment",
  () => {
    const workflows = readdirSync(new URL(".github/workflows/", ROOT)).filter((f) => /\.ya?ml$/.test(f));
    expect(workflows, "the workflows checked").toEqual(
      expect.arrayContaining(["ci.yml", "deploy.yml", "test-change-rule.yml"]),
    );
    let actions = 0;
    for (const file of workflows) {
      const text = read(`.github/workflows/${file}`);
      const workflow = parse(text) as {
        jobs?: Record<string, { uses?: string; steps?: { uses?: string }[] }>;
      } | null;
      const uses = Object.values(workflow?.jobs ?? {}).flatMap((job) => [
        ...(job.uses ? [job.uses] : []),
        ...(job.steps ?? []).flatMap((step) => (step.uses ? [step.uses] : [])),
      ]);
      for (const action of uses) {
        actions++;
        expect(action, `${file}: ${action}`).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/);
        const lines = text.split("\n").filter((line) => line.includes(`uses: ${action}`));
        expect(lines.length, `${file}: the lines using ${action}`).toBeGreaterThan(0);
        for (const line of lines) {
          expect(line, `${file}: the version comment for ${action}`).toMatch(/@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*$/);
        }
      }
    }
    expect(actions, "the actions the workflows use").toBeGreaterThanOrEqual(20);
  },
);

rule(
  { req: ["NF-10"], m: "M3" },
  "the database is backed up every night, encrypted, to another project, and kept 30 days",
  () => {
    const plan = backupPlan({
      appProject: "awt-inventory-test",
      backupProject: "awt-inventory-backup-test",
      bucket: "made-up-bucket",
    });
    expect(plan.schedule, "how often").toMatch(/every 24 hours|every day|^\d{1,2} \d{1,2} \* \* \*$/);
    expect(plan.bucketProject, "the bucket's project").toBe("awt-inventory-backup-test");
    expect(plan.bucketProject, "the bucket's project").not.toBe("awt-inventory-test");
    expect(plan.retentionDays, "days kept").toBe(30);
    expect(["google-managed", "customer-managed"], "the encryption").toContain(plan.encryption);
  },
);

rule({ req: ["NF-10"], m: "M3" }, "a written restore runbook records when a restore was last tested", () => {
  const runbook = read("docs/restore-runbook.md");
  expect(runbook, "the runbook's test record").toMatch(/Restore tested:\s*\d{4}-\d{2}-\d{2}/);
});

rule(
  { req: ["NF-5"], m: "M3" },
  "the maintainer guide says where costs are recorded and that a budget alert is set at $5",
  () => {
    const guide = read("docs/maintainer.md");
    expect(guide, "the maintainer guide on costs").toMatch(/services\.md/);
    expect(guide, "the maintainer guide on the budget alert").toMatch(/budget alert[^\n]*\$5/i);
  },
);

rule({ req: ["NF-11"], m: "M3" }, "every CI job has a time limit of 30 minutes or less", () => {
  const workflows = readdirSync(new URL(".github/workflows/", ROOT)).filter((f) => /\.ya?ml$/.test(f));
  expect(workflows, "the workflows checked").toEqual(expect.arrayContaining(["ci.yml", "test-change-rule.yml"]));
  for (const file of workflows) {
    const workflow = parse(read(`.github/workflows/${file}`)) as {
      jobs?: Record<string, { "timeout-minutes"?: unknown }>;
    } | null;
    const jobs = Object.entries(workflow?.jobs ?? {});
    expect(jobs.length, `${file}'s jobs`).toBeGreaterThan(0);
    for (const [name, job] of jobs) {
      const limit = job["timeout-minutes"];
      expect(typeof limit, `${file} ${name}'s time limit`).toBe("number");
      expect(limit as number, `${file} ${name}'s time limit`).toBeGreaterThanOrEqual(1);
      expect(limit as number, `${file} ${name}'s time limit`).toBeLessThanOrEqual(30);
    }
  }
});

rule({ req: ["NF-11"], m: "M3" }, "CI builds the Cloud Functions with the same build the deploy runs", () => {
  const firebase = JSON.parse(read("firebase.json")) as { functions?: { source?: string; predeploy?: string[] }[] };
  const functions = firebase.functions ?? [];
  expect(
    functions.map((f) => f.source),
    "the Cloud Functions folders the deploy uses",
  ).toEqual(["functions"]);
  expect(functions[0]?.predeploy, "the deploy's build of the Cloud Functions").toEqual([
    "npm --prefix functions run build",
  ]);
  type Step = { run?: string; "working-directory"?: string; if?: string };
  const ci = parse(read(".github/workflows/ci.yml")) as { jobs: Record<string, { steps?: Step[] }> };
  const inFunctions = (steps: Step[], command: string) =>
    steps.findIndex((s) => s["working-directory"] === "functions" && s.run?.trim() === command);
  const building = Object.entries(ci.jobs).filter(([, job]) => inFunctions(job.steps ?? [], "npm run build") >= 0);
  expect(
    building.map(([name]) => name),
    "CI jobs that build the Cloud Functions",
  ).toHaveLength(1);
  const steps = building[0]![1].steps!;
  const install = inFunctions(steps, "npm ci");
  const build = inFunctions(steps, "npm run build");
  expect(install, "CI installs the Cloud Functions packages").toBeGreaterThanOrEqual(0);
  expect(install, "CI installs the Cloud Functions packages before building").toBeLessThan(build);
  // Skipped only while functions/ doesn't exist.
  for (const step of [steps[install]!, steps[build]!]) {
    expect([undefined, "hashFiles('functions/package.json') != ''"], `when CI runs "${step.run}"`).toContain(step.if);
  }
});

type DeployStep = { uses?: string; with?: Record<string, unknown> };

function deployJobs() {
  const deploy = parse(read(".github/workflows/deploy.yml")) as {
    jobs: Record<string, { if?: string; steps?: DeployStep[] }>;
  };
  const jobs = Object.entries(deploy.jobs);
  expect(jobs.length, "deploy jobs").toBeGreaterThan(0);
  return jobs;
}

function checkoutOf(steps: DeployStep[] | undefined): DeployStep | undefined {
  return (steps ?? []).find((s) => s.uses?.startsWith("actions/checkout@"));
}

rule(
  { req: ["NF-11"], m: "M3" },
  "a deploy starts only from a CI run for a push to main in this repository, and deploys the commit CI checked",
  () => {
    for (const [name, job] of deployJobs()) {
      const condition = job.if ?? "";
      for (const part of [
        "github.event.workflow_run.event == 'push'",
        "github.event.workflow_run.head_branch == 'main'",
        "github.event.workflow_run.head_repository.full_name == github.repository",
      ]) {
        expect(condition, `${name}'s condition`).toContain(part);
      }
      expect(checkoutOf(job.steps)?.with?.ref, `the commit ${name} checks out`).toBe(
        "${{ github.event.workflow_run.head_sha }}",
      );
    }
  },
);

rule(
  { req: ["DOC-6"], m: "M3" },
  "the deploy checks out the whole history, so each help page shows when it was really last updated",
  () => {
    for (const [name, job] of deployJobs()) {
      expect(checkoutOf(job.steps)?.with?.["fetch-depth"], `${name}'s checkout depth`).toBe(0);
    }
  },
);

rule(
  { req: ["NF-10"], m: "M3" },
  "each night's backup is the whole database, in its own dated folder in the backup bucket",
  () => {
    const plan = backupPlan({
      appProject: "awt-inventory-test",
      backupProject: "awt-inventory-backup-test",
      bucket: "made-up-bucket",
    });
    expect(exportRequest(plan, "awt-inventory-test", new Date("2026-06-13T03:00:00.000Z")), "the export").toEqual({
      name: "projects/awt-inventory-test/databases/(default)",
      outputUriPrefix: "gs://made-up-bucket/2026-06-13",
      collectionIds: [],
    });
  },
);

rule(
  { req: ["NF-10"], m: "M3" },
  "the backup bucket's lifecycle deletes each backup once it's as old as the plan keeps them",
  () => {
    const plan = backupPlan({
      appProject: "awt-inventory-test",
      backupProject: "awt-inventory-backup-test",
      bucket: "made-up-bucket",
    });
    const file = JSON.parse(read("docs/backup-lifecycle.json")) as { lifecycle?: { rule?: unknown } };
    expect(file.lifecycle?.rule, "the bucket's lifecycle rules").toEqual([
      { action: { type: "Delete" }, condition: { age: plan.retentionDays } },
    ]);
  },
);

rule(
  { req: ["NF-11"], m: "M3" },
  "a deploy goes ahead only while its commit is still the newest on main, so an older one can't replace it",
  () => {
    for (const [name, job] of deployJobs()) {
      const steps = (job.steps ?? []) as (DeployStep & { id?: string; name?: string; run?: string; if?: string })[];
      const check = steps.findIndex((s) => s.id === "latest");
      expect(check, `${name}'s check that its commit is the newest on main`).toBeGreaterThan(0);
      expect(steps[check]?.run ?? "", "the check").toContain("refs/heads/main");
      expect(steps[check]?.run ?? "", "the check").toContain("github.event.workflow_run.head_sha");
      for (const step of steps.slice(check + 1)) {
        expect(step.if ?? "", `${name}'s step ${step.name ?? step.uses ?? step.run}`).toContain(
          "steps.latest.outputs.newest == 'true'",
        );
      }
    }
  },
);

rule(
  { req: ["NF-15"], m: "M4" },
  "every page the app serves tells the browser it can't be shown inside another site's page",
  () => {
    type Header = { key: string; value: string };
    const firebase = JSON.parse(read("firebase.json")) as {
      hosting?: { headers?: { source?: string; regex?: string; headers: Header[] }[] };
    };
    // Firebase Hosting's own matcher, with forward-slash paths: the hosting emulator
    // can't be used for this on Windows (it sends no custom headers there).
    const { configMatcher } = createRequire(import.meta.url)("superstatic/lib/utils/patterns.js") as {
      configMatcher: (path: string, config: { source?: string; regex?: string }) => boolean;
    };
    const rules = firebase.hosting?.headers ?? [];
    for (const path of [
      "/",
      "/index.html",
      "/characters/aldric",
      "/help/",
      "/help/equipping.html",
      "/assets/index-3f9a1c.js",
      "/sw.js",
      "/manifest.webmanifest",
    ]) {
      // Each rule that matches sets its headers, a later one replacing an earlier one's value.
      const sent = new Map<string, string>();
      for (const r of rules.filter((r) => configMatcher(path, r))) {
        for (const h of r.headers) sent.set(h.key.toLowerCase(), h.value);
      }
      expect(sent.get("content-security-policy"), `${path}'s Content-Security-Policy`).toBe("frame-ancestors 'none'");
      expect(sent.get("x-frame-options"), `${path}'s X-Frame-Options`).toBe("DENY");
    }
  },
);
