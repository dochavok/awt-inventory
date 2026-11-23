// Phone-sized browser tests (TF-13) for what only a browser can show: the app
// on a phone screen (NF-1), on the home screen (NF-2), the terms and privacy
// pages at sign-up (AC-4, PV-4), the help pages offline (DOC-1), and a new
// version published while the app is open (NF-14).
// Runs as iPhone (Safari) and Android (Chrome, 360 pixels wide).

import { closeSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
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
    // The app has been opened with signal and has stored itself on the phone (DOC-1).
    expect(
      await page.evaluate(async () => (await navigator.serviceWorker.ready).active !== null),
      "the app stored on the phone",
    ).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: /getting started/i }), "the same help page offline").toBeVisible();
  },
);

/** The service worker of the build the tests run against: changing it publishes a new version (NF-14). */
const SERVICE_WORKER = new URL("../../dist/sw.js", import.meta.url);
const LOCK = new URL("../../dist/new-version-test.lock", import.meta.url);
// Each one different, since a page may have loaded while another test's new version was published.
const NEW_VERSION = "\n// A new version, published by an NF-14 browser test: ";
// Below the 30 s a test may take, so a test kept waiting says why. One usually holds it for seconds.
const NEW_VERSION_WAIT_MS = 20_000;
// Longer than any test may run, so an older lock was left behind.
const STALE_LOCK_MS = 60_000;

/** The app opened before on this phone: stored, and running this page. */
async function openStored(page: Page) {
  const signIn = page.getByRole("heading", { name: /sign in/i });
  await page.goto("/");
  await expect(signIn, "the sign-in heading").toBeVisible();
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.ready).active !== null),
    "the app stored on the phone",
  ).toBe(true);
  await page.reload();
  await expect(signIn, "the sign-in heading, opened again").toBeVisible();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null), "the page run by the stored app").toBe(
    true,
  );
}

/** Marks the page, so a test can tell whether it has reloaded since. */
async function markLoaded(page: Page) {
  await page.evaluate(() => Object.assign(window, { loadedBefore: true }));
  return () => page.evaluate(() => (window as { loadedBefore?: boolean }).loadedBefore === true);
}

/**
 * Runs `body` with the build to itself: `publish()` publishes a new version of
 * the app, and the build is put back afterwards. One test at a time, since both
 * phones run against the same build; a test opens its pages inside, so no other
 * test's new version reaches them first.
 */
