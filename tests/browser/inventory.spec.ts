// Phone-sized browser tests (TF-13) for a character's inventory: adding,
// using, restoring, trading, editing and deleting entries (IN), skills from the
// list (SK), the history and its filters (HI), and reports to the maintainer
// (SP-1). Each test signs up its own made-up player. The skills come from the
// real skill list in data/, which the build uses: the tests read the skills
// they need from it and never name one (TF-13).

import { readFileSync } from "node:fs";
import { expect, type Locator, type Page } from "@playwright/test";
import { parse } from "yaml";
import { browserRule } from "../support/browser-rule";
import { addCharacter, signUp } from "../support/browser-account";

/** A screen of a character's inventory, opened from the character's page in one tap. */
async function openFromCharacter(page: Page, characterId: string, link: RegExp, heading: string): Promise<void> {
  await page.goto(`/#/characters/${characterId}`);
  const inventory = page.getByRole("navigation", { name: "Inventory" });
  await expect(inventory, "the inventory links on the character's page").toBeVisible({ timeout: 15_000 });
  await inventory.getByRole("link", { name: link }).click();
  await expect(page.getByRole("heading", { level: 1 }), `the ${heading} screen`).toHaveText(heading);
}

interface ListedSkill {
  id: string;
  name: string;
  tree?: string;
  trees?: { tree: string; starting?: boolean }[];
  usage: string;
  text?: string;
  starting?: boolean;
  retired?: boolean;
}

/**
 * Two skills from the real list in data/ (TF-13), found with plain rules rather than the app's:
 * a starting skill whose trees are only for Rogues, and a skill whose trees are only for Mages
 * whose name no other skill's contains, so searching for it finds only it.
 */
function skillsFromData(): {
  rogue: { name: string; tree: string; usage: string; text?: string };
  mage: string;
} {
  const list = parse(readFileSync(new URL("../../data/skills.yaml", import.meta.url), "utf8")) as {
    trees: { id: string; name: string; classes: string[]; entryLevel?: number; retired?: boolean }[];
    skills: ListedSkill[];
  };
  const tree = (id: string) => list.trees.find((t) => t.id === id)!;
  const treesOf = (s: ListedSkill) => s.trees?.map((p) => p.tree) ?? (s.tree === undefined ? [] : [s.tree]);
  const onlyFor = (s: ListedSkill, className: string) =>
    !s.retired &&
    treesOf(s).length > 0 &&
    treesOf(s).every((id) => !tree(id).retired && tree(id).classes.join() === className);
  const rogue = list.skills.find(
    (s) =>
      onlyFor(s, "Rogue") &&
      treesOf(s).length === 1 &&
      (tree(treesOf(s)[0]!).entryLevel ?? 1) <= 3 &&
      (s.starting === true || s.trees?.[0]?.starting === true),
  );
  const mage = list.skills.find(
    (s) =>
      onlyFor(s, "Mage") && list.skills.filter((o) => o.name.toLowerCase().includes(s.name.toLowerCase())).length === 1,
  );
  if (!rogue || !mage) {
    throw new Error(
      "data/skills.yaml needs a starting skill in a tree only for Rogues (open by level 3) and a skill " +
        "in trees only for Mages whose name is in no other skill's name, for this test",
    );
  }
  return {
    rogue: { name: rogue.name, tree: tree(treesOf(rogue)[0]!).name, usage: rogue.usage, text: rogue.text },
    mage: mage.name,
  };
}

/**
 * A skill from the real list in data/ printed in several trees (RD-1), none of them retired,
 * whose name is in no other skill's name, so searching for it finds only it; with its trees'
 * names in the list's order (TF-13).
 */
