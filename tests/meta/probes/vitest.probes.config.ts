// Runs tests/meta/probes/probes.ts with the same setup as the real tests.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: new URL("../../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    include: ["tests/meta/probes/probes.ts"],
    setupFiles: ["tests/support/setup.ts"],
    environment: "node",
  },
});
