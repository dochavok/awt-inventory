// Phone-sized browser tests (TF-13) for signing up and in, characters (CH)
// and titles (TI-1 to TI-4), each with its own made-up player, against the
// production build and the local emulators. Runs as iPhone and Android.

import { expect } from "@playwright/test";
import { browserRule } from "../support/browser-rule";
import {
  addCharacter,
  expectSignedIn,
  invite,
  madeUpPlayer,
  secondPhone,
  signIn,
  signUp,
  verifyEmail,
} from "../support/browser-account";

browserRule(
  { req: ["TF-13", "AC-1", "AC-3"], m: "M3" },
  "a new player signs up, signs out, and signs in again to their characters",
  async ({ page }) => {
    const player = await signUp(page);
    await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await page.getByRole("link", { name: "Account" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your account" }), "the account page").toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: /sign in/i }), "the sign-in screen after signing out").toBeVisible();
    await signIn(page, player);
    await expect(
      page.getByRole("list", { name: "Main characters" }).getByRole("link"),
      "the player's characters after signing in again",
    ).toHaveText([/Wren/]);
    // AC-3: a reload keeps the player signed in.
    await page.reload();
    await expectSignedIn(page);
  },
);

browserRule(
  { req: ["TF-13", "CH-1"], m: "M3" },
  "a player adds a character, and a second one with the same name in other letters is refused",
  async ({ page }) => {
    await signUp(page);
    await addCharacter(page, { name: "Aldric", className: "Warrior", level: 26, notes: "Made-up notes." });
    await expect(page.getByText(/Warrior · level 26/), "Aldric's class and level").toBeVisible();
    await expect(page.getByText("Made-up notes."), "Aldric's notes").toBeVisible();
    await page.goto("/#/characters");
    const list = page.getByRole("list", { name: "Main characters" });
    await expect(list.getByRole("listitem"), "the main list").toHaveText([/Aldric.*Warrior · level 26/s]);

    await page.getByRole("link", { name: "Add a character" }).click();
    await page.getByLabel("Name").fill("ALDRIC");
    await page.getByLabel("Class").selectOption("Mage");
    await page.getByLabel("Level").fill("2");
    await page.getByRole("button", { name: "Add character" }).click();
    await expect(page.getByRole("alert"), "the refusal of a second Aldric").toContainText(/Aldric/i);
    await expect(page.getByRole("alert"), "the refusal says the name is in use").toContainText(/already/i);
    await page.goto("/#/characters");
    await expect(list.getByRole("listitem"), "the main list after the refusal").toHaveCount(1);
  },
);

browserRule(
  { req: ["TF-13", "CH-2", "CH-3"], m: "M3" },
  "a player renames a character, changes its level and notes",
  async ({ page }) => {
    await signUp(page);
    const id = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await page.getByRole("button", { name: "Edit" }).click();
    const form = page.getByRole("form", { name: "Edit Wren" });
    await expect(form, "the edit form").toBeVisible();
    await form.getByLabel("Name").fill("Wren the Quick");
    await form.getByLabel("Level").fill("4");
    await form.getByLabel("Notes").fill("Joined the guild.");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { level: 1 }), "the character's name after saving").toHaveText(
      "Wren the Quick",
    );
    await expect(page.getByText(/Rogue · level 4/), "the level after saving").toBeVisible();
    await expect(page.getByText("Joined the guild."), "the notes after saving").toBeVisible();
    // The change is kept: reopening the character's page shows it.
    await page.goto("/#/characters");
    await page.goto(`/#/characters/${id}`);
    await expect(page.getByText(/Rogue · level 4/), "the level after reopening").toBeVisible();
  },
);

