// Phone-sized browser tests (TF-13) for a character's inventory: adding,
// using, restoring, trading, editing and deleting entries (IN), skills from the
// list (SK), the history and its filters (HI), and reports to the maintainer
// (SP-1). Each test signs up its own made-up player. The skills come from the
// placeholder skill list in data/ (one starting skill per class, RD-8).

import { expect, type Locator, type Page } from "@playwright/test";
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
  "a weapon is added with its hands, range, group, damage and rarity, and its fields can be changed",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Weapons/, "Weapons");
    await addEntry(page, { name: "Duskfang" }, async (form) => {
      await form.getByLabel("Hands").selectOption({ label: "Two-handed" });
      await form.getByLabel("Range").selectOption({ label: "Melee" });
      await form.getByLabel("Weapon group").fill("Sword");
      await form.getByLabel("Extra damage (hearts)").fill("1");
      await form.getByLabel("Rarity").selectOption({ label: "Epic" });
      await form.getByLabel("Item family").fill("Passion");
    });
    await rowFor(page, "Duskfang").getByRole("link", { name: "Duskfang" }).click();
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 }), "Duskfang's page").toHaveText("Duskfang");
    for (const detail of ["Two-handed", "Melee", "Sword", "Epic", "Passion"]) {
      await expect(main, `Duskfang's ${detail}`).toContainText(detail);
    }
    await expect(main, "Duskfang's extra damage").toContainText(/1 heart/);

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
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openFromCharacter(page, wren, /^Skills/, "Skills");
    const available = page.getByRole("list", { name: "Available now" });
    await expect(available.getByRole("button"), "the skills Wren can take now").toHaveText(["Placeholder Rogue skill"]);
    await available.getByRole("button", { name: "Placeholder Rogue skill" }).click();
    let add = page.getByRole("form", { name: "Add Placeholder Rogue skill" });
    await add.getByLabel("How gained").selectOption({ label: "Starting" });
    await add.getByLabel("Level gained").fill("1");
    await add.getByRole("button", { name: "Add skill" }).click();
    const taken = page.getByRole("list", { name: "Skills taken" }).getByRole("listitem");
    await expect(taken, "Wren's skills").toHaveCount(1);
    for (const detail of ["Placeholder Rogue skill", "Placeholder Rogue tree", "passive", "Starting", "level 1"]) {
      await expect(taken.first(), `Wren's skill showing ${detail}`).toContainText(detail);
    }

    await page.getByLabel("Show every tree").check();
    const others = page.getByRole("list", { name: "Other skills" });
    await expect(others.getByRole("button", { name: "Placeholder Mage skill" }), "a Mage skill offered").toBeVisible();
    await page.getByLabel("Search skills").fill("mage");
    await expect(others.getByRole("button"), "other skills matching mage").toHaveText(["Placeholder Mage skill"]);
    await others.getByRole("button", { name: "Placeholder Mage skill" }).click();
    add = page.getByRole("form", { name: "Add Placeholder Mage skill" });
    await add.getByLabel("How gained").selectOption({ label: "Quest" });
    await add.getByLabel("Level gained").fill("3");
    await add.getByRole("button", { name: "Add skill" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /isn't open to Rogues/ }),
      "the warning for another class's skill",
    ).toContainText("Placeholder Mage skill");
    await expect(taken, "Wren's skills, the warned one included").toHaveCount(2);

    await taken.filter({ hasText: "Placeholder Mage skill" }).getByRole("button", { name: "Remove" }).click();
    await expect(taken, "Wren's skills after removing one").toHaveText([/Placeholder Rogue skill/]);
  },
);

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
