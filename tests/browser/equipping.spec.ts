// Phone-sized browser tests (TF-13) for equipping and totals (sections 8 and 9):
// equipping from a category's list in two taps (NF-1), blocks that name the
// slot and what's in it (EQ-2, EQ-3), the paper doll and arcane slots (EQ-5 to
// EQ-7), over-limit alerts (EQ-8), grants on entries, titles and manual grants
// (GR-2, TI-5), the totals on the character's page with where they come from
// (GR-7 to GR-12), effects such as an immunity listed there (GR-6), the
// damage with where it comes from (GR-13), and the
// record check on the Skills page (SK-6). Each test
// signs up its own made-up player. The build uses the real reference data in
// data/: what a test needs from it, such as a class bonus, it reads from there
// and never names (TF-13).

import { expect, type Locator, type Page } from "@playwright/test";
import { addCharacter, signUp } from "../support/browser-account";
import { arcaneSlots, chartRow, firstLevelWithBonusDice, skillLevels, slotKindNames } from "../support/browser-data";
import { browserRule } from "../support/browser-rule";

/** A screen of a character's, opened from the character's page in one tap. */
async function openFromCharacter(page: Page, characterId: string, link: RegExp, heading: string): Promise<void> {
  await page.goto(`/#/characters/${characterId}`);
  const inventory = page.getByRole("navigation", { name: "Inventory" });
  await expect(inventory, "the inventory links on the character's page").toBeVisible({ timeout: 15_000 });
  await tap(inventory.getByRole("link", { name: link }), `the link to ${heading}`);
  await expect(page.getByRole("heading", { level: 1 }), `the ${heading} screen`).toHaveText(heading);
}

/** Taps a control once it's there, so one a screen doesn't have yet fails as an assertion (TF-5), not a timeout. */
async function tap(control: Locator, what: string): Promise<void> {
  await expect(control, what).toBeVisible();
  await control.click();
}

/** Adds an entry on the category screen showing; `more` fills the category's own fields. */
async function addEntry(page: Page, name: string, more?: (form: Locator) => Promise<void>): Promise<void> {
  await page.getByRole("button", { name: "Add an entry" }).click();
  const form = page.getByRole("form", { name: "New entry" });
  await expect(form, "the form for a new entry").toBeVisible();
  await form.getByLabel("Name", { exact: true }).fill(name);
  await more?.(form);
  await form.getByRole("button", { name: "Add entry" }).click();
  await expect(rowFor(page, name), `${name} in the list`).toBeVisible();
}

/** Adds armor that fits `slot` on the Armor screen showing. */
const addArmor = (page: Page, name: string, slot: string) =>
  addEntry(page, name, (form) =>
    form
      .getByLabel("Slot")
      .selectOption({ label: slot })
      .then(() => undefined),
  );

/** An entry's row in the category list showing. */
const rowFor = (page: Page, name: string) =>
  page.getByRole("main").getByRole("list").first().getByRole("listitem").filter({ hasText: name });

/** Opens an entry's page from the category list showing. */
async function openEntry(page: Page, name: string): Promise<void> {
  await rowFor(page, name).getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1 }), `${name}'s page`).toHaveText(name);
}

interface NewGrantFields {
  kind: string;
  amount?: number;
  die?: string;
  slotKind?: string;
  /** Extra damage's type (GR-13). */
  damageType?: string;
  condition?: string;
}

/** Fills a grant's fields in `form` (an entry's, a title's or a manual grant's) and adds it. */
async function addGrant(form: Locator, grant: NewGrantFields, button = "Add grant"): Promise<void> {
  await expect(form, "the form to add a grant").toBeVisible();
  await form.getByLabel("Kind").selectOption({ label: grant.kind });
  if (grant.amount !== undefined) await form.getByLabel("Amount").fill(String(grant.amount));
  if (grant.die !== undefined) await form.getByLabel("Die").fill(grant.die);
  if (grant.slotKind !== undefined) await form.getByLabel("Slot kind").selectOption({ label: grant.slotKind });
  if (grant.damageType !== undefined) await form.getByLabel("Type").fill(grant.damageType);
  if (grant.condition !== undefined) await form.getByLabel("Condition").fill(grant.condition);
  await form.getByRole("button", { name: button }).click();
}

/** The totals on the character's page. */
const totalsOf = (page: Page) => page.getByRole("region", { name: "Totals" });

/** A slot on the equipment page's paper doll, by its label (e.g. "Back 2"). */
const slotRow = (page: Page, label: string) =>
  page
    .getByRole("list", { name: "Paper doll" })
    .getByRole("listitem")
    .filter({ has: page.getByText(label, { exact: true }) });

/**
 * What's in the paper doll's slots with these labels, sorted by name: EQ-5 doesn't say
 * which item of a kind shows in which numbered slot.
 */
async function inSlots(page: Page, labels: string[]): Promise<string[]> {
  const names: string[] = [];
  for (const label of labels) names.push(...(await slotRow(page, label).locator(".name").allTextContents()));
  return names.sort();
}

browserRule(
  { req: ["NF-1", "EQ-2", "EQ-4", "EQ-5", "IN-9"], m: "M4" },
  "armor is equipped in two taps from the character's page, shows in its slot, and is unequipped there",
  async ({ page }) => {
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    await openFromCharacter(page, brin, /^Armor/, "Armor");
    await addArmor(page, "Spare Cloak", "Back");

    // Two taps from the character's page (NF-1): the category, then Equip.
    await page.goto(`/#/characters/${brin}`);
    await page
      .getByRole("navigation", { name: "Inventory" })
      .getByRole("link", { name: /^Armor/ })
      .click();
    await tap(rowFor(page, "Spare Cloak").getByRole("button", { name: "Equip Spare Cloak" }), "Equip Spare Cloak");
    await expect(rowFor(page, "Spare Cloak"), "Spare Cloak's row once equipped").toContainText("Equipped");
    await expect(
      rowFor(page, "Spare Cloak").getByRole("button", { name: "Unequip Spare Cloak" }),
      "Unequip on Spare Cloak's row",
    ).toBeVisible();

    await openFromCharacter(page, brin, /^Equipment/, "Equipment");
    await expect(slotRow(page, "Back"), "Brin's Back slot").toContainText("Spare Cloak");
    await expect(slotRow(page, "Head"), "Brin's Head slot").toContainText("Empty");
    await expect(slotRow(page, "Main hand"), "Brin's Main hand").toContainText("Empty");
    await expect(slotRow(page, "Off hand"), "Brin's Off hand").toContainText("Empty");
    await tap(slotRow(page, "Back").getByRole("button", { name: "Unequip Spare Cloak" }), "Unequip Spare Cloak");
    await expect(slotRow(page, "Back"), "Brin's Back slot after unequipping").toContainText("Empty");
    await expect(slotRow(page, "Back"), "Brin's Back slot after unequipping").not.toContainText("Spare Cloak");

    // Equipping and unequipping aren't recorded in the history (EQ-4).
    await openFromCharacter(page, brin, /^History/, "History");
    await expect(
      page.getByRole("list", { name: "History records" }).getByRole("listitem"),
      "Brin's history after equipping and unequipping",
    ).toHaveText([/Acquired 1 × Spare Cloak/]);
  },
);

