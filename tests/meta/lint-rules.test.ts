// The lint settings (eslint.config.js) that enforce requirements. TF-7: the
// server code in functions/ never refers to the tests, the test tools or the
// test data. The test-change check's own scan covers src/ only, so for
// functions/ the lint job is what refuses it.

import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { expect } from "vitest";
import { rule } from "../support/rule";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The no-restricted-imports messages for one import line in a file at `filePath`. */
async function refusals(filePath: string, module: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: ROOT });
  const [result] = await eslint.lintText(`import * as probe from "${module}";\nexport default probe;\n`, {
    filePath,
  });
  expect(
    result?.messages.filter((m) => m.ruleId === null),
    `lint errors for ${filePath}`,
  ).toEqual([]);
  return (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-imports").map((m) => m.message);
}

const SERVER_FILE = "functions/src/reports.ts";

rule(
  { req: ["TF-7"], m: "M3" },
  "the server code in functions/ can't import the tests, test data or test tools",
  async () => {
    for (const module of [
      "../../tests/support/fake-auth",
      "../../tests/fixtures/users.yaml",
      "vitest",
      "@playwright/test",
      "fast-check",
      "@firebase/rules-unit-testing",
    ]) {
      const messages = await refusals(SERVER_FILE, module);
      expect(messages.length, `refusals of ${module} in ${SERVER_FILE}`).toBe(1);
      expect(messages[0], `the refusal of ${module}`).toContain(`'${module}'`);
      expect(messages[0], `the refusal of ${module}`).toContain("TF-7");
    }
  },
  { timeout: 30_000 },
);

rule(
  { req: ["TF-7"], m: "M3" },
  "the server code in functions/ can still import the shared server and data code",
  async () => {
    for (const module of ["../../src/server/reports", "../../src/data/types", "firebase-functions/v2/https"]) {
      expect(await refusals(SERVER_FILE, module), `refusals of ${module} in ${SERVER_FILE}`).toEqual([]);
    }
  },
  { timeout: 30_000 },
);