function skillInSeveralTrees(): { name: string; trees: string[] } {
  const list = parse(readFileSync(new URL("../../data/skills.yaml", import.meta.url), "utf8")) as {
    trees: { id: string; name: string; retired?: boolean }[];
    skills: ListedSkill[];
  };
  const tree = (id: string) => list.trees.find((t) => t.id === id);
  const skill = list.skills.find(
    (s) =>
      !s.retired &&
      (s.trees?.length ?? 0) >= 2 &&
      s.trees!.every((p) => tree(p.tree) && !tree(p.tree)!.retired) &&
      list.skills.filter((o) => o.name.toLowerCase().includes(s.name.toLowerCase())).length === 1,
  );
  if (!skill) {
    throw new Error(
      "data/skills.yaml needs a skill in several trees, none retired, whose name is in no other skill's name, " +
        "for this test",
    );
  }
  return { name: skill.name, trees: skill.trees!.map((p) => tree(p.tree)!.name) };
}

interface NewEntryFields {
  name: string;
  quantity?: number;
  source?: string;
  link?: string;
}

/** Adds an entry on the category screen showing, with the fields every category has. */
async function addEntry(page: Page, fields: NewEntryFields, more?: (form: Locator) => Promise<void>): Promise<void> {
  await page.getByRole("button", { name: "Add an entry" }).click();
  const form = page.getByRole("form", { name: "New entry" });
  await expect(form, "the form for a new entry").toBeVisible();
  await form.getByLabel("Name", { exact: true }).fill(fields.name);
  if (fields.quantity !== undefined) await form.getByLabel("Quantity").fill(String(fields.quantity));
  if (fields.source !== undefined) await form.getByLabel("Where it came from").fill(fields.source);
  if (fields.link !== undefined) await form.getByLabel("Link").fill(fields.link);
  await more?.(form);
  await form.getByRole("button", { name: "Add entry" }).click();
  await expect(rowFor(page, fields.name), `${fields.name} in the list`).toBeVisible();
}

/** An entry's row in the category list showing. */
const rowFor = (page: Page, name: string) =>
  page.getByRole("main").getByRole("list").first().getByRole("listitem").filter({ hasText: name });

/** The history records listed on the History screen, newest first. */
const historyRecords = (page: Page) => page.getByRole("list", { name: "History records" }).getByRole("listitem");

browserRule(
  { req: ["TF-13", "IN-1", "IN-10", "IN-11", "IN-12", "NF-1", "HI-1"], m: "M3" },
  "a player adds Healing Draughts with where they came from, marks one used in two taps, and sees both in the history",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Consumables/, "Consumables");
    await addEntry(page, {
      name: "Healing Draught",
      quantity: 3,
      source: "Vendor",
      link: "https://example.test/rewards/1",
    });
    await expect(rowFor(page, "Healing Draught"), "Healing Draughts after adding 3").toContainText("× 3");

    // Two taps from the character's page (NF-1): the category, then Used.
    await page.goto(`/#/characters/${wren}`);
    await page
      .getByRole("navigation", { name: "Inventory" })
      .getByRole("link", { name: /^Consumables/ })
      .click();
    await rowFor(page, "Healing Draught").getByRole("button", { name: /used/i }).click();
    await expect(rowFor(page, "Healing Draught"), "Healing Draughts after one is used").toContainText("× 2");

    await openFromCharacter(page, wren, /^History/, "History");
    const records = historyRecords(page);
    await expect(records, "Wren's history records").toHaveCount(2);
    await expect(records.nth(0), "the newest record").toContainText("Used 1 × Healing Draught");
    await expect(records.nth(1), "the oldest record").toContainText("Acquired 3 × Healing Draught");
    await expect(records.nth(1), "where the draughts came from").toContainText("Vendor");
    await expect(records.nth(1).getByRole("link"), "the link to the rewards post").toHaveAttribute(
      "href",
      "https://example.test/rewards/1",
    );
  },
);

