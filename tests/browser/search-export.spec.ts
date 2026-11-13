// Phone-sized browser tests (TF-13) for search and export (section 10): a
// character's search and the search across all characters (SE-1, SE-2), a
// category's filters (SE-3), the printable sheet saved as a PDF (EX-1 to EX-3)
// and the JSON export (EX-4), with signal and without (NF-3); the new screens
// fit a phone (NF-1) and link to their help page (DOC-1). Each test signs up
// its own made-up player.

import { readFileSync } from "node:fs";
import { expect, type Locator, type Page } from "@playwright/test";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { browserRule } from "../support/browser-rule";
import { addCharacter, signUp } from "../support/browser-account";

/** The connection bar (NF-3). */
const connection = (page: Page) => page.getByRole("status", { name: "Connection" });

/** How many pixels the page is wider than the screen; 0 or less means no sideways scrolling. */
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Taps a link or button once it's there, so a missing one fails as an assertion, never a timeout (TF-5). */
async function tap(target: Locator, what: string): Promise<void> {
  await expect(target, what).toBeVisible();
  await target.click();
}

/** Opens a search screen at its address. */
async function openSearch(page: Page, address: string): Promise<void> {
  await page.goto(address);
  await expect(page.getByRole("heading", { level: 1 }), "the search screen").toHaveText("Search");
}

/** A category's screen for a character, by its address. */
async function openCategory(page: Page, characterId: string, category: string, heading: string): Promise<void> {
  await page.goto(`/#/characters/${characterId}/${category}`);
  await expect(page.getByRole("heading", { level: 1 }), `the ${heading} screen`).toHaveText(heading, {
    timeout: 15_000,
  });
}

/** Adds an entry on the category screen showing; `more` fills the category's own fields. */
async function addEntry(page: Page, name: string, more?: (form: Locator) => Promise<void>): Promise<void> {
  await page.getByRole("button", { name: "Add an entry" }).click();
  const form = page.getByRole("form", { name: "New entry" });
  await expect(form, "the form for a new entry").toBeVisible();
  await form.getByLabel("Name", { exact: true }).fill(name);
  await more?.(form);
  await form.getByRole("button", { name: "Add entry" }).click();
  await expect(entryRows(page).filter({ hasText: name }), `${name} in the list`).toBeVisible();
}

/** The rows of the category list showing. */
const entryRows = (page: Page) => page.getByRole("main").getByRole("list").first().getByRole("listitem");

/** Retires a character from its page (CH-5). */
async function retire(page: Page, characterId: string, name: string): Promise<void> {
  await page.goto(`/#/characters/${characterId}`);
  await expect(page.getByRole("heading", { level: 1 }), `${name}'s page`).toHaveText(name);
  await page.getByRole("button", { name: "Retire" }).click();
  await expect(page.getByRole("button", { name: "Bring back" }), `${name}, retired`).toBeVisible();
}

/** The search results listed. */
const results = (page: Page) => page.getByRole("list", { name: "Results" }).getByRole("listitem");

/** The search box on a search screen. */
const searchBox = (page: Page) => page.getByRole("searchbox", { name: "Search" });

/** The date the phone shows for today, as the sheet's footer writes it (EX-3). */
const todayOnSheet = (page: Page) =>
  page.evaluate(() => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));

/** Today's date on the phone as YYYY-MM-DD, as file names use it. */
const todayInName = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });

/** Taps a Save link and returns what was downloaded: its name and bytes. */
async function save(page: Page, link: Locator, what: string): Promise<{ name: string; bytes: Uint8Array }> {
  await expect(link, `the link to save ${what}`).toBeVisible({ timeout: 15_000 });
  const download = page.waitForEvent("download");
  await link.click();
  const file = await download;
  const path = await file.path();
  return { name: file.suggestedFilename(), bytes: new Uint8Array(readFileSync(path)) };
}

