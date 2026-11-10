// Search and export (section 10: SE-1 to SE-3, EX-1 to EX-5), through the
// data layer. The PDF is checked as data (SheetDocument) and as a file.

import { PDFDocument } from "pdf-lib";
import { expect } from "vitest";
import { rule } from "../support/rule";
import { seedCharacter, seedProfile, world } from "../support/world";

async function bramWithTwo(options: { full?: boolean; showSkillText?: boolean } = {}) {
  const w = world({ showSkillText: options.showSkillText ?? false });
  const bram = w.as("bram");
  await seedProfile(bram, "bram");
  const aldric = await seedCharacter(bram, "aldric", options);
  const isolde = await seedCharacter(bram, "isolde", options);
  return { w, bram, aldric, isolde };
}

// ---------------------------------------------------------------- search (SE)

rule(
  { req: ["SE-1"], m: "M3" },
  "searching a character finds entries by name, description and notes, skills included, with their category",
  async () => {
    const { bram, aldric } = await bramWithTwo();
    const id = aldric.character.id;
    await bram.updateEntry(aldric.entries.get("aldric-lantern")!.id, {
      description: "Made-up text about a dusk lamp.",
    });
    await bram.updateEntry(aldric.entries.get("aldric-shard")!.id, { notes: "Trade at dusk" });
    const results = await bram.search("dusk", { characterId: id });
    expect(results.map((r) => [r.name, r.category, r.matched]).sort(), "Aldric's results for dusk").toEqual([
      ["Duskfang", "weapons", ["name"]],
      ["Ember Shard", "components", ["notes"]],
      ["Hooded Lantern", "items", ["description"]],
    ]);
    const skills = await bram.search("guard", { characterId: id });
    expect(
      skills.map((r) => [r.name, r.category]),
      "Aldric's results for guard",
    ).toEqual([["Iron Guard", "skills"]]);
  },
);

rule({ req: ["SE-1"], m: "M3" }, "search ignores case and matches the start of a word as it's typed", async () => {
  const { bram, aldric } = await bramWithTwo();
  for (const query of ["D", "Du", "DUSKF"]) {
    const names = (await bram.search(query, { characterId: aldric.character.id })).map((r) => r.name);
    expect(names, `Aldric's results for "${query}"`).toContain("Duskfang");
  }
});

rule(
  { req: ["SE-2", "CH-5"], m: "M3" },
  "searching all characters includes retired ones, and each result names its character",
  async () => {
    const { bram, aldric } = await bramWithTwo();
    await bram.retireCharacter(aldric.character.id);
    const results = await bram.search("o", { allCharacters: true });
    const pairs = results.map((r) => `${r.characterName}: ${r.name}`);
    expect(pairs, "results across Bram's characters").toEqual(
      expect.arrayContaining(["Aldric: Old Mule", "Isolde: Glass Orb"]),
    );
  },
);

rule({ req: ["SE-3"], m: "M3" }, "a category list can be filtered by rarity and by item family", async () => {
  const { bram, aldric } = await bramWithTwo();
  const id = aldric.character.id;
  const epic = await bram.listEntries(id, "armor", { rarity: "epic" });
  expect(
    epic.map((e) => e.entry.category !== "skills" && e.entry.name),
    "Aldric's Epic armor",
  ).toEqual(["Ironclad Plate"]);
  const ember = await bram.listEntries(id, "armor", { itemFamily: "Emberforged" });
  expect(
    ember.map((e) => e.entry.category !== "skills" && e.entry.name),
    "Aldric's Emberforged armor",
  ).toEqual(["Ember Gauntlets"]);
});

rule({ req: ["SE-3"], m: "M4" }, "a category list can be filtered to what's equipped", async () => {
  const { bram, aldric } = await bramWithTwo({ full: true });
  const worn = await bram.listEntries(aldric.character.id, "armor", { equipped: true });
  expect(
    worn.map((e) => e.entry.category !== "skills" && e.entry.name),
    "Aldric's equipped armor",
  ).toEqual(["Ember Gauntlets", "Hawkeye Helm", "Ironclad Plate", "Stridewalk Boots"]);
});

// ---------------------------------------------------------------- printable sheet (EX-1 to EX-3)