browserRule(
  { req: ["EQ-2", "EQ-3"], m: "M4" },
  "a blocked equip names the slot and what's in it, and changes nothing",
  async ({ page }) => {
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    await openFromCharacter(page, brin, /^Armor/, "Armor");
    await addArmor(page, "Spare Cloak", "Back");
    await addArmor(page, "Moth Cloak", "Back");
    await tap(rowFor(page, "Spare Cloak").getByRole("button", { name: "Equip Spare Cloak" }), "Equip Spare Cloak");
    await expect(rowFor(page, "Spare Cloak"), "Spare Cloak once equipped").toContainText("Equipped");
    await tap(rowFor(page, "Moth Cloak").getByRole("button", { name: "Equip Moth Cloak" }), "Equip Moth Cloak");
    await expect(page.getByRole("alert"), "the block for a second cloak").toHaveText(
      "Back is full: Spare Cloak is in it.",
    );
    await expect(rowFor(page, "Moth Cloak"), "Moth Cloak after the block").not.toContainText("Equipped");

    // EQ-3: one-handed weapons take a hand each; a two-handed one needs both free.
    await openFromCharacter(page, brin, /^Weapons/, "Weapons");
    await addEntry(page, "Dagger");
    await addEntry(page, "Hand Axe");
    await addEntry(page, "Greatsword", (form) =>
      form
        .getByLabel("Hands")
        .selectOption({ label: "Two-handed" })
        .then(() => undefined),
    );
    await tap(rowFor(page, "Dagger").getByRole("button", { name: "Equip Dagger" }), "Equip Dagger");
    await expect(rowFor(page, "Dagger"), "Dagger once equipped").toContainText("Equipped");
    await tap(rowFor(page, "Hand Axe").getByRole("button", { name: "Equip Hand Axe" }), "Equip Hand Axe");
    await expect(rowFor(page, "Hand Axe"), "Hand Axe once equipped").toContainText("Equipped");
    await tap(rowFor(page, "Greatsword").getByRole("button", { name: "Equip Greatsword" }), "Equip Greatsword");
    await expect(page.getByRole("alert"), "the block for a two-handed weapon").toHaveText(
      "Greatsword needs both hands free: Dagger and Hand Axe are in the Main hand and the Off hand.",
    );
    await expect(rowFor(page, "Greatsword"), "Greatsword after the block").not.toContainText("Equipped");

    await openFromCharacter(page, brin, /^Equipment/, "Equipment");
    await expect(slotRow(page, "Main hand"), "Brin's Main hand").toContainText("Dagger");
    await expect(slotRow(page, "Off hand"), "Brin's Off hand").toContainText("Hand Axe");
    await expect(slotRow(page, "Back"), "Brin's Back slot").toContainText("Spare Cloak");
    await expect(page.getByRole("list", { name: "Paper doll" }), "the paper doll").not.toContainText("Moth Cloak");
  },
);

browserRule(
  { req: ["GR-2", "GR-3", "GR-4", "GR-5", "GR-8", "GR-9", "GR-10", "GR-11", "GR-12"], m: "M4" },
  "a grant on armor raises CM only while it's equipped, and CM lists where it comes from, situational apart",
  async ({ page }) => {
    const row = chartRow("Warrior", 8);
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    await openFromCharacter(page, brin, /^Armor/, "Armor");
    await addArmor(page, "Wanderer's Mail", "Chest");
    await openEntry(page, "Wanderer's Mail");
    const form = page.getByRole("form", { name: "Add a grant" });
    await addGrant(form, { kind: "CM", amount: 2 });
    await expect(page.getByRole("list", { name: "Grants" }).getByRole("listitem"), "the mail's grants").toHaveText([
      /CM \+2/,
    ]);
    await addGrant(form, { kind: "CM", amount: 3, condition: "vs Undead" });
    await addGrant(form, { kind: "Extra die", die: "1d6" });
    await expect(page.getByRole("list", { name: "Grants" }).getByRole("listitem"), "the mail's grants").toHaveText([
      /CM \+2/,
      /CM \+3 \(vs Undead\)/,
      /Extra die 1d6/,
    ]);

    // GR-3: an entry's grants count only while it's equipped.
    await page.goto(`/#/characters/${brin}`);
    const totals = totalsOf(page);
    await expect(
      totals.getByText(`CM ${row.classBonus}`, { exact: true }),
      "Brin's CM, the mail unequipped",
    ).toBeVisible();

    await openFromCharacter(page, brin, /^Armor/, "Armor");
    await tap(
      rowFor(page, "Wanderer's Mail").getByRole("button", { name: "Equip Wanderer's Mail" }),
      "Equip Wanderer's Mail",
    );
    await expect(rowFor(page, "Wanderer's Mail"), "the mail once equipped").toContainText("Equipped");

    await page.goto(`/#/characters/${brin}`);
    await expect(totals.getByText(`CM ${row.classBonus + 2}`, { exact: true }), "Brin's CM, the mail on").toBeVisible();
    await expect(
      totals.getByText(`Combat Bonus ${row.classBonus}, Armor 2`, { exact: true }),
      "Brin's CM breakdown",
    ).toBeVisible();
    await expect(totals.getByText("Mitigation 0", { exact: true }), "Brin's mitigation").toBeVisible();
    await expect(totals.getByText(`Max hearts ${row.hearts}`, { exact: true }), "Brin's max hearts").toBeVisible();
    await expect(
      totals.getByText(`Combat dice ${row.dice} + 1d6 (Wanderer's Mail)`, { exact: true }),
      "Brin's combat dice",
    ).toBeVisible();

    await tap(totals.getByRole("button", { name: "Where CM comes from" }), "Where CM comes from");
    await expect(totals.getByRole("list", { name: "Grants in CM" }).getByRole("listitem"), "CM's grants").toHaveText([
      `Combat Bonus · Class bonus · +${row.classBonus}`,
      "Wanderer's Mail · Armor · +2",
    ]);
    await expect(
      totals.getByRole("list", { name: "Situational for CM" }).getByRole("listitem"),
      "CM's situational grants",
    ).toHaveText(["Wanderer's Mail · Armor · +3 · vs Undead"]);

    // GR-5: unequipping takes its grants away at once.
    await openFromCharacter(page, brin, /^Equipment/, "Equipment");
    await tap(
      slotRow(page, "Chest").getByRole("button", { name: "Unequip Wanderer's Mail" }),
      "Unequip Wanderer's Mail",
    );
    await expect(slotRow(page, "Chest"), "Brin's Chest slot after unequipping").toContainText("Empty");
    await page.goto(`/#/characters/${brin}`);
    await expect(
      totals.getByText(`CM ${row.classBonus}`, { exact: true }),
      "Brin's CM, the mail off again",
    ).toBeVisible();
    await expect(
      totals.getByText(`Combat dice ${row.dice}`, { exact: true }),
      "Brin's combat dice again",
    ).toBeVisible();
  },
);

