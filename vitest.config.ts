// Test settings (TF-4, TF-5). Changing this file needs a requirements change (TF-7).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["default", "./tests/support/reporter.ts"],
    allowOnly: false,
    passWithNoTests: false,
    setupFiles: ["tests/support/setup.ts"],
    environment: "node",
    // Before each test, undo the spies, mocks and stubbed globals and
    // environment variables earlier tests left behind (TF-7). Fake timers are
    // undone after each test by tests/support/setup.ts. Direct changes to
    // globals (such as `Date.now = ...`) aren't undone; the test-change check
    // refuses them at the top level of an existing test file.
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/access/**", "tests/browser/**"],
        },
      },
      {
        extends: true,
        test: {
          // Run inside the Firestore emulator: npm run test:access (TF-11).
          name: "access",
          include: ["tests/access/**/*.test.ts"],
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