/** The text drawn on each page of a PDF, one string per page (the standard fonts draw hex strings with Tj). */
async function pdfPageTexts(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const latin1 = new TextDecoder("latin1");
  return doc.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
    return streams
      .map((stream) => {
        if (!(stream instanceof PDFRawStream)) return "";
        const operators = latin1.decode(decodePDFRawStream(stream).decode());
        return [...operators.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)]
          .map((m) => latin1.decode(Uint8Array.from(m[1]!.match(/../g) ?? [], (h) => parseInt(h, 16))))
          .join("\n");
      })
      .join("\n");
  });
}

/** The print and export screen's printable sheet form. */
const sheetForm = (page: Page) => page.getByRole("form", { name: "Printable sheet" });

/** The print and export screen's JSON form. */
const jsonForm = (page: Page) => page.getByRole("form", { name: "JSON export" });

/** Makes the PDF on the print and export screen showing, and saves it. */
async function savePdf(page: Page, options: { character?: string; paper?: "Letter" | "A4" } = {}) {
  const form = sheetForm(page);
  await expect(form, "the printable sheet form").toBeVisible();
  if (options.character !== undefined) await form.getByLabel("Characters").selectOption({ label: options.character });
  if (options.paper !== undefined) await form.getByLabel("Paper").selectOption({ label: options.paper });
  await form.getByRole("button", { name: "Create PDF" }).click();
  return save(page, form.getByRole("link", { name: /^Save .*\.pdf$/ }), "the PDF");
}

/** Makes the JSON file on the print and export screen showing, saves it and reads it. */
async function saveJson(page: Page) {
  const form = jsonForm(page);
  await expect(form, "the JSON export form").toBeVisible();
  await form.getByRole("button", { name: "Create JSON file" }).click();
  const file = await save(page, form.getByRole("link", { name: /^Save .*\.json$/ }), "the JSON file");
  return {
    name: file.name,
    data: JSON.parse(new TextDecoder().decode(file.bytes)) as {
      formatVersion: number;
      characters: { character: { name: string }; entries: { name?: string; quantity: number }[] }[];
    },
  };
}

// ---------------------------------------------------------------- search (SE)

browserRule(
  { req: ["TF-13", "SE-1"], m: "M3" },
  "a player searches Wren's inventory from the character's page: results update as they type, with categories",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openCategory(page, wren, "weapons", "Weapons");
    await addEntry(page, "Duskfang");
    await addEntry(page, "Twin Fangs");
    await openCategory(page, wren, "consumables", "Consumables");
    await addEntry(page, "Dusk Tonic");

    await page.goto(`/#/characters/${wren}`);
    await tap(
      page.getByRole("navigation", { name: "Inventory" }).getByRole("link", { name: "Search" }),
      "the search link on Wren's page",
    );
    await expect(page.getByRole("heading", { level: 1 }), "the search screen").toHaveText("Search");
    await expect(searchBox(page), "the search box, ready to type in").toBeFocused();

    await searchBox(page).fill("dusk");
    await expect(results(page), `Wren's results for "dusk"`).toHaveText([
      /Dusk Tonic.*Consumables/s,
      /Duskfang.*Weapons/s,
    ]);
    await searchBox(page).fill("fang");
    // Twin Fangs starts a word with "fang"; Duskfang has it inside a word (SE-1).
    await expect(results(page), `Wren's results for "fang", in order`).toHaveText([
      /Twin Fangs.*Weapons/s,
      /Duskfang.*Weapons/s,
    ]);
    await searchBox(page).fill("fangs");
    await expect(results(page), `Wren's results for "fangs"`).toHaveText([/Twin Fangs/]);
    await searchBox(page).fill("nothing like it");
    await expect(results(page), `Wren's results for "nothing like it"`).toHaveCount(0);
    await expect(page.getByRole("main"), "the search screen with no results").toContainText(/no results/i);

    await searchBox(page).fill("duskf");
    await results(page)
      .getByRole("link", { name: /Duskfang/ })
      .click();
    await expect(page.getByRole("heading", { level: 1 }), "the result's entry page").toHaveText("Duskfang");
  },
);