browserRule(
  { req: ["EQ-8", "EQ-5", "IN-14", "GR-5"], m: "M4" },
  "trading the armor that gave an extra Back slot raises an alert naming it, and Back takes nothing more",
  async ({ page }) => {
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    await openFromCharacter(page, brin, /^Armor/, "Armor");
    await addArmor(page, "Wanderer's Belt", "Belt");
    await addArmor(page, "Spare Cloak", "Back");
    await addArmor(page, "Moth Cloak", "Back");
    await addArmor(page, "Dusk Cloak", "Back");
    await openEntry(page, "Wanderer's Belt");
    await addGrant(page.getByRole("form", { name: "Add a grant" }), { kind: "Slots", slotKind: "Back", amount: 1 });
    await expect(page.getByRole("list", { name: "Grants" }).getByRole("listitem"), "the belt's grants").toHaveText([
      /\+1 Back slot/,
    ]);
    await tap(page.getByRole("button", { name: "Equip", exact: true }), "Equip");
    await expect(page.getByRole("main"), "the belt's page once equipped").toContainText("Equipped in Belt");

    await openFromCharacter(page, brin, /^Armor/, "Armor");
    for (const cloak of ["Spare Cloak", "Moth Cloak"]) {
      await tap(rowFor(page, cloak).getByRole("button", { name: `Equip ${cloak}` }), `Equip ${cloak}`);
      await expect(rowFor(page, cloak), `${cloak} once equipped`).toContainText("Equipped");
    }
    await openFromCharacter(page, brin, /^Equipment/, "Equipment");
    await expect(slotRow(page, "Back 2"), "Brin's second Back slot").toContainText("from Wanderer's Belt");
    await expect
      .poll(() => inSlots(page, ["Back", "Back 2"]), "the cloaks in Brin's two Back slots")
      .toEqual(["Moth Cloak", "Spare Cloak"]);

    await openFromCharacter(page, brin, /^Armor/, "Armor");
    await openEntry(page, "Wanderer's Belt");
    const trade = page.getByRole("form", { name: "Trade or give away" });
    await trade.getByLabel("What happened").selectOption({ label: "Traded" });
    await trade.getByRole("button", { name: "Record" }).click();
    await expect(page.getByRole("heading", { level: 1 }), "the list once the belt is traded").toHaveText("Armor");

    const alert = "Back: 2 equipped, 1 allowed. The extra slot came from Wanderer's Belt, which you traded.";
    await page.goto(`/#/characters/${brin}`);
    await expect(
      page.getByRole("list", { name: "Over-limit alerts" }).getByRole("listitem"),
      "the alerts on Brin's page",
    ).toHaveText([alert]);
    // From the page already open: going to its own address again reloads it on iPhone (WebKit),
    // and after a reload the alert no longer knows its cause (EQ-8, "where known").
    await tap(
      page.getByRole("navigation", { name: "Inventory" }).getByRole("link", { name: /^Equipment/ }),
      "the link to Equipment",
    );
    await expect(page.getByRole("heading", { level: 1 }), "the Equipment screen").toHaveText("Equipment");
    await expect(
      page.getByRole("list", { name: "Over-limit alerts" }).getByRole("listitem"),
      "the alerts on Brin's equipment page",
    ).toHaveText([alert]);
    // EQ-8: the app unequips nothing itself.
    await expect
      .poll(() => inSlots(page, ["Back", "Back 2"]), "the cloaks still in Brin's Back slots, one over the limit")
      .toEqual(["Moth Cloak", "Spare Cloak"]);

    await openFromCharacter(page, brin, /^Armor/, "Armor");
    await tap(rowFor(page, "Dusk Cloak").getByRole("button", { name: "Equip Dusk Cloak" }), "Equip Dusk Cloak");
    await expect(page.getByRole("alert"), "the block while Back is over its limit").toHaveText(
      "Back: 2 equipped, 1 allowed. Unequip 1 to clear the alert.",
    );
    await tap(rowFor(page, "Moth Cloak").getByRole("button", { name: "Unequip Moth Cloak" }), "Unequip Moth Cloak");
    await expect(rowFor(page, "Moth Cloak"), "Moth Cloak once unequipped").not.toContainText("Equipped");
    await page.goto(`/#/characters/${brin}`);
    await expect(totalsOf(page), "Brin's totals, once the alert is cleared").toBeVisible();
    await expect(page.getByRole("list", { name: "Over-limit alerts" }), "the alerts once cleared").toHaveCount(0);
  },
);

browserRule(
  { req: ["EQ-5", "TI-5", "GR-2"], m: "M4" },
  "a title's extra Back slot shows on the paper doll, marked with the title",
  async ({ page }) => {
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    await page.goto("/#/titles");
    const add = page.getByRole("form", { name: "Add a title" });
    await add.getByLabel("Name").fill("Wanderer");
    await add.getByRole("button", { name: "Add title" }).click();
    const card = page.getByRole("list", { name: "Your titles" }).locator(":scope > li").filter({ hasText: "Wanderer" });
    await expect(card, "the Wanderer title").toBeVisible();
    await addGrant(card.getByRole("form", { name: "Add a grant" }), { kind: "Slots", slotKind: "Back", amount: 1 });
    await expect(card.getByRole("list", { name: "Grants" }).getByRole("listitem"), "the title's grants").toHaveText([
      /\+1 Back slot/,
    ]);

    await openFromCharacter(page, brin, /^Equipment/, "Equipment");
    await expect(slotRow(page, "Back"), "Brin's own Back slot").toContainText("Empty");
    await expect(slotRow(page, "Back 2"), "Brin's Back slot from the title").toContainText("from Title: Wanderer");
    await expect(slotRow(page, "Back 2"), "Brin's Back slot from the title").toContainText("Empty");
  },
);