browserRule(
  { req: ["TF-13", "IN-13", "HI-5"], m: "M3" },
  "a use marked by mistake is restored from the history, and the history filters by event and category",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Consumables/, "Consumables");
    await addEntry(page, { name: "Smoke Pellet", quantity: 2 });
    await rowFor(page, "Smoke Pellet").getByRole("button", { name: /used/i }).click();
    await expect(rowFor(page, "Smoke Pellet"), "Smoke Pellets after one is used").toContainText("× 1");
    await openFromCharacter(page, wren, /^Weapons/, "Weapons");
    await addEntry(page, { name: "Twin Fangs" });

    await openFromCharacter(page, wren, /^History/, "History");
    const used = historyRecords(page).filter({ hasText: "Used 1 × Smoke Pellet" });
    await used.getByRole("button", { name: "Restore" }).click();
    await expect(historyRecords(page), "Wren's history after the restore").toHaveCount(4);
    // The restore sits next to the use it undoes (IN-13), below Twin Fangs, added after the use.
    await expect(historyRecords(page).nth(1), "the record above the use").toContainText("Restored 1 × Smoke Pellet");
    await expect(historyRecords(page).nth(2), "the record below the restore").toContainText("Used 1 × Smoke Pellet");
    await expect(
      historyRecords(page).filter({ hasText: "Used 1 × Smoke Pellet" }).getByRole("button", { name: "Restore" }),
      "the Restore button on a use already restored",
    ).toHaveCount(0);

    await page.getByLabel("Event").selectOption({ label: "Acquired" });
    await expect(historyRecords(page), "acquired records").toHaveText([/Twin Fangs/, /Smoke Pellet/]);
    await page.getByLabel("Category").selectOption({ label: "Weapons" });
    await expect(historyRecords(page), "acquired weapons").toHaveText([/Acquired 1 × Twin Fangs/]);
    await page.getByLabel("Event").selectOption({ label: "All events" });
    await page.getByLabel("Category").selectOption({ label: "Consumables" });
    await expect(historyRecords(page), "consumables records").toHaveCount(3);

    await openFromCharacter(page, wren, /^Consumables/, "Consumables");
    await expect(rowFor(page, "Smoke Pellet"), "Smoke Pellets after the restore").toContainText("× 2");
  },
);

browserRule(
  { req: ["TF-13", "IN-2", "IN-3", "IN-8"], m: "M3" },
  "a weapon is added with its hands, range, group and rarity, and its fields can be changed",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Weapons/, "Weapons");
    await addEntry(page, { name: "Duskfang" }, async (form) => {
      await form.getByLabel("Hands").selectOption({ label: "Two-handed" });
      await form.getByLabel("Range").selectOption({ label: "Melee" });
      await form.getByLabel("Weapon group").fill("Sword");
      // IN-3: extra damage is a grant on the weapon, not a field of its own.
      await expect(form.getByLabel(/damage/i), "a damage field on a new weapon").toHaveCount(0);
      await form.getByLabel("Rarity").selectOption({ label: "Epic" });
      await form.getByLabel("Item family").fill("Passion");
    });
    await rowFor(page, "Duskfang").getByRole("link", { name: "Duskfang" }).click();
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 }), "Duskfang's page").toHaveText("Duskfang");
    for (const detail of ["Two-handed", "Melee", "Sword", "Epic", "Passion"]) {
      await expect(main, `Duskfang's ${detail}`).toContainText(detail);
    }

    await page.getByRole("button", { name: "Edit" }).click();
    const edit = page.getByRole("form", { name: "Edit Duskfang" });
    await edit.getByLabel("Name", { exact: true }).fill("Duskfang Reforged");
    await edit.getByLabel("Hands").selectOption({ label: "One-handed" });
    await edit.getByLabel("Notes").fill("Reforged at the faire.");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(main.getByRole("heading", { level: 1 }), "the weapon's page after editing").toHaveText(
      "Duskfang Reforged",
    );
    await expect(main, "the weapon's hands after editing").toContainText("One-handed");
    await expect(main, "the weapon's notes after editing").toContainText("Reforged at the faire.");

    // Edits aren't recorded in the history (IN-8).
    await openFromCharacter(page, wren, /^History/, "History");
    await expect(historyRecords(page), "Wren's history after editing").toHaveText([/Acquired 1 × Duskfang/]);
  },
);

