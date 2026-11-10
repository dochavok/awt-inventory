// Test settings (TF-4, TF-5). Changing this file needs a requirements change (TF-7).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["default", "./tests/support/reporter.ts"],
    allowOnly: false,
    passWithNoTests: false,
    setupFiles: ["tests/support/setup.ts"],
    environment: "node",
    // Undo every spy, mock and stubbed global or variable after each test, so
    // a test can never change how the tests after it run (TF-7).
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