browserRule(
  { req: ["GR-7", "GR-8", "GR-11"], q: ["Q12"], m: "M4" },
  "a Rogue's Stealth Bonus shows as dice and a number on the character's page, and its dice join the combat dice",
  async ({ page }) => {
    const row = firstLevelWithBonusDice("Rogue");
    await signUp(page);
    await addCharacter(page, { name: "Wren", className: "Rogue", level: row.level });
    const totals = totalsOf(page);
    await expect(
      totals.getByText(`Stealth Bonus ${row.classBonusDice} + ${row.classBonus}`, { exact: true }),
      "Wren's Stealth Bonus",
    ).toBeVisible();
    await expect(totals.getByText(`CM ${row.classBonus}`, { exact: true }), "Wren's CM").toBeVisible();
    await expect(
      totals.getByText(`Combat dice ${row.dice} + ${row.classBonusDice} (Stealth Bonus)`, { exact: true }),
      "Wren's combat dice",
    ).toBeVisible();
    // The same page, opened afresh.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 }), "Wren's page, reopened").toHaveText("Wren");
    await expect(
      totals.getByText(`Stealth Bonus ${row.classBonusDice} + ${row.classBonus}`, { exact: true }),
      "Wren's Stealth Bonus, reopened",
    ).toBeVisible();
  },
);

browserRule(
  { req: ["EQ-6", "EQ-7", "IN-5"], m: "M4" },
  "an arcane item goes in an arcane slot, counted as Arcane slots: 1 of n used; a plain item can't be equipped",
  async ({ page }) => {
    const slots = arcaneSlots("Mage", 13);
    expect(slots, "a level 13 Mage's arcane slots in data/").toBeGreaterThan(1);
    await signUp(page);
    const mira = await addCharacter(page, { name: "Mira", className: "Mage", level: 13 });
    await openFromCharacter(page, mira, /^Items/, "Items");
    await addEntry(page, "Moonlit Lantern", (form) => form.getByLabel("Arcane").check());
    await addEntry(page, "Silk Rope");
    await expect(
      rowFor(page, "Silk Rope").getByRole("button", { name: /equip/i }),
      "an Equip button on a plain item",
    ).toHaveCount(0);
    await tap(
      rowFor(page, "Moonlit Lantern").getByRole("button", { name: "Equip Moonlit Lantern" }),
      "Equip Moonlit Lantern",
    );
    await expect(rowFor(page, "Moonlit Lantern"), "the lantern once equipped").toContainText("Equipped");

    await openFromCharacter(page, mira, /^Equipment/, "Equipment");
    await expect(
      page.getByText(`Arcane slots: 1 of ${slots} used`, { exact: true }),
      "Mira's arcane slots",
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "Arcane slots" }), "what's in Mira's arcane slots").toHaveText(
      /Moonlit Lantern/,
    );
    await expect(page.getByRole("list", { name: "Paper doll" }), "the paper doll").not.toContainText("Moonlit Lantern");
  },
);

browserRule(
  { req: ["GR-2", "GR-8", "GR-12"], m: "M4" },
  "a manual grant with a reason adds to CM, listed as Other with its reason, until it's removed",
  async ({ page }) => {
    const row = chartRow("Warrior", 8);
    await signUp(page);
    await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    const form = page.getByRole("form", { name: "Add a manual grant" });
    await expect(form, "the form for a manual grant on Brin's page").toBeVisible();
    await form.getByLabel("Reason").fill("DM ruling, made-up faire");
    await addGrant(form, { kind: "CM", amount: 1 }, "Add manual grant");
    const totals = totalsOf(page);
    await expect(
      totals.getByText(`CM ${row.classBonus + 1}`, { exact: true }),
      "Brin's CM with the grant",
    ).toBeVisible();
    await tap(totals.getByRole("button", { name: "Where CM comes from" }), "Where CM comes from");
    await expect(totals.getByRole("list", { name: "Grants in CM" }).getByRole("listitem"), "CM's grants").toHaveText([
      `Combat Bonus · Class bonus · +${row.classBonus}`,
      "DM ruling, made-up faire · Other · +1",
    ]);

    const manual = page.getByRole("list", { name: "Manual grants" }).getByRole("listitem");
    await expect(manual, "Brin's manual grants").toHaveText([/DM ruling, made-up faire.*CM \+1/]);
    await tap(manual.getByRole("button", { name: "Remove" }), "Remove");
    await expect(page.getByRole("list", { name: "Manual grants" }), "Brin's manual grants once removed").toHaveCount(0);
    await expect(totals.getByText(`CM ${row.classBonus}`, { exact: true }), "Brin's CM without it").toBeVisible();
  },
);

browserRule(
  { req: ["SK-6"], m: "M4" },
  "the Skills page lists the levels where the chart gives a skill but none is recorded",
  async ({ page }) => {
    const levels = skillLevels("Warrior", 8);
    expect(levels.length, "levels up to 8 where data/ gives a Warrior a skill").toBeGreaterThan(1);
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    await openFromCharacter(page, brin, /^Skills/, "Skills");
    const missing = page.getByRole("list", { name: "Levels with no skill recorded" }).getByRole("listitem");
    await expect(missing, "Brin's levels with no skill").toHaveText(levels.map((l) => `Level ${l}: no skill recorded`));

    await page.getByRole("list", { name: "Available now" }).getByRole("button").first().click();
    const add = page.getByRole("form", { name: /^Add / });
    await add.getByLabel("How gained").selectOption({ label: "Starting" });
    await add.getByLabel("Level gained").fill(String(levels[0]));
    await add.getByRole("button", { name: "Add skill" }).click();
    await expect(page.getByRole("list", { name: "Skills taken" }).getByRole("listitem"), "Brin's skills").toHaveCount(
      1,
    );
    await expect(missing, "Brin's levels with no skill, one recorded").toHaveText(
      levels.slice(1).map((l) => `Level ${l}: no skill recorded`),
    );
  },
);

/** How many pixels the page is wider than the screen; 0 or less means no sideways scrolling. */
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

browserRule(
  { req: ["NF-1", "DOC-1"], m: "M4" },
  "the equipment page and an entry's grants fit a phone, and the equipment page links to its help page",
  async ({ page }) => {
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin".padEnd(100, "thewanderer"), className: "Warrior", level: 8 });
    await openFromCharacter(page, brin, /^Armor/, "Armor");
    const cloak = "Cloak".padEnd(100, "ofthewanderer");
    await addArmor(page, cloak, "Back");
    await openEntry(page, cloak);
    await addGrant(page.getByRole("form", { name: "Add a grant" }), {
      kind: "CM",
      amount: 2,
      condition: "vs".padEnd(100, "theundead"),
    });
    await tap(page.getByRole("button", { name: "Equip", exact: true }), "Equip");
    await expect(page.getByRole("main"), "the cloak's page once equipped").toContainText("Equipped in Back");
    expect(await overflow(page), "pixels the entry's page is wider than the screen").toBeLessThanOrEqual(0);

    await openFromCharacter(page, brin, /^Equipment/, "Equipment");
    await expect(slotRow(page, "Back"), "Brin's Back slot").toContainText("Cloak");
    expect(await overflow(page), "pixels the equipment page is wider than the screen").toBeLessThanOrEqual(0);
    await page.goto(`/#/characters/${brin}`);
    await tap(totalsOf(page).getByRole("button", { name: "Where CM comes from" }), "Where CM comes from");
    await expect(
      totalsOf(page).getByRole("list", { name: "Situational for CM" }),
      "CM's situational grants",
    ).toBeVisible();
    expect(await overflow(page), "pixels the character's page is wider than the screen").toBeLessThanOrEqual(0);

    await openFromCharacter(page, brin, /^Equipment/, "Equipment");
    await page.getByRole("link", { name: /help/i }).click();
    await expect(page.getByRole("heading", { level: 1 }), "the help page the equipment page links to").toHaveText(
      "Equipping and totals",
    );
  },
);