browserRule(
  { req: ["TF-13", "IN-14", "IN-16"], m: "M3" },
  "trading part of a stack leaves the rest, and giving the rest away keeps it in the history",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Components/, "Components");
    await addEntry(page, { name: "Moonpetal", quantity: 5 });
    const entryPage = async () => {
      await rowFor(page, "Moonpetal").getByRole("link", { name: "Moonpetal" }).click();
      await expect(page.getByRole("heading", { level: 1 }), "Moonpetal's page").toHaveText("Moonpetal");
    };
    await entryPage();
    let trade = page.getByRole("form", { name: "Trade or give away" });
    await trade.getByLabel("What happened").selectOption({ label: "Traded" });
    await trade.getByLabel("Quantity").fill("2");
    await trade.getByLabel("Who to").fill("Cass");
    await trade.getByRole("button", { name: "Record" }).click();
    await expect(page.getByRole("main"), "Moonpetal's page after trading 2").toContainText("× 3");

    trade = page.getByRole("form", { name: "Trade or give away" });
    await trade.getByLabel("What happened").selectOption({ label: "Given away" });
    await trade.getByLabel("Quantity").fill("3");
    await trade.getByRole("button", { name: "Record" }).click();
    await expect(page.getByRole("heading", { level: 1 }), "the screen once Moonpetal is gone").toHaveText("Components");
    await expect(rowFor(page, "Moonpetal"), "Moonpetal in the list once all of it is given away").toHaveCount(0);

    await openFromCharacter(page, wren, /^History/, "History");
    await expect(historyRecords(page), "Wren's history").toHaveText([
      /Gave away 3 × Moonpetal/,
      /Traded 2 × Moonpetal.*Cass/s,
      /Acquired 5 × Moonpetal/,
    ]);
  },
);

browserRule(
  { req: ["TF-13", "IN-15"], m: "M3" },
  "deleting an entry asks first, and Undo brings it back",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Items/, "Items");
    await addEntry(page, { name: "Silk Rope" });
    await rowFor(page, "Silk Rope").getByRole("link", { name: "Silk Rope" }).click();
    await page.getByRole("button", { name: "Delete entry" }).click();
    await expect(page.getByRole("heading", { level: 1 }), "Silk Rope's page while asking").toHaveText("Silk Rope");
    await page.getByRole("button", { name: "Delete for good" }).click();
    await expect(page.getByRole("heading", { level: 1 }), "the screen after deleting").toHaveText("Items");
    await expect(rowFor(page, "Silk Rope"), "Silk Rope once deleted").toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(rowFor(page, "Silk Rope"), "Silk Rope after Undo").toBeVisible();
    await openFromCharacter(page, wren, /^History/, "History");
    await expect(historyRecords(page), "Wren's history after Undo").toHaveText([/Acquired 1 × Silk Rope/]);
  },
);

