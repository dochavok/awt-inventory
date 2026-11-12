// Made-up players for the browser tests (TF-13): each test signs up its own,
// through the app's screens, against the local emulators only. The invite
// (NF-13) is written past the rules with the emulator's owner access, and the
// email is verified with the link the Auth emulator keeps instead of sending.
//
// Every action is guarded by expect(), so a screen that doesn't exist yet fails
// as an assertion (TF-5), never as a timeout.

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

const PROJECT_ID = "demo-awt-inventory";
const FIRESTORE = "http://127.0.0.1:8080";
const AUTH = "http://127.0.0.1:9099";

export interface Player {
  email: string;
  password: string;
  displayName: string;
}

/** A new made-up player, different in every test, so tests can run side by side. */
export function madeUpPlayer(): Player {
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return { email: `player-${tag}@example.test`, password: "made-up-password", displayName: `Player ${tag}` };
}

/** Puts the player on the invite list (NF-13), as the maintainer would. */
export async function invite(player: Player): Promise<void> {
  const path = `projects/${PROJECT_ID}/databases/(default)/documents/invites/${encodeURIComponent(player.email)}`;
  const response = await fetch(`${FIRESTORE}/v1/${path}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { addedBy: { stringValue: "maintainer" } } }),
  });
  expect(response.ok, `inviting ${player.email} in the emulator`).toBe(true);
}

/** Follows the verification link the Auth emulator kept for the player's email (AC-1). */
async function verifyEmail(player: Player): Promise<void> {
  const response = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  const { oobCodes } = (await response.json()) as {
    oobCodes: { email: string; requestType: string; oobLink: string }[];
  };
  const code = oobCodes.find((c) => c.email === player.email && c.requestType === "VERIFY_EMAIL");
  expect(code, `the verification email for ${player.email}`).toBeDefined();
  const followed = await fetch(code!.oobLink);
  expect(followed.ok, "following the verification link").toBe(true);
}

/** The screen a signed-in player lands on: their characters. */
export async function expectSignedIn(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: "Your characters" }), "the characters screen").toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Signs a new made-up player up through the app and verifies their email, so
 * they can store records. Ends on the characters screen.
 */
export async function signUp(page: Page, player = madeUpPlayer()): Promise<Player> {
  await invite(player);
  await page.goto("/#/sign-up");
  // The first test of a run waits for the emulators and the fresh build to warm up.
  await expect(page.getByRole("heading", { name: /create an account/i }), "the sign-up screen").toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel("Display name").fill(player.displayName);
  await page.getByLabel("Email").fill(player.email);
  await page.getByLabel("Password").fill(player.password);
  await page.getByRole("checkbox", { name: /accept the terms/i }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expectSignedIn(page);
  await verifyEmail(player);
  const verified = page.getByRole("button", { name: /i've verified it/i });
  await expect(verified, "the button to pick up the verified email").toBeVisible();
  await verified.click();
  await expect(verified, "the verification notice, gone once the email is verified").toBeHidden({ timeout: 10_000 });
  return player;
}

/** Signs an existing player in through the sign-in screen. */
export async function signIn(page: Page, player: Player): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /sign in/i }), "the sign-in screen").toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Email").fill(player.email);
  await page.getByLabel("Password").fill(player.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expectSignedIn(page);
}

export interface NewCharacter {
  name: string;
  className: "Warrior" | "Mage" | "Rogue";
  level: number;
  notes?: string;
}

/** Adds a character through the app and returns its ID, from its page's address. */
export async function addCharacter(page: Page, character: NewCharacter): Promise<string> {
  await page.goto("/#/characters");
  const add = page.getByRole("link", { name: "Add a character" });
  await expect(add, "the link to add a character").toBeVisible({ timeout: 15_000 });
  await add.click();
  await expect(page.getByRole("heading", { name: "New character" }), "the new character form").toBeVisible();
  await page.getByLabel("Name").fill(character.name);
  await page.getByLabel("Class").selectOption(character.className);
  await page.getByLabel("Level").fill(String(character.level));
  if (character.notes !== undefined) await page.getByLabel("Notes").fill(character.notes);
  await page.getByRole("button", { name: "Add character" }).click();
  await expect(page.getByRole("heading", { level: 1, name: character.name }), `${character.name}'s page`).toBeVisible();
  const id = /#\/characters\/([^/?#]+)$/.exec(page.url())?.[1];
  expect(id, `${character.name}'s address`).toBeDefined();
  return id!;
}

/**
 * A second phone: its own browser context, with its own storage, the same
 * screen size as `like` and the same address for the app.
 */
export async function secondPhone(browser: Browser, like: Page): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: like.viewportSize(),
    baseURL: new URL(like.url()).origin,
    isMobile: true,
    hasTouch: true,
  });
  return { context, page: await context.newPage() };
}