/** An entry's page, from its category's list on the character's page. */
async function entryFromCharacter(page: Page, characterId: string, category: RegExp, heading: string, name: string) {
  await openFromCharacter(page, characterId, category, heading);
  await openEntry(page, name);
}

/** A class bonus as GR-7 shows it: dice and a number where the chart gives dice. */
const bonusText = (row: { classBonus: number; classBonusDice?: string }) =>
  row.classBonusDice ? `${row.classBonusDice} + ${row.classBonus}` : String(row.classBonus);

browserRule(
  { req: ["GR-9", "GR-10", "GR-12", "GR-4"], m: "M4" },
  "mitigation and max hearts each list where they come from, situational apart",
  async ({ page }) => {
    const row = chartRow("Warrior", 8);
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    await openFromCharacter(page, brin, /^Armor/, "Armor");
    await addArmor(page, "Wanderer's Mail", "Chest");
    await openEntry(page, "Wanderer's Mail");
    const form = page.getByRole("form", { name: "Add a grant" });
    await addGrant(form, { kind: "Mitigation", amount: 1 });
    await addGrant(form, { kind: "Mitigation", amount: 1, condition: "vs fire" });
    await addGrant(form, { kind: "Max hearts", amount: 2 });
    await expect(page.getByRole("list", { name: "Grants" }).getByRole("listitem"), "the mail's grants").toHaveCount(3);
    await tap(page.getByRole("button", { name: "Equip", exact: true }), "Equip");
    await expect(page.getByRole("main"), "the mail once equipped").toContainText("Equipped in Chest");

    await page.goto(`/#/characters/${brin}`);
    const totals = totalsOf(page);
    await expect(totals.getByText("Mitigation 1", { exact: true }), "Brin's mitigation").toBeVisible();
    await expect(totals.getByText("Armor 1", { exact: true }), "Brin's mitigation breakdown").toBeVisible();
    await expect(totals.getByText(`Max hearts ${row.hearts + 2}`, { exact: true }), "Brin's max hearts").toBeVisible();
    await expect(
      totals.getByText(`Level chart ${row.hearts}, Armor 2`, { exact: true }),
      "Brin's max hearts breakdown",
    ).toBeVisible();

    await tap(totals.getByRole("button", { name: "Where Mitigation comes from" }), "Where Mitigation comes from");
    await expect(
      totals.getByRole("list", { name: "Grants in Mitigation" }).getByRole("listitem"),
      "mitigation's grants",
    ).toHaveText(["Wanderer's Mail · Armor · +1"]);
    await expect(
      totals.getByRole("list", { name: "Situational for Mitigation" }).getByRole("listitem"),
      "mitigation's situational grants",
    ).toHaveText(["Wanderer's Mail · Armor · +1 · vs fire"]);
    await tap(totals.getByRole("button", { name: "Where Max hearts comes from" }), "Where Max hearts comes from");
    await expect(
      totals.getByRole("list", { name: "Grants in Max hearts" }).getByRole("listitem"),
      "max hearts' grants",
    ).toHaveText([`Level chart · +${row.hearts}`, "Wanderer's Mail · Armor · +2"]);
  },
);

browserRule(
  { req: ["GR-2", "GR-3", "GR-8", "GR-11"], m: "M4" },
  "a weapon's, an arcane item's and an active ally's grants all count, each on its own line; an inactive ally's don't",
  async ({ page }) => {
    const row = chartRow("Mage", 13);
    expect(row.classBonus, "a level 13 Mage's Arcane Bonus in data/").toBeGreaterThan(0);
    expect(arcaneSlots("Mage", 13), "a level 13 Mage's arcane slots in data/").toBeGreaterThan(0);
    await signUp(page);
    const mira = await addCharacter(page, { name: "Mira", className: "Mage", level: 13 });
    await openFromCharacter(page, mira, /^Weapons/, "Weapons");
    await addEntry(page, "Duskfang");
    await openEntry(page, "Duskfang");
    await addGrant(page.getByRole("form", { name: "Add a grant" }), { kind: "CM", amount: 1 });
    await expect(page.getByRole("list", { name: "Grants" }), "Duskfang's grants").toContainText("CM +1");
    await openFromCharacter(page, mira, /^Items/, "Items");
    await addEntry(page, "Moonlit Lantern", (form) => form.getByLabel("Arcane").check());
    await openEntry(page, "Moonlit Lantern");
    await addGrant(page.getByRole("form", { name: "Add a grant" }), { kind: "CM", amount: 3 });
    await expect(page.getByRole("list", { name: "Grants" }), "the lantern's grants").toContainText("CM +3");
    await openFromCharacter(page, mira, /^Familiars/, "Familiars/Allies");
    await addEntry(page, "Shadow", (form) => form.getByLabel("Active").check());
    await openEntry(page, "Shadow");
    const form = page.getByRole("form", { name: "Add a grant" });
    await addGrant(form, { kind: "CM", amount: 2 });
    await addGrant(form, { kind: "Extra die", die: "1d4" });
    await expect(page.getByRole("list", { name: "Grants" }).getByRole("listitem"), "Shadow's grants").toHaveCount(2);

    await openFromCharacter(page, mira, /^Weapons/, "Weapons");
    await tap(rowFor(page, "Duskfang").getByRole("button", { name: "Equip Duskfang" }), "Equip Duskfang");
    await expect(rowFor(page, "Duskfang"), "Duskfang once equipped").toContainText("Equipped");
    await openFromCharacter(page, mira, /^Items/, "Items");
    await tap(rowFor(page, "Moonlit Lantern").getByRole("button", { name: "Equip Moonlit Lantern" }), "Equip");
    await expect(rowFor(page, "Moonlit Lantern"), "the lantern once equipped").toContainText("Equipped");

    await page.goto(`/#/characters/${mira}`);
    const totals = totalsOf(page);
    const bonus = `Arcane Bonus ${bonusText(row)}`;
    await expect(totals.getByText(`CM ${row.classBonus + 6}`, { exact: true }), "Mira's CM").toBeVisible();
    await expect(
      totals.getByText(`${bonus}, Weapons 1, Ally 2, Items 3`, { exact: true }),
      "Mira's CM breakdown",
    ).toBeVisible();
    await expect(
      totals.getByText(new RegExp(`^Combat dice .* \\+ 1d4 \\(Shadow\\)$`)),
      "Mira's combat dice",
    ).toBeVisible();

    // GR-3: an ally's grants count only while it's active.
    await entryFromCharacter(page, mira, /^Familiars/, "Familiars/Allies", "Shadow");
    await tap(page.getByRole("button", { name: "Edit" }), "Edit Shadow");
    const edit = page.getByRole("form", { name: "Edit Shadow" });
    await edit.getByLabel("Active").uncheck();
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit, "Shadow's edit form, closed once saved").toBeHidden();
    await page.goto(`/#/characters/${mira}`);
    await expect(
      totals.getByText(`CM ${row.classBonus + 4}`, { exact: true }),
      "Mira's CM, Shadow inactive",
    ).toBeVisible();
    await expect(
      totals.getByText(`${bonus}, Weapons 1, Items 3`, { exact: true }),
      "Mira's CM breakdown, Shadow inactive",
    ).toBeVisible();
    await expect(totals, "Mira's totals, Shadow inactive").not.toContainText("(Shadow)");
  },
);

