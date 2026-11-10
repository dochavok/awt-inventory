// Runs tests/meta/probes/probes.ts with the same setup as the real tests.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: fileURLToPath(new URL("../../..", import.meta.url)),
    include: ["tests/meta/probes/probes.ts"],
    setupFiles: ["tests/support/setup.ts"],
    environment: "node",
  },
});