browserRule(
  { req: ["TF-13", "SK-1", "SK-1a", "SK-2", "SK-3", "SK-4"], m: "M3" },
  "skills are picked from the list, available ones first; another class's skill comes with a warning; one is removed",
  async ({ page }) => {
    const { rogue, mage } = skillsFromData();
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Skills/, "Skills");
    const available = page.getByRole("list", { name: "Available now" });
    const exactly = (name: string) => ({ name, exact: true });
    await expect(available.getByRole("button", exactly(rogue.name)), `${rogue.name}, available to Wren`).toBeVisible();
    await expect(available.getByRole("button", exactly(mage)), `${mage}, not available to Wren`).toHaveCount(0);
    await available.getByRole("button", exactly(rogue.name)).click();
    let add = page.getByRole("form", { name: `Add ${rogue.name}` });
    await add.getByLabel("How gained").selectOption({ label: "Starting" });
    await add.getByLabel("Level gained").fill("1");
    await add.getByRole("button", { name: "Add skill" }).click();
    const taken = page.getByRole("list", { name: "Skills taken" }).getByRole("listitem");
    await expect(taken, "Wren's skills").toHaveCount(1);
    for (const detail of [rogue.name, rogue.tree, rogue.usage, "Starting", "level 1"]) {
      await expect(taken.first(), `Wren's skill showing ${detail}`).toContainText(detail);
    }

    await page.getByLabel("Show every tree").check();
    const others = page.getByRole("list", { name: "Other skills" });
    await expect(others.getByRole("button", exactly(mage)), `${mage}, a Mage skill, offered`).toBeVisible();
    await page.getByLabel("Search skills").fill(mage.toLowerCase());
    await expect(others.getByRole("button"), `other skills matching ${mage}`).toHaveText([mage]);
    await others.getByRole("button", exactly(mage)).click();
    add = page.getByRole("form", { name: `Add ${mage}` });
    await add.getByLabel("How gained").selectOption({ label: "Quest" });
    await add.getByLabel("Level gained").fill("3");
    await add.getByRole("button", { name: "Add skill" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /isn't open to Rogues/ }),
      "the warning for another class's skill",
    ).toContainText(mage);
    await expect(taken, "Wren's skills, the warned one included").toHaveCount(2);

    await taken.filter({ hasText: mage }).getByRole("button", { name: "Remove" }).click();
    // Removing a skill asks first, like deleting any entry (SK-4, IN-15).
    await expect(taken, "Wren's skills while asking").toHaveCount(2);
    await page.getByRole("button", { name: "Remove for good" }).click();
    await expect(taken, "Wren's skills after removing one").toHaveText([
      new RegExp(rogue.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    ]);
  },
);

browserRule({ req: ["SK-2"], m: "M2" }, "a skill taken shows its card text from the skill list", async ({ page }) => {
  const { rogue } = skillsFromData();
  expect(rogue.text, `${rogue.name}'s card text in data/`).toBeTruthy();
  await signUp(page);
  const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
  await openFromCharacter(page, wren, /^Skills/, "Skills");
  await page
    .getByRole("list", { name: "Available now" })
    .getByRole("button", { name: rogue.name, exact: true })
    .click();
  const add = page.getByRole("form", { name: `Add ${rogue.name}` });
  await add.getByLabel("How gained").selectOption({ label: "Starting" });
  await add.getByLabel("Level gained").fill("1");
  await add.getByRole("button", { name: "Add skill" }).click();
  const taken = page.getByRole("list", { name: "Skills taken" }).getByRole("listitem");
  await expect(taken, "Wren's skills").toHaveCount(1);
  await expect(taken.first(), `Wren's ${rogue.name} showing its card text`).toContainText(rogue.text!);
});

browserRule(
  { req: ["TF-13", "SK-5", "SP-1"], m: "M3" },
  "Not listed? opens the report form with missing or wrong skill chosen, and the report is sent",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Skills/, "Skills");
    await page.getByRole("link", { name: "Not listed? Tell the maintainer" }).click();
    await expect(page.getByRole("heading", { level: 1 }), "the report form").toHaveText("Send a report");
    const kind = page.getByLabel("Kind");
    await expect(kind.locator("option:checked"), "the kind chosen").toHaveText("Missing or wrong skill");
    await page.getByLabel("Subject").fill("Shadow Step is missing");
    await page.getByLabel("Message").fill("Made-up report: the list has no Shadow Step.");
    await page.getByLabel("Character").selectOption({ label: "Wren" });
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByRole("status").filter({ hasText: /report/i }), "the report sent").toContainText(
      /Report \d{8} sent/,
    );
  },
);

/** How many pixels the page is wider than the screen; 0 or less means no sideways scrolling. */
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