browserRule(
  { req: ["GR-2", "GR-5", "TI-4", "TI-5"], m: "M4" },
  "removing an entry's grant or a title's grant takes it out of CM at once",
  async ({ page }) => {
    const row = chartRow("Warrior", 8);
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    await openFromCharacter(page, brin, /^Armor/, "Armor");
    await addArmor(page, "Wanderer's Mail", "Chest");
    await openEntry(page, "Wanderer's Mail");
    await addGrant(page.getByRole("form", { name: "Add a grant" }), { kind: "CM", amount: 2 });
    await tap(page.getByRole("button", { name: "Equip", exact: true }), "Equip");
    await expect(page.getByRole("main"), "the mail once equipped").toContainText("Equipped in Chest");

    await page.goto("/#/titles");
    const add = page.getByRole("form", { name: "Add a title" });
    await add.getByLabel("Name").fill("Wanderer");
    await add.getByRole("button", { name: "Add title" }).click();
    const card = page.getByRole("list", { name: "Your titles" }).locator(":scope > li").filter({ hasText: "Wanderer" });
    await addGrant(card.getByRole("form", { name: "Add a grant" }), { kind: "CM", amount: 1 });
    await expect(card.getByRole("list", { name: "Grants" }), "the title's grants").toContainText("CM +1");

    await page.goto(`/#/characters/${brin}`);
    const totals = totalsOf(page);
    await expect(totals.getByText(`CM ${row.classBonus + 3}`, { exact: true }), "Brin's CM, both grants").toBeVisible();

    await entryFromCharacter(page, brin, /^Armor/, "Armor", "Wanderer's Mail");
    await tap(page.getByRole("button", { name: "Remove CM +2" }), "Remove CM +2");
    await expect(page.getByRole("list", { name: "Grants" }), "the mail's grants once removed").toHaveCount(0);
    await page.goto(`/#/characters/${brin}`);
    await expect(
      totals.getByText(`CM ${row.classBonus + 1}`, { exact: true }),
      "Brin's CM, the title's only",
    ).toBeVisible();

    await page.goto("/#/titles");
    await tap(card.getByRole("button", { name: "Remove CM +1" }), "Remove CM +1");
    await expect(card.getByRole("list", { name: "Grants" }), "the title's grants once removed").toHaveCount(0);
    await page.goto(`/#/characters/${brin}`);
    await expect(totals.getByText(`CM ${row.classBonus}`, { exact: true }), "Brin's CM, no grants").toBeVisible();
  },
);

browserRule(
  { req: ["EQ-1", "EQ-5"], m: "M4" },
  "the paper doll lists every slot kind in the reference data, each Empty to start",
  async ({ page }) => {
    const kinds = slotKindNames();
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    await openFromCharacter(page, brin, /^Equipment/, "Equipment");
    const doll = page.getByRole("list", { name: "Paper doll" });
    await expect(doll.locator(".slot-name"), "the paper doll's slots").toHaveText(kinds);
    await expect(doll.getByRole("listitem"), "the paper doll's slots, each empty").toHaveText(
      kinds.map((k) => new RegExp(`^${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*Empty$`)),
    );
  },
);

browserRule(
  { req: ["EQ-3"], q: ["Q2"], m: "M4" },
  "a two-handed weapon fills both hands; a shield goes in the Off hand, and a second shield is blocked",
  async ({ page }) => {
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    await openFromCharacter(page, brin, /^Weapons/, "Weapons");
    await addEntry(page, "Greatsword", (form) =>
      form
        .getByLabel("Hands")
        .selectOption({ label: "Two-handed" })
        .then(() => undefined),
    );
    await tap(rowFor(page, "Greatsword").getByRole("button", { name: "Equip Greatsword" }), "Equip Greatsword");
    await expect(rowFor(page, "Greatsword"), "the greatsword once equipped").toContainText("Equipped");
    await openFromCharacter(page, brin, /^Equipment/, "Equipment");
    await expect(slotRow(page, "Main hand"), "Brin's Main hand").toContainText("Greatsword");
    await expect(slotRow(page, "Off hand"), "Brin's Off hand").toContainText("Greatsword");
    await tap(slotRow(page, "Main hand").getByRole("button", { name: "Unequip Greatsword" }), "Unequip Greatsword");
    await expect(slotRow(page, "Off hand"), "Brin's Off hand once the greatsword is off").toContainText("Empty");

    await openFromCharacter(page, brin, /^Armor/, "Armor");
    await addArmor(page, "Kite Shield", "Off hand");
    await addArmor(page, "Buckler", "Off hand");
    await tap(rowFor(page, "Kite Shield").getByRole("button", { name: "Equip Kite Shield" }), "Equip Kite Shield");
    await expect(rowFor(page, "Kite Shield"), "the shield once equipped").toContainText("Equipped");
    await tap(rowFor(page, "Buckler").getByRole("button", { name: "Equip Buckler" }), "Equip Buckler");
    await expect(page.getByRole("alert"), "the block for a second shield").toHaveText(
      "Kite Shield is already held, and a character can't hold two shields.",
    );
    await openFromCharacter(page, brin, /^Equipment/, "Equipment");
    await expect(slotRow(page, "Off hand"), "Brin's Off hand").toContainText("Kite Shield");
    await expect(slotRow(page, "Main hand"), "Brin's Main hand").toContainText("Empty");
  },
);

