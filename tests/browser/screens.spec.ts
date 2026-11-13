// Phone-sized browser tests (TF-13) for the signed-in screens: they fit a phone
// (NF-1), each has a help link to its page (DOC-1) with its dates (DOC-6), the
// privacy note opens from the account page (PV-4), working offline across a
// reload and the offline bar (NF-3), and how fast a character's page opens on
// slow signal (NF-4). Each test signs up its own made-up player.

import { existsSync, readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { browserRule } from "../support/browser-rule";
import { addCharacter, expectSignedIn, secondPhone, signIn, signUp } from "../support/browser-account";

/** How many pixels the page is wider than the screen; 0 or less means no sideways scrolling. */
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** The connection bar (NF-3). */
const connection = (page: Page) => page.getByRole("status", { name: "Connection" });

/** A name as long as names may be (100 characters), with no spaces to break it. */
const LONG_NAME = "Aldric".padEnd(100, "thewanderer");

browserRule(
  { req: ["NF-1"], m: "M3" },
  "every signed-in screen fits a phone held upright, with no sideways scrolling",
  async ({ page }) => {
    await signUp(page);
    expect(LONG_NAME.length, "the long name's length").toBe(100);
    const id = await addCharacter(page, { name: LONG_NAME, className: "Warrior", level: 26, notes: LONG_NAME });
    const screens: [string, string, RegExp][] = [
      ["the characters screen", "/#/characters", /your characters/i],
      ["the new character form", "/#/characters/new", /new character/i],
      ["a character's page", `/#/characters/${id}`, new RegExp(LONG_NAME)],
      ["the titles screen", "/#/titles", /^titles$/i],
      ["the account page", "/#/account", /your account/i],
      ["a help page", "/#/help/characters-and-titles", /characters and titles/i],
    ];
    for (const [what, address, heading] of screens) {
      await page.goto(address);
      await expect(page.getByRole("heading", { level: 1, name: heading }), `the heading on ${what}`).toBeVisible();
      expect(await overflow(page), `pixels ${what} is wider than the screen`).toBeLessThanOrEqual(0);
    }
  },
);

browserRule({ req: ["DOC-1"], m: "M3" }, "each main screen has a help link to its own help page", async ({ page }) => {
  await signUp(page);
  const id = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
  const screens: [string, string, string][] = [
    ["the start screen, signed in", "/#/", "Characters and titles"],
    ["the characters screen", "/#/characters", "Characters and titles"],
    ["the new character form", "/#/characters/new", "Characters and titles"],
    ["a character's page", `/#/characters/${id}`, "Characters and titles"],
    ["the titles screen", "/#/titles", "Characters and titles"],
    ["the account page", "/#/account", "Getting started"],
  ];
  for (const [what, address, title] of screens) {
    await page.goto("/#/");
    await page.goto(address);
    const help = page.getByRole("link", { name: /help/i });
    await expect(help, `the help link on ${what}`).toBeVisible();
    await help.click();
    await expect(page.getByRole("heading", { level: 1 }), `the help page ${what} links to`).toHaveText(title);
  }
});

browserRule(
  { req: ["DOC-6"], m: "M3" },
  "a help page shows when it was last updated and last reviewed",
  async ({ page }) => {
    const file = new URL("../../docs/characters-and-titles.md", import.meta.url);
    expect(existsSync(file), "docs/characters-and-titles.md exists").toBe(true);
    const source = readFileSync(file, "utf8");
    const reviewed = /^reviewed: (\d{4}-\d{2}-\d{2})$/m.exec(source)?.[1];
    expect(reviewed, "the page's reviewed date in docs/").toBeDefined();
    await page.goto("/#/help/characters-and-titles");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 }), "the help page").toHaveText("Characters and titles");
    await expect(main, "the page's reviewed date").toContainText(`Reviewed ${reviewed}`);
    await expect(main, "the page's updated date").toContainText(/Updated \d{4}-\d{2}-\d{2}/);
  },
);