browserRule(
  { req: ["TF-13", "SE-2", "CH-5"], m: "M3" },
  "searching all characters finds a retired character's entry and names the character",
  async ({ page }) => {
    await signUp(page);
    const isolde = await addCharacter(page, { name: "Isolde", className: "Mage", level: 13 });
    await openCategory(page, isolde, "items", "Items");
    await addEntry(page, "Glass Orb");
    await retire(page, isolde, "Isolde");
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });

    await openSearch(page, `/#/characters/${wren}/search`);
    await searchBox(page).fill("orb");
    await expect(page.getByRole("main"), "Wren's search for orb").toContainText(/no results/i);
    await expect(results(page), `Wren's results for "orb"`).toHaveCount(0);
    await page.getByLabel("Search all my characters").check();
    await expect(searchBox(page), "the search box keeps what was typed").toHaveValue("orb");
    await expect(results(page), `results for "orb" across every character`).toHaveText([/Glass Orb.*Items.*Isolde/s]);

    // From the characters list, the search starts across every character.
    await page.goto("/#/characters");
    await tap(page.getByRole("link", { name: "Search all characters" }), "the link to search every character");
    await expect(page.getByRole("heading", { level: 1 }), "the search screen for every character").toHaveText("Search");
    await searchBox(page).fill("glass");
    await expect(results(page), `results for "glass" across every character`).toHaveText([/Glass Orb.*Isolde/s]);
    await results(page)
      .getByRole("link", { name: /Glass Orb/ })
      .click();
    await expect(page.getByRole("heading", { level: 1 }), "Isolde's Glass Orb").toHaveText("Glass Orb");
    await expect(page).toHaveURL(new RegExp(`#/characters/${isolde}/entries/`));
  },
);

browserRule(
  { req: ["TF-13", "SE-3"], m: "M3" },
  "a category's list is filtered by rarity and by item family",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openCategory(page, wren, "weapons", "Weapons");
    await addEntry(page, "Duskfang", async (form) => {
      await form.getByLabel("Rarity").selectOption({ label: "Epic" });
      await form.getByLabel("Item family").fill("Passion");
    });
    await addEntry(page, "Grey Fang", async (form) => {
      await form.getByLabel("Rarity").selectOption({ label: "Legendary" });
      await form.getByLabel("Item family").fill("Passion");
    });
    await addEntry(page, "Hand Axe", async (form) => {
      await form.getByLabel("Item family").fill("Ironwood");
    });
    await expect(entryRows(page), "Wren's weapons, unfiltered").toHaveText([/Duskfang/, /Grey Fang/, /Hand Axe/]);

    const filters = page.getByRole("form", { name: "Filters" });
    await expect(filters, "the filters on Wren's weapons").toBeVisible();
    await filters.getByLabel("Rarity").selectOption({ label: "Epic" });
    await expect(entryRows(page), "Wren's Epic weapons").toHaveText([/Duskfang/]);
    await filters.getByLabel("Rarity").selectOption({ label: "Any rarity" });
    await filters.getByLabel("Item family").selectOption({ label: "Passion" });
    await expect(entryRows(page), "Wren's Passion weapons").toHaveText([/Duskfang/, /Grey Fang/]);
    await filters.getByLabel("Rarity").selectOption({ label: "Legendary" });
    await expect(entryRows(page), "Wren's Legendary Passion weapons").toHaveText([/Grey Fang/]);
    await filters.getByLabel("Item family").selectOption({ label: "Ironwood" });
    await expect(entryRows(page), "Wren's Legendary Ironwood weapons").toHaveCount(0);
    await expect(page.getByRole("main"), "the list with nothing matching").toContainText(/nothing matches/i);
  },
);

