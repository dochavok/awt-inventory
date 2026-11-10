// Runs one of the repository's TypeScript scripts with tsx and reports its
// exit code and output, without throwing (so a failure is an assertion).

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

export function runScript(script: string, ...args: string[]): { exitCode: number; output: string } {
  try {
    const output = execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", script, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
    });
    return { exitCode: 0, output };
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string };
    return { exitCode: failed.status ?? 1, output: `${failed.stdout ?? ""}${failed.stderr ?? String(error)}` };
  }
}