browserRule(
  { req: ["TF-13", "CH-2a"], m: "M3" },
  "correcting a class shows what it affects and needs confirming",
  async ({ page }) => {
    await signUp(page);
    await addCharacter(page, { name: "Isolde", className: "Rogue", level: 13 });
    await page.getByRole("button", { name: "Correct the class" }).click();
    const warning = page.getByRole("region", { name: "Correct the class" });
    await expect(warning, "the class-correction warning").toBeVisible();
    await warning.getByLabel("Correct the class to").selectOption("Mage");
    await expect(warning, "the warning says this isn't a normal change").toContainText(/isn't a normal change/i);
    for (const affected of ["class bonus", "combat dice", "hearts", "arcane slots", "skill trees"]) {
      await expect(warning, `the warning naming ${affected}`).toContainText(new RegExp(affected, "i"));
    }
    const confirm = warning.getByRole("button", { name: "Correct class" });
    await expect(confirm, "Correct class before confirming").toBeDisabled();
    await warning.getByRole("checkbox", { name: /fixes a mistake/i }).check();
    await confirm.click();
    await expect(page.getByText(/Mage · level 13/), "Isolde's class after the correction").toBeVisible();
  },
);

browserRule(
  { req: ["TF-13", "CH-5"], m: "M3" },
  "a retired character moves to the Retired list and can be brought back",
  async ({ page }) => {
    await signUp(page);
    await addCharacter(page, { name: "Brin", className: "Rogue", level: 8 });
    await addCharacter(page, { name: "Aldric", className: "Warrior", level: 26 });
    await page.getByRole("button", { name: "Retire" }).click();
    await expect(page.getByRole("button", { name: "Bring back" }), "Aldric's page once retired").toBeVisible();
    await page.goto("/#/characters");
    const main = page.getByRole("list", { name: "Main characters" });
    const retired = page.getByRole("list", { name: "Retired characters" });
    await expect(main.getByRole("link"), "the main list").toHaveText([/Brin/]);
    await expect(retired.getByRole("link"), "the Retired list").toHaveText([/Aldric/]);
    await retired.getByRole("link", { name: /Aldric/ }).click();
    await page.getByRole("button", { name: "Bring back" }).click();
    await expect(page.getByRole("button", { name: "Retire" }), "Aldric's page once brought back").toBeVisible();
    await page.goto("/#/characters");
    await expect(main.getByRole("link"), "the main list after bringing Aldric back").toHaveText([/Aldric/, /Brin/]);
    await expect(retired, "the Retired list, now empty").toBeHidden();
  },
);

browserRule(
  { req: ["TF-13", "CH-6"], m: "M3" },
  "a character is deleted only once its name is typed",
  async ({ page }) => {
    await signUp(page);
    await addCharacter(page, { name: "Brin", className: "Rogue", level: 8 });
    await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    const remove = page.getByRole("form", { name: "Delete this character" });
    const button = remove.getByRole("button", { name: "Delete character" });
    await expect(button, "Delete character before the name is typed").toBeDisabled();
    await remove.getByLabel(/type the character's name/i).fill("wren");
    await expect(button, "Delete character with the name in other letters").toBeDisabled();
    await remove.getByLabel(/type the character's name/i).fill("Wren");
    await button.click();
    await expectSignedIn(page);
    await expect(
      page.getByRole("list", { name: "Main characters" }).getByRole("link"),
      "the main list after deleting Wren",
    ).toHaveText([/Brin/]);
    // Wren's name is free again.
    await addCharacter(page, { name: "Wren", className: "Mage", level: 1 });
  },
);

browserRule(
  { req: ["TF-13", "TI-1", "TI-2", "TI-3", "TI-4"], m: "M3" },
  "a player adds a title, makes it one character's and back, edits it and removes it",
  async ({ page }) => {
    await signUp(page);
    const aldric = await addCharacter(page, { name: "Aldric", className: "Warrior", level: 26 });
    const brin = await addCharacter(page, { name: "Brin", className: "Rogue", level: 8 });
    await page.getByRole("link", { name: "Titles" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Titles" }), "the titles screen").toBeVisible();
    const add = page.getByRole("form", { name: "Add a title" });
    await add.getByLabel("Name").fill("Patron of the Tower");
    await add.getByLabel("Description").fill("A made-up Patreon tier.");
    await add.getByLabel("Date earned").fill("2026-06-13");
    await add.getByRole("button", { name: "Add title" }).click();
    const title = page.getByRole("listitem").filter({ hasText: "Patron of the Tower" });
    await expect(title, "the new title's description").toContainText("A made-up Patreon tier.");
    await expect(title, "the new title applies to every character").toContainText("All characters");

    // TI-2: player-level titles show on every character.
    for (const id of [aldric, brin]) {
      await page.goto(`/#/characters/${id}`);
      await expect(
        page.getByRole("region", { name: "Titles" }),
        "a player-level title on each character",
      ).toContainText("Patron of the Tower");
    }

    await page.goto("/#/titles");
    await title.getByRole("button", { name: "Edit" }).click();
    const edit = page.getByRole("form", { name: "Edit Patron of the Tower" });
    await edit.getByLabel("Name").fill("Patron of the High Tower");
    await edit.getByLabel("Applies to").selectOption({ label: "Only Aldric" });
    await edit.getByRole("button", { name: "Save" }).click();
    const edited = page.getByRole("listitem").filter({ hasText: "Patron of the High Tower" });
    await expect(edited, "the title, now Aldric's only").toContainText("Only Aldric");
    await page.goto(`/#/characters/${brin}`);
    await expect(page.getByRole("heading", { level: 1, name: "Brin" }), "Brin's page").toBeVisible();
    await expect(page.getByRole("region", { name: "Titles" }), "Brin's titles").not.toContainText("Patron");
    await page.goto(`/#/characters/${aldric}`);
    await expect(page.getByRole("region", { name: "Titles" }), "Aldric's titles").toContainText(
      "Patron of the High Tower",
    );

    await page.goto("/#/titles");
    await edited.getByRole("button", { name: "Edit" }).click();
    const editAgain = page.getByRole("form", { name: "Edit Patron of the High Tower" });
    await editAgain.getByLabel("Applies to").selectOption({ label: "All characters" });
    await editAgain.getByRole("button", { name: "Save" }).click();
    // The form's own select says "All characters" too, so wait for it to close first.
    await expect(editAgain, "the edit form once saved").toBeHidden();
    await expect(edited, "the title, back to every character").toContainText("All characters");
    await page.goto(`/#/characters/${brin}`);
    await expect(page.getByRole("heading", { level: 1, name: "Brin" }), "Brin's page").toBeVisible();
    await expect(page.getByRole("region", { name: "Titles" }), "Brin's titles, the title back").toContainText(
      "Patron of the High Tower",
    );
    await page.goto("/#/titles");

    await edited.getByRole("button", { name: "Remove" }).click();
    await expect(edited, "the removed title").toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Titles" }),
      "the titles screen after a reload",
    ).toBeVisible();
    await expect(page.getByText("Patron of the High Tower"), "the removed title after a reload").toHaveCount(0);
  },
);

/** Takes the player off the invite list (NF-13), as the maintainer would. */
async function uninvite(email: string): Promise<void> {
  const path = `projects/demo-awt-inventory/databases/(default)/documents/invites/${encodeURIComponent(email)}`;
  const response = await fetch(`http://127.0.0.1:8080/v1/${path}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer owner" },
  });
  expect(response.ok, `removing ${email}'s invite in the emulator`).toBe(true);
}

browserRule(
  { req: ["TF-13", "AC-1", "NF-13"], m: "M3" },
  "a sign-up whose invite is removed before it's verified is told sign-up isn't open, and finishes once it's back",
  async ({ page }) => {
    const player = madeUpPlayer();
    await invite(player);
    await page.goto("/#/sign-up");
    await expect(page.getByRole("heading", { name: /create an account/i }), "the sign-up screen").toBeVisible({
      timeout: 15_000,
    });
    await page.getByLabel("Display name").fill(player.displayName);
    await page.getByLabel("Email").fill(player.email);
    await page.getByLabel("Password").fill(player.password);
    await page.getByRole("checkbox", { name: /accept the terms/i }).check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expectSignedIn(page);

    await uninvite(player.email);
    await verifyEmail(player);
    const verified = page.getByRole("button", { name: /i've verified it/i });
    await expect(verified, "the button to pick up the verified email").toBeVisible();
    await verified.click();
    const refused = page.getByRole("alert").filter({ hasText: /not open yet/i });
    await expect(refused, "the refusal once the invite is gone").toBeVisible({ timeout: 10_000 });
    await expect(refused.getByRole("button", { name: "Sign out" }), "a way out of the refusal").toBeVisible();

    await invite(player);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(refused, "the refusal once the invite is back").toBeHidden({ timeout: 10_000 });
    await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await page.getByRole("link", { name: "Account" }).click();
    await expect(page.getByLabel("Display name", { exact: true }), "the display name kept from sign-up").toHaveValue(
      player.displayName,
    );
  },
);

browserRule(
  { req: ["TF-13", "AC-1", "AC-2", "AC-4"], m: "M3" },
  "an account finished on a phone that didn't sign up asks for the display name and terms again; the first phone keeps it",
  async ({ page, context }) => {
    const player = madeUpPlayer();
    await invite(player);
    await page.goto("/#/sign-up");
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

    const other = await secondPhone(context.browser()!, page);
    try {
      await signIn(other.page, player);
      const finish = other.page.getByRole("region", { name: "Finish creating your account" });
      await expect(finish, "the form to finish the account on the second phone").toBeVisible({ timeout: 10_000 });
      const button = finish.getByRole("button", { name: "Finish" });
      await finish.getByLabel("Display name").fill("Wren Elsewhere");
      await expect(button, "Finish before the terms are accepted").toBeDisabled();
      await finish.getByRole("checkbox", { name: /accept the terms/i }).check();
      await button.click();
      await expect(finish, "the form once the account is finished").toBeHidden({ timeout: 10_000 });
      await addCharacter(other.page, { name: "Wren", className: "Rogue", level: 3 });

      // The first phone kept the sign-up's display name, but the account was finished elsewhere.
      const verified = page.getByRole("button", { name: /i've verified it/i });
      await expect(verified, "the first phone's button to pick up the verified email").toBeVisible();
      await verified.click();
      await expect(verified, "the verification notice once verified").toBeHidden({ timeout: 10_000 });
      await page.getByRole("link", { name: "Account" }).click();
      await expect(page.getByLabel("Display name", { exact: true }), "the display name on the first phone").toHaveValue(
        "Wren Elsewhere",
      );
    } finally {
      await other.context.close();
    }
  },
);