rule(
  { req: ["EX-1"], m: "M3" },
  "the sheet for one character has its name, class, level, categories, skills, titles and notes",
  async () => {
    const { bram, aldric } = await bramWithTwo();
    const sheet = await bram.printableSheet({
      characterIds: [aldric.character.id],
      includeSkillText: false,
      paper: "letter",
    });
    expect(
      sheet.characters.map((c) => c.name),
      "characters on the sheet",
    ).toEqual(["Aldric"]);
    const page = sheet.characters[0]!;
    expect([page.className, page.level, page.notes], "Aldric's class, level and notes").toEqual([
      "Warrior",
      25,
      "Made-up test character.",
    ]);
    const consumables = page.categories.find((c) => c.category === "consumables")?.entries;
    expect(consumables, "Aldric's consumables with quantities").toEqual([{ name: "Healing Draught", quantity: 3 }]);
    const edge = page.skills.find((s) => s.name === "Veteran's Edge");
    expect(edge, "Veteran's Edge on the sheet").toMatchObject({ usage: "passive", tier: "normal" });
    expect(page.titles, "Aldric's titles").toEqual([{ name: "Friend of the Forest", description: "Made-up title." }]);
  },
);

rule({ req: ["EX-1", "CH-5"], m: "M3" }, "the sheet for all characters leaves out retired ones", async () => {
  const { bram, isolde } = await bramWithTwo();
  await bram.createCharacter({ name: "Wren", className: "Rogue", level: 3 });
  await bram.retireCharacter(isolde.character.id);
  const sheet = await bram.printableSheet({ characterIds: "all", includeSkillText: false, paper: "a4" });
  expect(sheet.characters.map((c) => c.name).sort(), "characters on the sheet").toEqual(["Aldric", "Wren"]);
});

rule(
  { req: ["EX-1", "SK-2"], m: "M3" },
  "skill text is on the sheet only when ticked, and only once the owner has agreed",
  async () => {
    const shown = await bramWithTwo({ showSkillText: true });
    const spark = async (b: typeof shown, includeSkillText: boolean) =>
      (
        await b.bram.printableSheet({ characterIds: [b.isolde.character.id], includeSkillText, paper: "letter" })
      ).characters[0]!.skills.find((s) => s.name === "Spark");
    expect((await spark(shown, false))?.text, "Spark's text, not ticked").toBeUndefined();
    expect((await spark(shown, true))?.text, "Spark's text, ticked").toBe(
      "Made-up card text for tests: a small burst of sparks.",
    );
    const hidden = await bramWithTwo({ showSkillText: false });
    expect((await spark(hidden, true))?.text, "Spark's text, ticked, without the owner's agreement").toBeUndefined();
  },
);

rule(
  { req: ["EX-1"], m: "M4" },
  "once totals exist, the sheet shows them with their breakdowns, and what's equipped",
  async () => {
    const { bram, aldric } = await bramWithTwo({ full: true });
    const page = (
      await bram.printableSheet({ characterIds: [aldric.character.id], includeSkillText: false, paper: "letter" })
    ).characters[0]!;
    const cm = page.totals?.find((t) => t.label === "CM");
    expect(cm?.value, "Aldric's CM on the sheet").toBe(170);
    expect(
      cm?.lines.map((l) => [l.label, l.value]),
      "Aldric's CM lines on the sheet",
    ).toEqual([
      ["Combat Bonus", 63],
      ["Armor", 71],
      ["Weapons", 15],
      ["Skills", 11],
      ["Ally", 10],
    ]);
    expect(page.equipped, "Aldric's equipped entries on the sheet").toEqual(
      expect.arrayContaining([
        { slot: "Chest", entry: "Ironclad Plate" },
        { slot: "Main hand", entry: "Duskfang" },
        { slot: "Arcane", entry: "Amber Charm" },
      ]),
    );
  },
);

rule({ req: ["EX-1"], m: "M3" }, "the PDF prints on Letter or A4 paper", async () => {
  const { bram, aldric } = await bramWithTwo();
  for (const [paper, size] of [
    ["letter", [612, 792]],
    ["a4", [595.28, 841.89]],
  ] as const) {
    const pdf = await bram.printablePdf({ characterIds: [aldric.character.id], includeSkillText: false, paper });
    const doc = await PDFDocument.load(pdf.bytes);
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)], `the ${paper} page size in points`).toEqual(size.map(Math.round));
    expect(doc.getPageCount(), `pages in the ${paper} PDF`).toBe(pdf.pageCount);
  }
});