browserRule(
  { req: ["NF-1", "DOC-1"], m: "M3" },
  "the inventory, skills, history and report screens fit a phone, and each links to its own help page",
  async ({ page }) => {
    await signUp(page);
    const name = "Wren".padEnd(100, "thewanderer");
    const wren = await addCharacter(page, { name, className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Consumables/, "Consumables");
    await addEntry(page, { name: "Draught".padEnd(100, "ofhealing") });
    const entry = /#\/characters\/[^/]+\/entries\/([^/?#]+)$/;
    await rowFor(page, "Draught").getByRole("link").click();
    await expect(page, "the entry's address").toHaveURL(entry);
    const entryAddress = new URL(page.url()).hash;
    const screens: [string, string, RegExp, string][] = [
      ["a category", `/#/characters/${wren}/consumables`, /^Consumables$/, "The inventory"],
      ["an entry's page", `/${entryAddress}`, /^Draught/, "The inventory"],
      ["the skills screen", `/#/characters/${wren}/skills`, /^Skills$/, "Skills"],
      ["the history", `/#/characters/${wren}/history`, /^History$/, "History"],
      ["the report form", "/#/report", /^Send a report$/, "Troubleshooting"],
    ];
    for (const [what, address, heading, help] of screens) {
      await page.goto("/#/");
      await page.goto(address);
      await expect(page.getByRole("heading", { level: 1 }), `the heading on ${what}`).toHaveText(heading);
      expect(await overflow(page), `pixels ${what} is wider than the screen`).toBeLessThanOrEqual(0);
      await page.getByRole("link", { name: /help/i }).click();
      await expect(page.getByRole("heading", { level: 1 }), `the help page ${what} links to`).toHaveText(help);
    }
  },
);

browserRule({ req: ["SP-1"], m: "M3" }, "the report form opens from the account page", async ({ page }) => {
  await signUp(page);
  await page.getByRole("link", { name: "Account" }).click();
  const report = page.getByRole("link", { name: /send a report/i });
  await expect(report, "the link to the report form on the account page").toBeVisible();
  await report.click();
  await expect(page.getByRole("heading", { level: 1 }), "the report form").toHaveText("Send a report");
  await expect(page.getByLabel("Kind").locator("option:checked"), "the kind chosen").toHaveText("Bug");
});

browserRule(
  { req: ["IN-15"], m: "M3" },
  "Undo for an entry shows only on the list it was deleted from, not on another character's",
  async ({ page }) => {
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Items/, "Items");
    await addEntry(page, { name: "Silk Rope" });
    await rowFor(page, "Silk Rope").getByRole("link", { name: "Silk Rope" }).click();
    await page.getByRole("button", { name: "Delete entry" }).click();
    await page.getByRole("button", { name: "Delete for good" }).click();
    await expect(page.getByRole("button", { name: "Undo" }), "Undo on Wren's Items").toBeVisible();
    await page.goto(`/#/characters/${brin}/items`);
    await expect(page.getByRole("heading", { level: 1 }), "Brin's Items").toHaveText("Items");
    await expect(page.getByRole("main"), "Brin's Items screen").toContainText("Nothing here yet.");
    await expect(page.getByRole("button", { name: "Undo" }), "Undo on Brin's Items").toHaveCount(0);
    await page.goto(`/#/characters/${wren}/items`);
    await expect(page.getByRole("button", { name: "Undo" }), "Undo back on Wren's Items").toBeVisible();
  },
);

browserRule(
  { req: ["IN-11"], m: "M3" },
  "a source typed without raising the quantity isn't suggested later; one recorded with a gain is",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Items/, "Items");
    await addEntry(page, { name: "Silk Rope" });
    await rowFor(page, "Silk Rope").getByRole("link", { name: "Silk Rope" }).click();
    /** The sources the edit form suggests, after saving it with `source` typed and the quantity at `quantity`. */
    const saveWith = async (source: string, quantity: string) => {
      await page.getByRole("button", { name: "Edit" }).click();
      const form = page.getByRole("form", { name: "Edit Silk Rope" });
      await expect(form, "Silk Rope's edit form").toBeVisible();
      await form.getByLabel("Quantity").fill(quantity);
      await form.getByLabel("Where it came from").fill(source);
      await form.getByRole("button", { name: "Save" }).click();
      await expect(form, "the edit form, closed once saved").toBeHidden();
    };
    const suggested = async () => {
      await page.getByRole("button", { name: "Edit" }).click();
      const field = page.getByRole("form", { name: "Edit Silk Rope" }).getByLabel("Where it came from");
      // The suggestions arrive just after the form opens; the reference data's common sources
      // are always among them, so the list's first option means they're there.
      await expect(field, "the source field's suggestion list").toHaveAttribute("list", /.+/);
      const list = await field.getAttribute("list");
      const options = page.locator(`datalist[id="${list}"] option`);
      await expect(options.first(), "the source field's suggestions, once they've arrived").toBeAttached();
      const values = await options.evaluateAll((all) => all.map((o) => (o as HTMLOptionElement).value));
      await page.getByRole("button", { name: "Cancel" }).click();
      return values;
    };
    await saveWith("Odd Vendor", "1");
    expect(await suggested(), "sources suggested after an edit that gained nothing").not.toContain("Odd Vendor");
    await saveWith("Odd Vendor", "2");
    expect(await suggested(), "sources suggested after raising the quantity").toContain("Odd Vendor");
  },
);

