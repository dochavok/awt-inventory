// Phone-sized browser tests (TF-13, NF-1), run against the production build and
// the local sign-in and database emulators, never a real project. Changing this
// file needs a requirements change (TF-7). Every test is declared with browserRule().
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  testMatch: "**/*.spec.ts",
  forbidOnly: true,
  fullyParallel: true,
  reporter: [["list"]],
  // A failed action must not hang: expect() guards each one, so this never decides a result.
  use: { baseURL: "http://127.0.0.1:4173", actionTimeout: 5_000 },
  expect: { timeout: 5_000 },
  webServer: {
    // The production build, so offline help (DOC-1, NF-3) runs as it will for players.
    // emulators:exec starts the preview only once both emulators are ready, so the
    // wait on the preview's address covers them too; stopping it stops them.
    command:
      'npx firebase emulators:exec --only firestore,auth --project demo-awt-inventory "npx vite build && npx vite preview --host 127.0.0.1"',
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    // The first run downloads the Firestore emulator.
    timeout: 120_000,
  },
  projects: [
    // NF-1: Safari on iPhone and Chrome on Android, held upright, from 360 pixels wide.
    { name: "iphone", use: { ...devices["iPhone 13"] } },
    { name: "android", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 } } },
  ],
});