browserRule({ req: ["PV-4"], m: "M3" }, "the privacy note opens from the account page", async ({ page }) => {
  await signUp(page);
  await expect(page.getByRole("link", { name: "Account" }), "the link to the account page").toBeVisible();
  await page.getByRole("link", { name: "Account" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your account" }), "the account page").toBeVisible();
  await page.getByRole("link", { name: /privacy/i }).click();
  const note = page.getByRole("main");
  await expect(note.getByRole("heading", { level: 1, name: /privacy/i }), "the privacy heading").toBeVisible();
  await expect(note, "what the app stores").toContainText(/display name/i);
  await expect(note, "who can see it").toContainText(/only you/i);
  await expect(note, "how to delete it").toContainText(/delete your account/i);
});

browserRule(
  { req: ["NF-3"], m: "M3" },
  "the app shows when it's offline and how many changes are waiting, until they're sent",
  async ({ page, context }) => {
    await signUp(page);
    await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await context.setOffline(true);
    await expect(connection(page), "the connection bar offline").toContainText(/offline/i, { timeout: 10_000 });
    await page.getByRole("button", { name: "Edit" }).click();
    const form = page.getByRole("form", { name: "Edit Wren" });
    await form.getByLabel("Notes").fill("Written without signal.");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Written without signal."), "Wren's notes, saved offline").toBeVisible();
    await expect(connection(page), "the changes waiting offline").toContainText(/1 change waiting/i, {
      timeout: 10_000,
    });
    await context.setOffline(false);
    await expect(connection(page), "the connection bar once the change is sent").toBeHidden({ timeout: 20_000 });
  },
);

browserRule(
  { req: ["NF-3", "CH-1"], m: "M3" },
  "two offline phones each add Wren: the phone that syncs second is told its Wren was refused",
  async ({ page, context }) => {
    const player = await signUp(page);
    const other = await secondPhone(context.browser()!, page);
    try {
      await signIn(other.page, player);
      await context.setOffline(true);
      await other.context.setOffline(true);
      await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
      await addCharacter(other.page, { name: "wren", className: "Mage", level: 5 });
      await context.setOffline(false);
      await expect(connection(page), "phone A once its Wren is sent").toBeHidden({ timeout: 20_000 });
      await other.context.setOffline(false);
      const told = other.page.getByRole("alert");
      await expect(told, "what phone B is told").toContainText(/refused/i, { timeout: 20_000 });
      await expect(told, "the refused character, named").toContainText("wren");
      // Undone on the phone: the screen showing it no longer does.
      await expect(
        other.page.getByRole("heading", { level: 1 }),
        "phone B's page for its refused wren, once undone",
      ).toHaveText("Character not found");
      await other.page.goto("/#/characters");
      await expect(
        other.page.getByRole("list", { name: "Main characters" }).getByRole("link"),
        "phone B's characters once its wren is undone",
      ).toHaveText([/Wren.*Rogue · level 3/s]);
    } finally {
      await other.context.close();
    }
  },
);

browserRule(
  { req: ["NF-3", "DOC-1"], m: "M3" },
  "a character added on another phone still opens after reloading the app without signal",
  async ({ page, context }) => {
    const player = await signUp(page);
    const other = await secondPhone(context.browser()!, page);
    let isolde: string;
    try {
      await signIn(other.page, player);
      isolde = await addCharacter(other.page, {
        name: "Isolde",
        className: "Mage",
        level: 13,
        notes: "Added on the other phone.",
      });
      await expect(connection(other.page), "the other phone once Isolde is sent").toBeHidden({ timeout: 20_000 });
    } finally {
      await other.context.close();
    }
    // This phone opens the app with signal, as players do before the faire, but never opens Isolde.
    await page.reload();
    await expectSignedIn(page);
    await expect(
      page.getByRole("list", { name: "Main characters" }).getByRole("link"),
      "the characters this phone sees",
    ).toHaveText([/Isolde/]);
    await context.setOffline(true);
    await page.reload();
    await expectSignedIn(page);
    // Opened at its own address, as from a bookmark or the back button.
    await page.goto(`/#/characters/${isolde}`);
    await expect(page.getByRole("heading", { level: 1 }), "Isolde's page offline").toHaveText("Isolde");
    await expect(page.getByText(/Mage · level 13/), "Isolde's class and level offline").toBeVisible();
    await expect(page.getByText("Added on the other phone."), "Isolde's notes offline").toBeVisible();
    await page.getByRole("link", { name: /help/i }).click();
    await expect(page.getByRole("heading", { level: 1 }), "the help page offline").toHaveText("Characters and titles");
  },
);

browserRule(
  { req: ["NF-3", "TI-2"], m: "M3" },
  "a title added on another phone shows on its character's page after reopening the app without signal",
  async ({ page, context }) => {
    const player = await signUp(page);
    // This phone opens the app once with its email verified, and has time to read the whole
    // account: 2 seconds after the app opens, and the reading itself.
    await page.reload();
    await expectSignedIn(page);
    await page.waitForTimeout(6_000);
    const other = await secondPhone(context.browser()!, page);
    let isolde: string;
    try {
      await signIn(other.page, player);
      isolde = await addCharacter(other.page, { name: "Isolde", className: "Mage", level: 13 });
      await other.page.goto("/#/titles");
      const add = other.page.getByRole("form", { name: "Add a title" });
      await expect(add, "the form to add a title on the other phone").toBeVisible({ timeout: 15_000 });
      await add.getByLabel("Name").fill("Hero of the Bridge");
      await add.getByLabel("Applies to").selectOption({ label: "Only Isolde" });
      await add.getByRole("button", { name: "Add title" }).click();
      await expect(other.page.getByText("Hero of the Bridge"), "the title on the other phone").toBeVisible();
      await expect(connection(other.page), "the other phone once the title is sent").toBeHidden({ timeout: 20_000 });
    } finally {
      await other.context.close();
    }
    // This phone is reopened with signal, soon after it was last opened, and never opens Isolde or the titles.
    await page.reload();
    await expectSignedIn(page);
    await page.waitForTimeout(6_000);
    await context.setOffline(true);
    await page.reload();
    await expectSignedIn(page);
    await page.goto(`/#/characters/${isolde}`);
    await expect(page.getByRole("heading", { level: 1 }), "Isolde's page offline").toHaveText("Isolde");
    await expect(
      page.getByRole("region", { name: "Titles" }).getByText("Hero of the Bridge"),
      "Isolde's title offline",
    ).toBeVisible();
  },
);

browserRule(
  { req: ["NF-4"], m: "M3" },
  "on slow mobile signal, a character's page opens within 2 seconds once the app has been opened before",
  async ({ page, context }) => {
    await signUp(page);
    const id = await addCharacter(page, { name: "Aldric", className: "Warrior", level: 26 });
    await expect(connection(page), "Aldric, sent").toBeHidden({ timeout: 20_000 });
    // The app has been opened before: it's stored on the phone.
    expect(
      await page.evaluate(async () => (await navigator.serviceWorker.ready).active !== null),
      "the app stored on the phone",
    ).toBe(true);
    await page.goto("about:blank");
    // Chrome's Slow 4G: 1.6 Mbps down, 750 kbps up, 150 ms delay.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: 1_600_000 / 8,
      uploadThroughput: 750_000 / 8,
    });
    const started = Date.now();
    await page.goto(`/#/characters/${id}`);
    await expect(page.getByRole("heading", { level: 1 }), "Aldric's page on slow signal").toHaveText("Aldric", {
      timeout: 10_000,
    });
    await expect(page.getByText(/Warrior · level 26/), "Aldric's class and level on slow signal").toBeVisible({
      timeout: 10_000,
    });
    const took = Date.now() - started;
    expect(took, "milliseconds for Aldric's page to open").toBeLessThanOrEqual(2_000);
  },
  { project: "android" },
);