browserRule(
  { req: ["TI-5", "TI-2"], m: "M4" },
  "a title made one character's gives its grants to that character only",
  async ({ page }) => {
    const row = chartRow("Warrior", 8);
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    const cass = await addCharacter(page, { name: "Cass", className: "Warrior", level: 8 });
    await page.goto("/#/titles");
    const add = page.getByRole("form", { name: "Add a title" });
    await add.getByLabel("Name").fill("Wanderer");
    await add.getByLabel("Applies to").selectOption({ label: "Only Brin" });
    await add.getByRole("button", { name: "Add title" }).click();
    const card = page.getByRole("list", { name: "Your titles" }).locator(":scope > li").filter({ hasText: "Wanderer" });
    await expect(card, "the Wanderer title").toContainText("Only Brin");
    await addGrant(card.getByRole("form", { name: "Add a grant" }), { kind: "CM", amount: 1 });
    await expect(card.getByRole("list", { name: "Grants" }), "the title's grants").toContainText("CM +1");

    await page.goto(`/#/characters/${brin}`);
    await expect(totalsOf(page).getByText(`CM ${row.classBonus + 1}`, { exact: true }), "Brin's CM").toBeVisible();
    await page.goto(`/#/characters/${cass}`);
    await expect(page.getByRole("heading", { level: 1 }), "Cass's page").toHaveText("Cass");
    await expect(totalsOf(page).getByText(`CM ${row.classBonus}`, { exact: true }), "Cass's CM").toBeVisible();
  },
);

browserRule(
  { req: ["EQ-2", "EQ-3"], m: "M4" },
  "a third one-handed weapon, with both hands full, is blocked naming both hands and what's in each",
  async ({ page }) => {
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    await openFromCharacter(page, brin, /^Weapons/, "Weapons");
    for (const weapon of ["Dagger", "Hand Axe", "Shortsword"]) await addEntry(page, weapon);
    for (const weapon of ["Dagger", "Hand Axe"]) {
      await tap(rowFor(page, weapon).getByRole("button", { name: `Equip ${weapon}` }), `Equip ${weapon}`);
      await expect(rowFor(page, weapon), `${weapon} once equipped`).toContainText("Equipped");
    }
    await tap(rowFor(page, "Shortsword").getByRole("button", { name: "Equip Shortsword" }), "Equip Shortsword");
    await expect(page.getByRole("alert"), "the block with both hands full").toHaveText(
      "Both hands are full: Dagger is in the Main hand and Hand Axe in the Off hand.",
    );
    await expect(rowFor(page, "Shortsword"), "Shortsword after the block").not.toContainText("Equipped");
  },
);

browserRule(
  { req: ["EQ-2", "EQ-3", "EQ-4"], m: "M4" },
  "two daggers, one in each hand, are named as two when a third weapon finds both hands full",
  async ({ page }) => {
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    await openFromCharacter(page, brin, /^Weapons/, "Weapons");
    // EQ-4: two of the same thing are separate entries; here they share a name.
    await addEntry(page, "Dagger");
    await addEntry(page, "Shortsword");
    // The second dagger by hand: the helper's check for its row would also find the first.
    await tap(page.getByRole("button", { name: "Add an entry" }), "Add an entry");
    const form = page.getByRole("form", { name: "New entry" });
    await form.getByLabel("Name", { exact: true }).fill("Dagger");
    await form.getByLabel("Notes").fill("The second one.");
    await form.getByRole("button", { name: "Add entry" }).click();
    const daggers = rowFor(page, "Dagger");
    await expect(daggers, "Brin's two daggers").toHaveCount(2);
    for (const i of [0, 1]) {
      await tap(daggers.nth(i).getByRole("button", { name: "Equip Dagger" }), `Equip dagger ${i + 1}`);
      await expect(daggers.nth(i), `dagger ${i + 1} once equipped`).toContainText("Equipped");
    }
    await tap(rowFor(page, "Shortsword").getByRole("button", { name: "Equip Shortsword" }), "Equip Shortsword");
    await expect(page.getByRole("alert"), "the block with a dagger in each hand").toHaveText(
      "Both hands are full: Dagger is in the Main hand and Dagger in the Off hand.",
    );
  },
);

/** Fills an effect grant's fields in `form` (GR-6) and adds it. */
async function addEffect(
  form: Locator,
  effect: { effect: string; text: string; condition?: string },
  button = "Add grant",
): Promise<void> {
  await expect(form, "the form to add a grant").toBeVisible();
  await form.getByLabel("Kind").selectOption({ label: "Effect" });
  await form.getByLabel("Effect", { exact: true }).selectOption({ label: effect.effect });
  await form.getByLabel("Text").fill(effect.text);
  if (effect.condition !== undefined) await form.getByLabel("Condition").fill(effect.condition);
  await form.getByRole("button", { name: button }).click();
}

browserRule(
  { req: ["GR-6", "GR-2", "GR-3", "GR-4", "GR-5"], m: "M4" },
  "an armor's immunity and a manual CR bonus are listed on the character's page with their sources, above the notes, the armor's only while it's equipped",
  async ({ page }) => {
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8, notes: "Keeps a journal." });
    await openFromCharacter(page, brin, /^Armor/, "Armor");
    await addArmor(page, "Moth Cape", "Back");
    await openEntry(page, "Moth Cape");
    const form = page.getByRole("form", { name: "Add a grant" });
    await addEffect(form, { effect: "Immunity", text: "fall damage" });
    await expect(page.getByRole("list", { name: "Grants" }).getByRole("listitem"), "the cape's grants").toHaveText([
      /Immunity: fall damage/,
    ]);
    // The form starts afresh but keeps what was chosen, for the next one.
    await expect(form.getByLabel("Kind").locator("option:checked"), "the kind after adding").toHaveText("Effect");
    await expect(
      form.getByLabel("Effect", { exact: true }).locator("option:checked"),
      "the effect after adding",
    ).toHaveText("Immunity");
    await expect(form.getByLabel("Text"), "the text after adding").toHaveValue("");
    await addEffect(form, { effect: "Resistance", text: "fire", condition: "1/day" });
    await expect(page.getByRole("list", { name: "Grants" }).getByRole("listitem"), "the cape's grants").toHaveText([
      /Immunity: fall damage/,
      /Resistance: fire \(1\/day\)/,
    ]);

    // GR-3: the cape isn't equipped, so its effects aren't listed.
    await page.goto(`/#/characters/${brin}`);
    await expect(totalsOf(page), "Brin's totals").toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("region", { name: "Effects" }), "Brin's effects, the cape unequipped").toHaveCount(0);

    // A manual grant's effect always counts, with its reason as its source.
    const manualForm = page.getByRole("form", { name: "Add a manual grant" });
    await manualForm.getByLabel("Reason").fill("DM ruling, made-up faire");
    await addEffect(manualForm, { effect: "CR bonus", text: "+1 vs Undead" }, "Add manual grant");
    const effects = page.getByRole("region", { name: "Effects" }).getByRole("listitem");
    await expect(effects, "Brin's effects with the manual grant").toHaveText([
      "CR bonus: +1 vs Undead · Manual grant: DM ruling, made-up faire",
    ]);

    await openFromCharacter(page, brin, /^Armor/, "Armor");
    await tap(rowFor(page, "Moth Cape").getByRole("button", { name: "Equip Moth Cape" }), "Equip Moth Cape");
    await expect(rowFor(page, "Moth Cape"), "the cape once equipped").toContainText("Equipped");
    await page.goto(`/#/characters/${brin}`);
    await expect(effects, "Brin's effects, the cape on").toHaveText([
      "Immunity: fall damage · Moth Cape",
      "Resistance: fire (1/day) · Moth Cape",
      "CR bonus: +1 vs Undead · Manual grant: DM ruling, made-up faire",
    ]);
    // Above the character's notes.
    const effectsFirst = await page
      .getByRole("region", { name: "Effects" })
      .evaluate(
        (region, notes) =>
          notes !== null && (region.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        await page.getByText("Keeps a journal.", { exact: true }).elementHandle(),
      );
    expect(effectsFirst, "Brin's effects come before Brin's notes").toBe(true);

    // GR-5: unequipping takes the cape's effects away at once.
    await openFromCharacter(page, brin, /^Equipment/, "Equipment");
    await tap(slotRow(page, "Back").getByRole("button", { name: "Unequip Moth Cape" }), "Unequip Moth Cape");
    await expect(slotRow(page, "Back"), "Brin's Back slot after unequipping").toContainText("Empty");
    await page.goto(`/#/characters/${brin}`);
    await expect(effects, "Brin's effects, the cape off again").toHaveText([
      "CR bonus: +1 vs Undead · Manual grant: DM ruling, made-up faire",
    ]);
  },
);