async function withNewVersion(body: (publish: () => void) => Promise<void>): Promise<void> {
  for (let waited = 0; ; waited += 100) {
    try {
      closeSync(openSync(LOCK, "wx"));
      break;
    } catch (error) {
      // Left by a test that was stopped before it could put the build back.
      const taken = statSync(LOCK, { throwIfNoEntry: false })?.mtimeMs;
      if (taken !== undefined && Date.now() - taken > STALE_LOCK_MS) {
        rmSync(LOCK, { force: true });
        continue;
      }
      if (waited > NEW_VERSION_WAIT_MS) {
        throw new Error(`Another test held ${LOCK.pathname} too long`, { cause: error });
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  const published = readFileSync(SERVICE_WORKER, "utf8").split(NEW_VERSION)[0]!;
  try {
    replaceServiceWorker(published);
    await body(() => replaceServiceWorker(`${published}${NEW_VERSION}${Date.now()}-${Math.random()}\n`));
  } finally {
    replaceServiceWorker(published);
    rmSync(LOCK, { force: true });
  }
}

/** Replaces the build's service worker in one step, so tests in other files never load half of one. */
function replaceServiceWorker(text: string) {
  const next = new URL("../../dist/sw.js.next", import.meta.url);
  writeFileSync(next, text);
  renameSync(next, SERVICE_WORKER);
}

/**
 * NF-14 on the sign-in screen: a new version is published while the app is open,
 * and the app is brought back from the background. `openedBefore`: the app was
 * already stored on the phone when this page loaded, as for most players.
 */
async function newVersionOffered(page: Page, openedBefore: boolean) {
  const signIn = page.getByRole("heading", { name: /sign in/i });
  const waitingVersion = () =>
    page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting != null);
  const bar = page.getByRole("status", { name: "New version" });

  await withNewVersion(async (publish) => {
    if (openedBefore) await openStored(page);
    else {
      await page.goto("/");
      await expect(signIn, "the sign-in heading").toBeVisible();
      expect(
        await page.evaluate(async () => (await navigator.serviceWorker.ready).active !== null),
        "the app stored on the phone",
      ).toBe(true);
    }
    await page.getByLabel("Email").fill("half-typed@example.test");
    const loadedBefore = await markLoaded(page);
    await expect(bar, "the new-version bar before there is a new version").toBeHidden();

    publish();
    // The app is brought back from the background.
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(bar, "the new-version bar").toContainText("A new version is ready", { timeout: 15_000 });
    expect(await waitingVersion(), "the new version stored on the phone, waiting").toBe(true);

    // NF-14: it never reloads by itself, so nothing being typed is lost.
    await page.waitForTimeout(2_000);
    expect(await loadedBefore(), "the page still the one loaded before the new version").toBe(true);
    await expect(page.getByLabel("Email"), "what was typed").toHaveValue("half-typed@example.test");
    expect(await waitingVersion(), "the new version still waiting").toBe(true);

    const reloaded = page.waitForEvent("load", { timeout: 15_000 });
    await bar.getByRole("button", { name: "Reload" }).click();
    await reloaded;
    expect(await loadedBefore(), "the page loaded before the new version, after Reload").toBe(false);
    await expect(signIn, "the sign-in heading after Reload").toBeVisible();
    // The version that was waiting is the one running now.
    expect(await waitingVersion(), "a version still waiting after Reload").toBe(false);
    await expect(bar, "the new-version bar after Reload").toBeHidden();
  });
}

browserRule(
  { req: ["NF-14"], m: "M4" },
  "a new version published while the app is open is offered when the app is brought back; the app never reloads by itself, and Reload switches to it",
  async ({ page }) => newVersionOffered(page, true),
);

browserRule(
  { req: ["NF-14"], m: "M4" },
  "on the very first visit too, a new version is offered, and Reload switches to it",
  async ({ page }) => newVersionOffered(page, false),
);

browserRule(
  { req: ["NF-14"], m: "M4" },
  "a new version published while the app was closed is offered when the app is opened again",
  async ({ page }) => {
    const bar = page.getByRole("status", { name: "New version" });
    await withNewVersion(async (publish) => {
      await openStored(page);
      publish();
      await page.reload();
      await expect(page.getByRole("heading", { name: /sign in/i }), "the sign-in heading, opened").toBeVisible();
      await expect(bar, "the new-version bar").toContainText("A new version is ready", { timeout: 15_000 });
    });
  },
);

/**
 * Stops the app with an error while drawing the screen, as a broken release
 * would: one of its state updates throws.
 */
async function crashApp(page: Page) {
  await page.evaluate(() => {
    type Fiber = { child: Fiber | null; sibling: Fiber | null; memoizedState: unknown };
    type Hook = { queue?: { dispatch?: (update: () => never) => void } | null; next: Hook | null };
    const root = document.getElementById("root") as unknown as Record<string, { current?: Fiber } & Fiber>;
    const key = Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
    if (!key) throw new Error("No React root on the page");
    const stack: (Fiber | null)[] = [root[key]!];
    while (stack.length > 0) {
      const fiber = stack.pop();
      if (!fiber) continue;
      for (let hook = fiber.memoizedState as Hook | null; hook && typeof hook === "object"; hook = hook.next) {
        const dispatch = hook.queue?.dispatch;
        if (typeof dispatch === "function") {
          dispatch(() => {
            throw new Error("A broken release (NF-14 browser test)");
          });
          return;
        }
      }
      stack.push(fiber.sibling, fiber.child);
    }
    throw new Error("No state to break in the app");
  });
}

browserRule(
  { req: ["NF-14"], m: "M4" },
  "when the app has stopped with an error, a new version takes over by itself as soon as it's found",
  async ({ page }) => {
    const signIn = page.getByRole("heading", { name: /sign in/i });
    await withNewVersion(async (publish) => {
      await openStored(page);
      const loadedBefore = await markLoaded(page);
      await crashApp(page);
      await expect(signIn, "the sign-in heading, once the app has stopped").toBeHidden();

      publish();
      const reloaded = page.waitForEvent("load", { timeout: 15_000 });
      // The app is brought back from the background, so it looks for a new version.
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await reloaded;
      expect(await loadedBefore(), "the stopped page, after the new version took over").toBe(false);
      await expect(signIn, "the sign-in heading, in the new version").toBeVisible();
      expect(
        await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting != null),
        "a version still waiting",
      ).toBe(false);
    });
  },
);

browserRule(
  { req: ["NF-14"], m: "M4" },
  "where the browser can't store the app (no service workers), the app still opens, with no new-version bar",
  async ({ page }) => {
    // As in a private window, or a page not served over https.
    await page.addInitScript(() => {
      delete (Navigator.prototype as { serviceWorker?: unknown }).serviceWorker;
    });
    await page.goto("/");
    expect(await page.evaluate(() => "serviceWorker" in navigator), "service workers in this browser").toBe(false);
    await expect(page.getByRole("heading", { name: /sign in/i }), "the sign-in heading").toBeVisible();
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(1_000);
    await expect(page.getByRole("status", { name: "New version" }), "the new-version bar").toBeHidden();
  },
);

browserRule(
  { req: ["NF-14"], m: "M4" },
  "with the app open twice, Reload in one leaves the other alone, and its own Reload then works",
  async ({ page, context }) => {
    const bar = (p: Page) => p.getByRole("status", { name: "New version" });

    await withNewVersion(async (publish) => {
      await openStored(page);
      const other = await context.newPage();
      await other.goto("/");
      await expect(other.getByRole("heading", { name: /sign in/i }), "the sign-in heading, open twice").toBeVisible();
      const otherLoadedBefore = await markLoaded(other);

      publish();
      for (const p of [page, other]) {
        await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
        await expect(bar(p), "the new-version bar").toContainText("A new version is ready", { timeout: 15_000 });
      }
      const reloaded = page.waitForEvent("load", { timeout: 15_000 });
      await bar(page).getByRole("button", { name: "Reload" }).click();
      await reloaded;

      // NF-14: the other one never reloads by itself.
      await other.waitForTimeout(2_000);
      expect(await otherLoadedBefore(), "the other page, still the one loaded before").toBe(true);
      await expect(bar(other), "the other page's new-version bar").toBeVisible();

      const otherReloaded = other.waitForEvent("load", { timeout: 15_000 });
      await bar(other).getByRole("button", { name: "Reload" }).click();
      await otherReloaded;
      expect(await otherLoadedBefore(), "the other page, after its own Reload").toBe(false);
      await expect(bar(other), "the other page's new-version bar after its Reload").toBeHidden();
    });
  },
);