browserRule(
  { req: ["SE-3", "IN-12"], m: "M3" },
  "a filter whose last entry is used up stops filtering, so the rest of the list shows again",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openCategory(page, wren, "consumables", "Consumables");
    await addEntry(page, "Smoke Pellet", async (form) => {
      await form.getByLabel("Item family").fill("Shadowcraft");
    });
    await addEntry(page, "Healing Draught");
    const filters = page.getByRole("form", { name: "Filters" });
    await expect(filters, "the filters on Wren's consumables").toBeVisible();
    await filters.getByLabel("Item family").selectOption({ label: "Shadowcraft" });
    await expect(entryRows(page), "Wren's Shadowcraft consumables").toHaveText([/Smoke Pellet/]);
    await entryRows(page).filter({ hasText: "Smoke Pellet" }).getByRole("button", { name: /used/i }).click();
    await expect(entryRows(page), "Wren's consumables once the last Shadowcraft one is used").toHaveText([
      /Healing Draught/,
    ]);
    await expect(filters, "the filters, with no family left to filter by").toBeHidden();
  },
);

// ---------------------------------------------------------------- printable sheet (EX-1 to EX-3)

browserRule(
  { req: ["TF-13", "EX-1", "EX-2", "EX-3"], m: "M3" },
  "a player saves Wren's sheet as an A4 PDF: named for Wren and the day, dated on every page",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3, notes: "Made-up notes." });
    await openCategory(page, wren, "consumables", "Consumables");
    await page.getByRole("button", { name: "Add an entry" }).click();
    const form = page.getByRole("form", { name: "New entry" });
    await form.getByLabel("Name", { exact: true }).fill("Healing Draught");
    await form.getByLabel("Quantity").fill("3");
    await form.getByRole("button", { name: "Add entry" }).click();
    await expect(entryRows(page).filter({ hasText: "Healing Draught" }), "Healing Draughts").toContainText("× 3");

    await page.goto(`/#/characters/${wren}`);
    await tap(page.getByRole("link", { name: "Print or export" }), "the print or export link on Wren's page");
    await expect(page.getByRole("heading", { level: 1 }), "the print and export screen").toHaveText("Print and export");
    await expect(
      sheetForm(page).getByLabel("Characters").locator("option:checked"),
      "the character chosen from Wren's page",
    ).toHaveText("Wren");
    const pdf = await savePdf(page, { paper: "A4" });
    expect(pdf.name, "the PDF's file name").toBe(`Wren ${await todayInName(page)}.pdf`);
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 5)), "the file's first bytes").toBe("%PDF-");
    const doc = await PDFDocument.load(pdf.bytes);
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)], "the page size in points (A4)").toEqual([595, 842]);
    const pages = await pdfPageTexts(pdf.bytes);
    const today = await todayOnSheet(page);
    pages.forEach((text, i) => expect(text, `page ${i + 1}'s creation date`).toContain(`Created ${today}`));
    for (const text of ["Wren", "Rogue, level 3", "3 x Healing Draught", "Made-up notes."]) {
      expect(pages[0], `Wren's sheet showing ${text}`).toContain(text);
    }
  },
);

browserRule(
  { req: ["TF-13", "EX-1", "CH-5"], m: "M3" },
  "the sheet for all characters has every character that isn't retired, each on its own page",
  async ({ page }) => {
    await signUp(page);
    const brin = await addCharacter(page, { name: "Brin", className: "Warrior", level: 8 });
    await retire(page, brin, "Brin");
    await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await addCharacter(page, { name: "Isolde", className: "Mage", level: 13 });

    await page.getByRole("link", { name: "Account" }).click();
    await tap(page.getByRole("link", { name: "Print or export" }), "the print or export link on the account page");
    await expect(page.getByRole("heading", { level: 1 }), "the print and export screen").toHaveText("Print and export");
    const pdf = await savePdf(page, { character: "All characters (not retired)", paper: "Letter" });
    expect(pdf.name, "the PDF's file name").toBe(`AWT characters ${await todayInName(page)}.pdf`);
    const pages = await pdfPageTexts(pdf.bytes);
    expect(
      pages.map((text) => text.split("\n")[0]),
      "the character starting each page",
    ).toEqual(["Isolde", "Wren"]);
    expect(pages.join("\n"), "the sheet mentioning retired Brin").not.toContain("Brin");
  },
);

// ---------------------------------------------------------------- JSON export (EX-4)