/** Checks the damage on the character's page showing (GR-13): its total, its lines and the situational ones. */
async function expectDamage(
  page: Page,
  who: string,
  damage: { total: string; lines: string[]; situational: string[] },
): Promise<void> {
  const totals = totalsOf(page);
  await expect(totals.getByText(`Damage ${damage.total}`, { exact: true }), `${who}'s damage`).toBeVisible();
  await expect(
    totals.getByRole("list", { name: "Damage", exact: true }).getByRole("listitem"),
    `where ${who}'s damage comes from`,
  ).toHaveText(damage.lines);
  await expect(
    totals.getByRole("list", { name: "Situational for Damage" }).getByRole("listitem"),
    `${who}'s situational damage`,
  ).toHaveText(damage.situational);
}

/** Opens a character's page and waits for its totals, so a list that's absent is really absent. */
async function openCharacter(page: Page, characterId: string, name: string): Promise<void> {
  await page.goto(`/#/characters/${characterId}`);
  await expect(page.getByRole("heading", { level: 1 }), `${name}'s page`).toHaveText(name);
  await expect(totalsOf(page), `${name}'s totals`).toBeVisible({ timeout: 15_000 });
}

browserRule(
  { req: ["GR-13", "GR-1", "GR-4", "GR-5", "TI-4", "TI-5"], m: "M4" },
  "a title's extra damage adds to its character's damage with its amount, type and source, a situational one apart, and goes when the title moves or is removed",
  async ({ page }) => {
    const row = chartRow("Warrior", 8);
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    const cass = await addCharacter(page, { name: "Cass", className: "Warrior", level: 8 });
    await page.goto("/#/titles");
    const add = page.getByRole("form", { name: "Add a title" });
    await add.getByLabel("Name").fill("Ember Mark");
    await add.getByLabel("Applies to").selectOption({ label: "Only Brin" });
    await add.getByRole("button", { name: "Add title" }).click();
    const card = page
      .getByRole("list", { name: "Your titles" })
      .locator(":scope > li")
      .filter({ hasText: "Ember Mark" });
    await expect(card, "the Ember Mark title").toContainText("Only Brin");
    const form = card.getByRole("form", { name: "Add a grant" });
    await addGrant(form, { kind: "Extra damage", amount: 1, damageType: "fire" });
    await expect(card.getByRole("list", { name: "Grants" }).getByRole("listitem"), "the title's grants").toHaveText([
      /Extra damage \+1 heart fire/,
    ]);
    // The form starts afresh but keeps the kind, with no type left over.
    await expect(form.getByLabel("Kind").locator("option:checked"), "the kind after adding").toHaveText("Extra damage");
    await expect(form.getByLabel("Type"), "the type after adding").toHaveValue("");
    await addGrant(form, { kind: "Extra damage", amount: 2, condition: "vs Undead" });
    await expect(card.getByRole("list", { name: "Grants" }).getByRole("listitem"), "the title's grants").toHaveText([
      /Extra damage \+1 heart fire/,
      /Extra damage \+2 hearts \(vs Undead\)/,
    ]);

    const fromTitle = {
      total: "2 hearts",
      lines: ["base 1", "+1 heart fire (Title: Ember Mark)"],
      situational: ["+2 hearts (Title: Ember Mark, vs Undead)"],
    };
    const baseOnly = { total: "1 heart", lines: ["base 1"], situational: [] };
    await openCharacter(page, brin, "Brin");
    await expectDamage(page, "Brin", fromTitle);
    // Extra damage adds only to the damage: Brin's other totals are the chart's alone.
    const totals = totalsOf(page);
    await expect(totals.getByText(`CM ${row.classBonus}`, { exact: true }), "Brin's CM").toBeVisible();
    await expect(totals.getByText(`Max hearts ${row.hearts}`, { exact: true }), "Brin's max hearts").toBeVisible();
    await expect(totals.getByText(`Combat dice ${row.dice}`, { exact: true }), "Brin's combat dice").toBeVisible();
    await openCharacter(page, cass, "Cass");
    await expectDamage(page, "Cass", baseOnly);

    // TI-4: moving the title to Cass moves its extra damage with it.
    await page.goto("/#/titles");
    await tap(card.getByRole("button", { name: "Edit" }), "Edit Ember Mark");
    const edit = card.getByRole("form", { name: "Edit Ember Mark" });
    await edit.getByLabel("Applies to").selectOption({ label: "Only Cass" });
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(card, "the Ember Mark title once moved").toContainText("Only Cass");
    await openCharacter(page, brin, "Brin");
    await expectDamage(page, "Brin, the title moved", baseOnly);
    await openCharacter(page, cass, "Cass");
    await expectDamage(page, "Cass, the title moved", fromTitle);

    // GR-5: removing the title takes its extra damage away at once.
    await page.goto("/#/titles");
    await tap(card.getByRole("button", { name: "Remove", exact: true }), "Remove Ember Mark");
    await expect(page.getByRole("list", { name: "Your titles" }), "the titles once removed").toHaveCount(0);
    await openCharacter(page, cass, "Cass");
    await expectDamage(page, "Cass, the title removed", baseOnly);
  },
);
