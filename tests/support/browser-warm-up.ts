// Playwright global setup (TF-13): before the browser tests run, one made-up
// player signs up through the app, so the first tests don't time out while the
// fresh build, the browser and the emulators warm up. Playwright starts the
// web server (build, preview and emulators) before this runs.
//
// A failed warm-up doesn't stop the run: the tests then show what's wrong.

import { chromium, devices, type FullConfig } from "@playwright/test";
import { signUp } from "./browser-account";

export default async function warmUp(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://127.0.0.1:4173";
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ ...devices["Pixel 7"], baseURL });
    await signUp(page);
  } catch (error) {
    console.warn(`Browser test warm-up didn't finish: ${(error as Error).message.split("\n")[0]}`);
  } finally {
    await browser.close();
  }
}