browserRule(
  { req: ["IN-12", "HI-3"], m: "M3" },
  "used, with a date or note: the history keeps the note and the earlier day",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Consumables/, "Consumables");
    await addEntry(page, { name: "Healing Draught", quantity: 2 });
    await rowFor(page, "Healing Draught").getByRole("link", { name: "Healing Draught" }).click();
    // Two days ago, in the phone's own time, as the date field takes it and the history shows it.
    const [day, shown] = await page.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() - 2);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
      return [local, d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })];
    });
    const form = page.getByRole("form", { name: "Mark used" });
    await expect(form, "the form to mark one used with a date or note").toBeVisible();
    await form.getByLabel("Date").fill(day!);
    await form.getByLabel("Note").fill("At the gate");
    await form.getByRole("button", { name: "Mark used" }).click();
    await expect(page.getByRole("main"), "Healing Draught's page after using one").toContainText("× 1");
    await openFromCharacter(page, wren, /^History/, "History");
    const used = historyRecords(page).filter({ hasText: "Used 1 × Healing Draught" });
    await expect(used, "the use's note").toContainText("At the gate");
    await expect(used, "the use's day").toContainText(shown!);
  },
);

browserRule(
  { req: ["IN-3", "GR-13", "GR-3"], m: "M4" },
  "a weapon's extra damage is a grant that counts while it's equipped; once it's removed, the weapon is no longer named as a source of damage",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Weapons/, "Weapons");
    await addEntry(page, { name: "Hand Axe" });
    await rowFor(page, "Hand Axe").getByRole("link", { name: "Hand Axe" }).click();
    await expect(page.getByRole("heading", { level: 1 }), "Hand Axe's page").toHaveText("Hand Axe");
    const axeGrant = page.getByRole("form", { name: "Add a grant" });
    await axeGrant.getByLabel("Kind").selectOption({ label: "Extra damage" });
    await axeGrant.getByLabel("Amount").fill("2");
    await axeGrant.getByRole("button", { name: "Add grant" }).click();
    await expect(page.getByRole("list", { name: "Grants" }), "Hand Axe's grants").toContainText(
      "Extra damage +2 hearts",
    );
    await page.getByRole("button", { name: "Equip in Main hand" }).click();
    await expect(page.getByRole("main"), "Hand Axe once equipped").toContainText("Equipped in Main hand");

    // A second source: a title for all characters.
    await page.goto("/#/titles");
    const add = page.getByRole("form", { name: "Add a title" });
    await add.getByLabel("Name").fill("Ember Mark");
    await add.getByRole("button", { name: "Add title" }).click();
    const card = page
      .getByRole("list", { name: "Your titles" })
      .locator(":scope > li")
      .filter({ hasText: "Ember Mark" });
    const titleGrant = card.getByRole("form", { name: "Add a grant" });
    await titleGrant.getByLabel("Kind").selectOption({ label: "Extra damage" });
    await titleGrant.getByLabel("Amount").fill("1");
    await titleGrant.getByLabel("Type").fill("fire");
    await titleGrant.getByRole("button", { name: "Add grant" }).click();
    await expect(card.getByRole("list", { name: "Grants" }), "Ember Mark's grants").toContainText(
      "Extra damage +1 heart fire",
    );

    const totals = page.getByRole("region", { name: "Totals" });
    const damage = totals.getByRole("list", { name: "Damage" }).getByRole("listitem");
    await page.goto(`/#/characters/${wren}`);
    await expect(totals.getByText("Damage 4 hearts", { exact: true }), "Wren's damage, axe and title").toBeVisible({
      timeout: 15_000,
    });
    await expect(damage, "where Wren's damage comes from").toHaveText([
      "base 1",
      "+2 hearts (Hand Axe)",
      "+1 heart fire (Title: Ember Mark)",
    ]);

    await openFromCharacter(page, wren, /^Weapons/, "Weapons");
    await rowFor(page, "Hand Axe").getByRole("link", { name: "Hand Axe" }).click();
    await page.getByRole("button", { name: "Remove Extra damage +2 hearts" }).click();
    await expect(page.getByRole("list", { name: "Grants" }), "Hand Axe's grants once removed").toHaveCount(0);

    await page.goto(`/#/characters/${wren}`);
    await expect(totals.getByText("Damage 2 hearts", { exact: true }), "Wren's damage, the title's only").toBeVisible({
      timeout: 15_000,
    });
    await expect(damage, "where Wren's damage comes from, the axe's grant gone").toHaveText([
      "base 1",
      "+1 heart fire (Title: Ember Mark)",
    ]);
    await expect(damage.filter({ hasText: "Hand Axe" }), "a damage line naming Hand Axe").toHaveCount(0);
  },
);