browserRule(
  { req: ["TF-13", "EX-4"], m: "M3" },
  "a player downloads the JSON export from the account page, with its format version and their entries",
  async ({ page }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openCategory(page, wren, "items", "Items");
    await addEntry(page, "Silk Rope");
    await page.getByRole("link", { name: "Account" }).click();
    await tap(page.getByRole("link", { name: "Print or export" }), "the print or export link on the account page");
    const file = await saveJson(page);
    expect(file.name, "the JSON file's name").toBe(`AWT inventory ${await todayInName(page)}.json`);
    expect(file.data.formatVersion, "the format version").toBe(1);
    expect(
      file.data.characters.map((c) => c.character.name),
      "characters in the export",
    ).toEqual(["Wren"]);
    expect(
      file.data.characters[0]!.entries.map((e) => [e.name, e.quantity]),
      "Wren's entries in the export",
    ).toEqual([["Silk Rope", 1]]);
  },
);

browserRule(
  { req: ["NF-3", "EX-2", "EX-4"], m: "M3" },
  "without signal, the sheet and the JSON file are still made and saved",
  async ({ page, context }) => {
    await signUp(page);
    const wren = await addCharacter(page, { name: "Wren", className: "Rogue", level: 3 });
    await openCategory(page, wren, "items", "Items");
    await addEntry(page, "Silk Rope");
    await expect(connection(page), "Wren's records, sent").toBeHidden({ timeout: 20_000 });
    await context.setOffline(true);
    await page.goto(`/#/characters/${wren}`);
    await expect(page.getByRole("heading", { level: 1 }), "Wren's page offline").toHaveText("Wren");
    await tap(page.getByRole("link", { name: "Print or export" }), "the print or export link on Wren's page offline");
    const pdf = await savePdf(page);
    expect((await pdfPageTexts(pdf.bytes))[0], "Wren's sheet made offline").toContain("Silk Rope");
    const file = await saveJson(page);
    expect(
      file.data.characters[0]!.entries.map((e) => e.name),
      "Wren's entries in the export made offline",
    ).toEqual(["Silk Rope"]);
  },
);

// ---------------------------------------------------------------- phone and help (NF-1, DOC-1)

browserRule(
  { req: ["NF-1", "DOC-1"], m: "M3" },
  "the search, filter and export screens fit a phone, and search and export link to their help page",
  async ({ page }) => {
    await signUp(page);
    const name = "Wren".padEnd(100, "thewanderer");
    const entry = "Draught".padEnd(100, "ofhealing");
    const wren = await addCharacter(page, { name, className: "Rogue", level: 3 });
    await openCategory(page, wren, "weapons", "Weapons");
    await addEntry(page, entry, async (form) => {
      await form.getByLabel("Item family").fill("Family".padEnd(60, "ofblades"));
    });

    const screens: [string, string, string, (() => Promise<void>) | null][] = [
      ["a character's search", `/#/characters/${wren}/search`, "Search", () => searchBox(page).fill("draught")],
      ["the search across characters", "/#/search", "Search", () => searchBox(page).fill("draught")],
      ["the print and export screen", `/#/export/${wren}`, "Print and export", () => savePdf(page).then(() => {})],
      ["the print and export screen for everyone", "/#/export", "Print and export", null],
      ["a filtered category", `/#/characters/${wren}/weapons`, "Weapons", null],
    ];
    for (const [what, address, heading, fill] of screens) {
      await page.goto("/#/");
      await page.goto(address);
      await expect(page.getByRole("heading", { level: 1 }), `the heading on ${what}`).toHaveText(heading);
      await fill?.();
      if (heading === "Search") await expect(results(page), `the long result on ${what}`).toHaveCount(1);
      expect(await overflow(page), `pixels ${what} is wider than the screen`).toBeLessThanOrEqual(0);
      if (heading === "Weapons") continue;
      await page.getByRole("link", { name: /help/i }).click();
      await expect(page.getByRole("heading", { level: 1 }), `the help page ${what} links to`).toHaveText(
        "Search and export",
      );
    }
  },
);
