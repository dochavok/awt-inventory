// The reference data at build time (section 13: RD-1, RD-4; NF-4): the app's
// build reads data/*.yaml through loadReferenceData and gives the app the result
// as the module "virtual:reference-data", so bad data fails the build. Uses the
// test copy in tests/fixtures/refdata/ and broken copies of it, except the check
// that the app's own build reads data/, which names nothing in it (RD-8).

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { expect } from "vitest";
import { parse, stringify } from "yaml";
import { readReferenceData, referenceData } from "../../build/reference-data";
import { loadReferenceData, type ReferenceFiles } from "../../src/refdata";
import type { ReferenceData } from "../../src/rules/types";
import { rule } from "../support/rule";

const FIXTURES = fileURLToPath(new URL("../fixtures/refdata/", import.meta.url));
const DATA = fileURLToPath(new URL("../../data/", import.meta.url));

/** The YAML files in `dir`, by file name. */
function filesIn(dir: string): ReferenceFiles {
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => [f, readFileSync(join(dir, f), "utf8")]),
  );
}

/** A folder holding `files`, removed once `use` is done with it. */
function inFolder<T>(files: ReferenceFiles, use: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "awt-refdata-"));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return use(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The reference data the plugin's module gives the app, run as Vite would run its hooks. */
function moduleData(plugin: Plugin): ReferenceData {
  const call = (hook: unknown, ...args: unknown[]) =>
    (hook as (this: unknown, ...a: unknown[]) => unknown).call({ addWatchFile() {} }, ...args);
  const id = call(plugin.resolveId, "virtual:reference-data", undefined, {});
  expect(id, "the module's ID, once the plugin resolves it").toEqual(expect.any(String));
  const code = call(plugin.load, id) as string;
  const prefix = "export default ";
  expect(code.startsWith(prefix), "the module exports the data").toBe(true);
  return JSON.parse(code.slice(prefix.length).replace(/;\s*$/, "")) as ReferenceData;
}

rule(
  { req: ["RD-1", "RD-4"], m: "M2" },
  "the app's build reads and checks the reference data files: what it builds in is what loading them gives",
  () => {
    const built = readReferenceData(FIXTURES);
    // Built into the app as JSON, so it must come back the same from JSON.
    expect(JSON.parse(JSON.stringify(built)), "the reference data the build reads").toEqual(
      loadReferenceData(filesIn(FIXTURES)),
    );
    expect(moduleData(referenceData(FIXTURES)), "the reference data the build's module gives the app").toEqual(
      loadReferenceData(filesIn(FIXTURES)),
    );
    expect(
      built.slotKinds.map((k) => k.id),
      "slot kinds the build read",
    ).toContain("tail");
  },
);

rule({ req: ["RD-4"], m: "M2" }, "the app's build fails on reference data with a problem, naming it", () => {
  const files = filesIn(FIXTURES);
  const rarities = parse(files["rarities.yaml"]!) as Record<string, unknown>[];
  rarities[1]!.limitt = 1;
  const broken = { ...files, "rarities.yaml": stringify(rarities) };
  expect(() => inFolder(broken, readReferenceData), "building with a misspelled rarity field").toThrow(
    /RD-4[\s\S]*rarities\.yaml legendary: .*limitt/,
  );
  expect(
    () => inFolder(broken, (dir) => moduleData(referenceData(dir))),
    "the build's module with a misspelled rarity field",
  ).toThrow(/RD-4[\s\S]*rarities\.yaml legendary: .*limitt/);
});

rule(
  { req: ["NF-4"], m: "M2" },
  "the lint check refuses a YAML parser, a schema checker, the data loader or the build's code in the browser's code",
  async () => {
    const { ESLint } = await import("eslint");
    const eslint = new ESLint();
    const lint = async (path: string, code: string) =>
      (await eslint.lintText(code, { filePath: path }))[0]!.messages.map((m) => m.ruleId);
    for (const path of [
      "src/app/probe.tsx",
      "src/data/probe.ts",
      "src/data/probe.tsx",
      "src/platform/probe.ts",
      "src/rules/probe.ts",
      "src/probe.ts",
    ]) {
      const up = path.split("/").length === 2 ? "./" : "../";
      for (const from of ["yaml", "zod", `${up}refdata`, `${up}../build/reference-data`]) {
        expect(
          await lint(path, `import * as probe from "${from}";\nexport { probe };\n`),
          `the lint check on importing ${from} in ${path}`,
        ).toContain("no-restricted-imports");
        expect(
          await lint(path, `export const probe = import("${from}");\n`),
          `the lint check on a dynamic import of ${from} in ${path}`,
        ).toContain("no-restricted-syntax");
      }
    }
  },
);

rule({ req: ["RD-4"], m: "M2" }, "the app's own build reads its reference data from data/", async () => {
  const config = (await import("../../vite.config")).default as { plugins: unknown[] };
  const plugin = (config.plugins.flat(Infinity) as Plugin[]).find((p) => p?.name === "awt-reference-data");
  expect(plugin, "the reference data plugin in the app's build").toBeDefined();
  expect(moduleData(plugin!), "the reference data the app's build gives it").toEqual(readReferenceData(DATA));
});