browserRule(
  { req: ["DOC-1", "NF-1"], m: "M3" },
  "an address that isn't a page, even a broken one, shows a page saying so",
  async ({ page }) => {
    await page.goto("/#/help/100%");
    await expect(page.getByRole("heading", { level: 1 }), "the page for a broken help address").toHaveText(
      "Page not found",
    );
    await expect(page.getByRole("link", { name: /help/i }), "the help link, still there").toBeVisible();
  },
);

browserRule(
  { req: ["NF-3", "CH-1"], m: "M3" },
  "a refusal of one character leaves another character's page as it was, with what was being typed",
  async ({ page, context }) => {
    const player = await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    await expect(connection(page), "phone A once Brin is sent").toBeHidden({ timeout: 20_000 });
    const other = await secondPhone(context.browser()!, page);
    try {
      await signIn(other.page, player);
      // Phone B opens Brin with signal, so it's there offline.
      await other.page.goto(`/#/characters/${brin}`);
      await expect(other.page.getByRole("heading", { level: 1 }), "Brin's page on phone B").toHaveText("Brin");
      await context.setOffline(true);
      await other.context.setOffline(true);
      await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
      await addCharacter(other.page, { name: "wren", className: "Mage", level: 5 });
      await other.page.goto(`/#/characters/${brin}`);
      await expect(other.page.getByRole("heading", { level: 1 }), "Brin's page on phone B offline").toHaveText("Brin");
      await other.page.getByRole("button", { name: "Edit" }).click();
      const notes = other.page.getByRole("form", { name: "Edit Brin" }).getByLabel("Notes");
      await notes.fill("Typed while signal returns.");
      await context.setOffline(false);
      await expect(connection(page), "phone A once its Wren is sent").toBeHidden({ timeout: 20_000 });
      await other.context.setOffline(false);
      const told = other.page.getByRole("alert");
      await expect(told, "what phone B is told").toContainText(/refused/i, { timeout: 20_000 });
      await expect(told, "the refused character, named").toContainText("wren");
      await expect(notes, "Brin's notes being typed on phone B, after wren's refusal").toHaveValue(
        "Typed while signal returns.",
      );
    } finally {
      await other.context.close();
    }
  },
);

browserRule(
  { req: ["CH-1", "NF-1"], m: "M3" },
  "an address for a character that doesn't exist, even a broken one, says it isn't there",
  async ({ page }) => {
    await signUp(page);
    for (const address of ["/#/characters/no-such-character", "/#/characters/a%2Fb", "/#/characters/%E0"]) {
      await page.goto("/#/titles");
      await page.goto(address);
      await expect(page.getByRole("heading", { level: 1 }), `the page for ${address}`).toHaveText(
        "Character not found",
      );
    }
  },
);