rule(
  { req: ["EX-2"], m: "M3" },
  "the PDF is a file named for the character and the date, ready to save to the phone",
  async () => {
    const { bram, aldric } = await bramWithTwo();
    const pdf = await bram.printablePdf({
      characterIds: [aldric.character.id],
      includeSkillText: false,
      paper: "letter",
    });
    expect(pdf.mimeType, "the file type").toBe("application/pdf");
    expect(pdf.fileName, "the file name").toMatch(/^Aldric.*2026-06-13.*\.pdf$/);
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 5)), "the file's first bytes").toBe("%PDF-");
  },
);

rule({ req: ["EX-3"], m: "M3" }, "every page of the sheet shows when it was created", async () => {
  const { w, bram } = await bramWithTwo();
  const sheet = await bram.printableSheet({ characterIds: "all", includeSkillText: false, paper: "letter" });
  expect(sheet.createdAt, "when the sheet was created").toBe(w.clock.iso());
  expect(sheet.pageFooter, "the footer on every page").toMatch(/2026-06-13|13 June 2026|June 13, 2026|Jun 13, 2026/);
});

// ---------------------------------------------------------------- JSON export (EX-4)

rule(
  { req: ["EX-4"], m: "M3" },
  "the JSON export holds everything in the account, with its format version",
  async () => {
    const { bram, aldric } = await bramWithTwo();
    await bram.markUsed(aldric.entries.get("aldric-draught")!.id, { note: "raid" });
    const file = await bram.exportJson();
    expect(Object.keys(file).sort(), "the export's top-level fields").toEqual([
      "characters",
      "exportedAt",
      "formatVersion",
      "profile",
      "titles",
      "todo",
    ]);
    expect(file.formatVersion, "the format version").toBe(1);
    expect(file.profile, "the profile in the export").toEqual({ displayName: "Bramblewick" });
    expect(file.characters.map((c) => c.character.name).sort(), "characters in the export").toEqual([
      "Aldric",
      "Isolde",
    ]);
    const aldricOut = file.characters.find((c) => c.character.name === "Aldric")!;
    expect(aldricOut.entries.length, "Aldric's entries in the export").toBe(18);
    expect(
      aldricOut.history.some((r) => r.event === "used" && r.note === "raid"),
      "Aldric's used record",
    ).toBe(true);
    expect(
      file.titles.map((t) => t.name),
      "titles in the export",
    ).toEqual(["Friend of the Forest"]);
  },
);

rule(
  { req: ["EX-4", "GR-2"], m: "M4" },
  "the JSON export includes each entry's grants and the manual grants",
  async () => {
    const { bram, aldric } = await bramWithTwo({ full: true });
    await bram.addManualGrant(aldric.character.id, "DM ruling, Faire 2026", [{ kind: "cm", amount: 5 }]);
    const out = (await bram.exportJson()).characters.find((c) => c.character.name === "Aldric")!;
    const sword = out.entries.find((e) => e.category === "weapons" && e.name === "Duskfang");
    expect(
      sword && "grants" in sword && sword.grants?.map((g) => [g.kind, "amount" in g && g.amount]),
      "Duskfang's grants",
    ).toEqual([["cm", 15]]);
    expect(
      out.manualGrants.map((m) => m.reason),
      "Aldric's manual grants",
    ).toEqual(["DM ruling, Faire 2026"]);
  },
);

rule({ req: ["EX-4", "PV-1"], m: "M3" }, "the export never includes another user's records", async () => {
  const { w, bram } = await bramWithTwo();
  const cass = w.as("cass");
  await seedProfile(cass, "cass");
  await seedCharacter(cass, "brin");
  const text = JSON.stringify(await bram.exportJson());
  for (const other of ["Brin", "Thornneedle", "Cassia Vane", "cass@example.test"]) {
    expect(text, `Bram's export mentioning ${other}`).not.toContain(other);
  }
});
