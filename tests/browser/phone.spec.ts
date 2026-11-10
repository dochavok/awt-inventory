// Phone-sized browser tests (TF-13) for what only a browser can show: the app
// on a phone screen (NF-1), on the home screen (NF-2), the terms and privacy
// pages at sign-up (AC-4, PV-4), and the help pages offline (DOC-1).
// Runs as iPhone (Safari) and Android (Chrome, 360 pixels wide).

import { expect } from "@playwright/test";
import { browserRule } from "../support/browser-rule";

browserRule(
  { req: ["NF-1"], m: "M2" },
  "the sign-in page fits a phone held upright, with no sideways scrolling",
  async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /sign in/i }), "the sign-in heading").toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "pixels the sign-in page is wider than the screen").toBeLessThanOrEqual(0);
  },
);

browserRule(
  { req: ["NF-2"], m: "M2" },
  "the app has a manifest that opens it full screen with its own icon",
  async ({ page }) => {
    await page.goto("/");
    const link = page.locator('link[rel="manifest"]');
    await expect(link, "the manifest link").toHaveCount(1);
    const href = await link.getAttribute("href");
    const manifest = (await (await page.request.get(href!)).json()) as {
      name?: string;
      display?: string;
      icons?: { src: string; sizes?: string }[];
    };
    expect(manifest.display, "the manifest's display mode").toBe("standalone");
    expect(manifest.name, "the manifest's app name").toBe("AWT Inventory");
    expect(manifest.icons?.length ?? 0, "number of icons in the manifest").toBeGreaterThan(0);
  },
);

browserRule(
  { req: ["NF-2"], m: "M2" },
  "on iPhone the app explains Share, Add to Home Screen, and why",
  async ({ page }) => {
    await page.goto("/");
    const help = page.getByRole("region", { name: /add to home screen/i });
    await expect(help, "the home screen explanation").toBeVisible();
    await expect(help, "the steps to add the app").toContainText(/Share.*Add to Home Screen/s);
    await expect(help, "the reason: stored data cleared after about 7 days").toContainText(/7 days/);
  },
  { project: "iphone" },
);

browserRule(
  { req: ["AC-4"], m: "M2" },
  "sign-up shows the terms of use and can't continue until they're accepted",
  async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /create an account/i }), "the sign-up link").toBeVisible();
    await page.getByRole("link", { name: /create an account/i }).click();
    const terms = page.getByRole("region", { name: /terms of use/i });
    await expect(terms, "the terms on the sign-up page").toBeVisible();
    for (const point of [/13 and up/i, /not an official/i, /outside the app/i, /offensive/i, /as is/i, /permanent/i]) {
      await expect(terms, `the terms say ${point}`).toContainText(point);
    }
    const create = page.getByRole("button", { name: /create account/i });
    await expect(create, "Create account before the terms are accepted").toBeDisabled();
    await expect(page.getByRole("checkbox", { name: /accept the terms/i }), "the accept box").toBeVisible();
    await page.getByRole("checkbox", { name: /accept the terms/i }).check();
    await expect(create, "Create account once the terms are accepted").toBeEnabled();
  },
);

browserRule(
  { req: ["PV-4"], m: "M2" },
  "the privacy note is linked from sign-up and says what's stored, who sees it and how to delete it",
  async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /create an account/i }), "the sign-up link").toBeVisible();
    await page.getByRole("link", { name: /create an account/i }).click();
    await expect(page.getByRole("link", { name: /privacy/i }), "the privacy link on sign-up").toBeVisible();
    await page.getByRole("link", { name: /privacy/i }).click();
    const note = page.getByRole("main");
    await expect(note.getByRole("heading", { name: /privacy/i }), "the privacy heading").toBeVisible();
    await expect(note, "what the app stores").toContainText(/display name/i);
    await expect(note, "who can see it").toContainText(/only you/i);
    await expect(note, "how to delete it").toContainText(/delete your account/i);
  },
);

browserRule(
  { req: ["DOC-1"], m: "M3" },
  "the help pages open from the sign-in screen, and still open offline",
  async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /help/i }), "the help link").toBeVisible();
    await page.getByRole("link", { name: /help/i }).click();
    await expect(page.getByRole("heading", { name: /getting started/i }), "the help page for signing in").toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: /getting started/i }), "the same help page offline").toBeVisible();
  },
);