browserRule(
  { req: ["IN-14", "IN-16"], m: "M3" },
  "the address of an entry that's gone says so, and points to the history",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Items/, "Items");
    await addEntry(page, { name: "Silk Rope" });
    await rowFor(page, "Silk Rope").getByRole("link", { name: "Silk Rope" }).click();
    await expect(page.getByRole("heading", { level: 1 }), "Silk Rope's page").toHaveText("Silk Rope");
    const address = new URL(page.url()).hash;
    const trade = page.getByRole("form", { name: "Trade or give away" });
    await trade.getByLabel("What happened").selectOption({ label: "Given away" });
    await trade.getByRole("button", { name: "Record" }).click();
    await expect(page.getByRole("heading", { level: 1 }), "the list once Silk Rope is given away").toHaveText("Items");
    await page.goto(`/${address}`);
    await expect(page.getByRole("heading", { level: 1 }), "Silk Rope's old address").toHaveText("Entry not found");
    await page.getByRole("main").getByRole("link", { name: "history" }).click();
    await expect(historyRecords(page), "Wren's history").toHaveText([
      /Gave away 1 × Silk Rope/,
      /Acquired 1 × Silk Rope/,
    ]);
  },
);

browserRule(
  { req: ["IN-9"], m: "M3" },
  "the character's page shows how many entries each category has",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Consumables/, "Consumables");
    await addEntry(page, { name: "Healing Draught", quantity: 3 });
    await addEntry(page, { name: "Smoke Pellet" });
    await page.goto(`/#/characters/${wren}`);
    const inventory = page.getByRole("navigation", { name: "Inventory" });
    await expect(inventory.getByRole("link", { name: /^Consumables/ }), "Wren's Consumables link").toHaveText(
      /Consumables\s*2/,
    );
    await expect(inventory.getByRole("link", { name: /^Weapons/ }), "Wren's Weapons link").toHaveText(/Weapons\s*0/);
  },
);

browserRule(
  { req: ["SK-1a", "SK-2"], m: "M2" },
  "a skill printed in several trees is offered once, and shows every tree once taken",
  async ({ page }) => {
    const skill = skillInSeveralTrees();
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    await openFromCharacter(page, brin, /^Skills/, "Skills");
    const picker = page.getByRole("region", { name: "Add a skill" });
    await picker.getByLabel("Show every tree").check();
    await picker.getByLabel("Search skills").fill(skill.name);
    const offered = picker.getByRole("button", { name: skill.name, exact: true });
    await expect(offered, `${skill.name} offered once`).toHaveCount(1);
    await offered.click();
    const add = page.getByRole("form", { name: `Add ${skill.name}` });
    await add.getByLabel("How gained").selectOption({ label: "Quest" });
    await add.getByLabel("Level gained").fill("8");
    await add.getByRole("button", { name: "Add skill" }).click();
    const taken = page.getByRole("list", { name: "Skills taken" }).getByRole("listitem");
    await expect(taken, "Brin's skills").toHaveCount(1);
    await expect(taken.first(), `${skill.name} showing every tree`).toContainText(skill.trees.join(", "));
  },
);
